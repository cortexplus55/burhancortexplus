import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";
import { isFeatureEnabled, MARKETING_EMAIL_FLAG } from "@/lib/admin/feature-flags";
import { resendConfigured, sendEmail } from "@/lib/email/mailer";
import { RESEND_BATCH_SIZE, sendResendBatch, type BatchItem } from "@/lib/email/send-batch";
import { absoluteHref, renderCampaignMail, unknownTokens, type MailKind } from "@/lib/email/templates";
import { signUnsubscribeToken, unsubscribeHeaders, unsubscribePageUrl } from "@/lib/email/unsubscribe";

/*
  Yönetimden e-posta gönderimi (7 Kasım 2026). Kurucu mesajı yazar; iki yol:

  - Tek kişi: bir e-posta adresine (hesabı varsa ad ve sınava kalan gün de kullanılır). Hizmet iletisi sayılır.
  - Toplu: "hizmet duyurusu" (hesabı doğrulanmış herkese; yalnız hesapla ilgili bilgi) ya da "kampanya" (yalnız
    kampanya izni verenlere, `marketing_email` anahtarı açıkken, her e-postada tek tıkla çıkış bağlantısıyla).

  Gönderim kuyrukla yürür (`email_campaign_*` SQL işlevleri): alıcılar satır satır sahiplenilir, 100'erli paketle gider,
  yarıda kalan gönderim kaldığı yerden sürer, iki istek aynı alıcıyı almaz. Günlük kota dolarsa gönderim durur ve
  hiçbir alıcı kaybolmaz.
*/

export const CAMPAIGN_AUDIENCE_PLANS = ["all", "free", "paid"] as const;

export const audienceSchema = z.object({
  plan: z.enum(CAMPAIGN_AUDIENCE_PLANS).default("all"),
  signupDays: z.number().int().min(1).max(3650).nullable().default(null),
  examDays: z.number().int().min(1).max(730).nullable().default(null),
});
export type CampaignAudience = z.infer<typeof audienceSchema>;

const textField = (min: number, max: number) => z.string().trim().min(min).max(max);

export const campaignInputSchema = z.object({
  kind: z.enum(["service", "marketing"]),
  subject: textField(3, 120),
  body: textField(10, 8000),
  ctaLabel: z.string().trim().max(40).default(""),
  ctaPath: z.string().trim().max(300).default(""),
  audience: audienceSchema,
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const singleInputSchema = z.object({
  to: z.string().trim().toLowerCase().email().max(254),
  subject: textField(3, 120),
  body: textField(10, 8000),
  ctaLabel: z.string().trim().max(40).default(""),
  ctaPath: z.string().trim().max(300).default(""),
});
export type SingleInput = z.infer<typeof singleInputSchema>;

/** Hizmet duyurusu hesapla ilgili bilgi içindir; kampanya gibi okunan metin için yumuşak uyarı (engel değil). */
const PROMOTIONAL = /(kampanya|indirim|fırsat|promosyon|hediye|kazan|kod[ua]?\s|%\s?\d)/i;

export function promotionalWarning(kind: "service" | "marketing" | "single", text: string): string | null {
  if (kind === "marketing") return null;
  return PROMOTIONAL.test(text)
    ? "Bu metin kampanya gibi okunuyor. Hizmet duyurusu yalnız hesapla ilgili bilgi içindir (bakım, güvenlik, ödeme, yasal değişiklik); kampanya ya da duyuruysa türü «Kampanya» seç."
    : null;
}

function ctaProblem(label: string, path: string): string | null {
  if (!label && !path) return null;
  if (!label || !path) return "Düğme için hem yazıyı hem adresi doldur ya da ikisini de boş bırak.";
  if (!absoluteHref(path)) return "Düğmenin adresi yalnız cortexplus.app içinde olabilir (ör. /ogretmen).";
  return null;
}

function tokenProblem(subject: string, body: string, hasExamDate: boolean): string | null {
  const unknown = unknownTokens(`${subject}\n${body}`);
  if (unknown.length) return `Tanınmayan yer tutucu: ${unknown.join(", ")}. Kullanılabilenler: {ad} ve {gün}.`;
  if (/\{g[üu]n\}/i.test(`${subject}\n${body}`) && !hasExamDate) {
    return "{gün} yalnız sınav tarihi olan öğrencilere yazılabilir. Hedef kitlede «Sınavına en çok kaç gün kalanlar» kutusunu doldur.";
  }
  return null;
}

export function validateCampaign(raw: unknown): { ok: true; value: CampaignInput; warning: string | null } | { ok: false; error: string } {
  const parsed = campaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${fieldLabel(first.path[0])}: geçerli bir değer gir.` : "Bilgiler geçersiz." };
  }
  const value = parsed.data;
  const problem =
    ctaProblem(value.ctaLabel, value.ctaPath) ?? tokenProblem(value.subject, value.body, value.audience.examDays !== null);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value, warning: promotionalWarning(value.kind, `${value.subject}\n${value.body}`) };
}

function fieldLabel(field: unknown): string {
  return (
    { subject: "Konu", body: "Mesaj", ctaLabel: "Düğme yazısı", ctaPath: "Düğme adresi", to: "Alıcı", audience: "Hedef kitle", kind: "Tür" } as Record<string, string>
  )[String(field)] ?? "Alan";
}

/** Adres panelde bile tam görünmez (ekran görüntüsüne sızmasın): `a***@gmail.com`. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export type AudiencePreview = {
  count: number;
  sample: { email: string; firstName: string | null; daysToExam: number | null }[];
};

export async function previewAudience(
  service: SupabaseClient,
  kind: "service" | "marketing",
  audience: CampaignAudience,
): Promise<AudiencePreview | null> {
  const params = { p_kind: kind, p_plan: audience.plan, p_signup_days: audience.signupDays, p_exam_days: audience.examDays };
  const [{ data: count, error: countError }, { data: sample, error: sampleError }] = await Promise.all([
    service.rpc("email_audience_count", params),
    service.rpc("email_audience_sample", { ...params, p_limit: 5 }),
  ]);
  if (countError || sampleError) {
    console.error("email_audience_failed", { count: countError?.message, sample: sampleError?.message });
    return null;
  }
  return {
    count: Number(count ?? 0),
    sample: ((sample ?? []) as { email: string; first_name: string | null; days_to_exam: number | null }[]).map((row) => ({
      email: maskEmail(row.email),
      firstName: row.first_name,
      daysToExam: row.days_to_exam,
    })),
  };
}

export type CampaignProgress = {
  id: string;
  status: "sending" | "sent" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  stopReason: string | null;
};

/** Gönderimin güncel sayıları; yoksa null. */
export async function campaignProgress(service: SupabaseClient, campaignId: string): Promise<CampaignProgress | null> {
  const { data, error } = await service.rpc("email_campaign_refresh", { p_campaign: campaignId });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { campaign_status: CampaignProgress["status"]; total_count: number; sent_count: number; failed_count: number; skipped_count: number; remaining_count: number }
    | undefined;
  if (error || !row) return null;
  const { data: campaign } = await service.from("email_campaigns").select("stop_reason").eq("id", campaignId).maybeSingle();
  return {
    id: campaignId,
    status: row.campaign_status,
    total: row.total_count,
    sent: row.sent_count,
    failed: row.failed_count,
    skipped: row.skipped_count,
    remaining: row.remaining_count,
    stopReason: (campaign?.stop_reason as string | null) ?? null,
  };
}

export type CampaignStartResult = { ok: true; id: string; total: number } | { ok: false; error: string };

export async function createCampaign(service: SupabaseClient, actorId: string, input: CampaignInput): Promise<CampaignStartResult> {
  if (!resendConfigured()) {
    return { ok: false, error: "Toplu gönderim için e-posta altyapısı (Resend) yapılandırılmamış." };
  }
  if (input.kind === "marketing") {
    if (!(await isFeatureEnabled(service, MARKETING_EMAIL_FLAG).catch(() => false))) {
      return {
        ok: false,
        error:
          "Kampanya e-postası kapalı. İYS kaydı tamamlanınca Özellik Anahtarları sayfasındaki «Kampanya e-postası» anahtarını aç.",
      };
    }
    if (!signUnsubscribeToken("00000000-0000-4000-8000-000000000000", "marketing")) {
      return { ok: false, error: "Abonelikten çıkış bağlantısı üretilemiyor (APP_SECRET eksik); kampanya gönderilmez." };
    }
  }

  const preview = await previewAudience(service, input.kind, input.audience);
  if (!preview) return { ok: false, error: "Hedef kitle okunamadı. Birkaç saniye sonra yeniden dene." };
  if (preview.count === 0) return { ok: false, error: "Bu hedef kitlede kimse yok." };

  const { data, error } = await service
    .from("email_campaigns")
    .insert({
      created_by: actorId,
      kind: input.kind,
      subject: input.subject,
      body: input.body,
      cta_label: input.ctaLabel || null,
      cta_path: input.ctaPath || null,
      audience: input.audience,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("email_campaign_create_failed", { error: error?.message });
    return { ok: false, error: "Gönderim kaydı açılamadı." };
  }
  const id = data.id as string;

  const { data: total, error: openError } = await service.rpc("email_campaign_open", {
    p_campaign: id,
    p_kind: input.kind,
    p_plan: input.audience.plan,
    p_signup_days: input.audience.signupDays,
    p_exam_days: input.audience.examDays,
  });
  if (openError) {
    await service.from("email_campaigns").update({ status: "cancelled", stop_reason: "alicilar_yazilamadi" }).eq("id", id);
    return { ok: false, error: "Alıcı listesi hazırlanamadı." };
  }

  await auditLog(service, {
    actorId,
    action: "email.campaign_created",
    entityType: "email_campaign",
    entityId: id,
    metadata: { kind: input.kind, audience: input.audience, recipients: Number(total ?? 0), subject: input.subject },
  });
  return { ok: true, id, total: Number(total ?? 0) };
}

type Claimed = { recipient_id: number; user_id: string | null; email: string | null; first_name: string | null; days_to_exam: number | null };

/**
 * Sıradaki alıcıları sahiplenip gönderir; `deadline`e kadar tur atar. Günlük kota dolarsa alıcıları kuyruğa geri
 * koyup durur (`stopReason: "kota"`); hız sınırı ve geçici hatada kalan alıcılar bir sonraki çağrıda sürer.
 */
export async function processCampaign(
  service: SupabaseClient,
  campaignId: string,
  options: { deadline: number; chunk?: number },
): Promise<CampaignProgress | null> {
  const { data: campaign } = await service
    .from("email_campaigns")
    .select("kind, subject, body, cta_label, cta_path, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign || campaign.status !== "sending") return campaignProgress(service, campaignId);

  const mailKind: MailKind = campaign.kind === "marketing" ? "marketing" : "service";
  const chunk = Math.min(options.chunk ?? RESEND_BATCH_SIZE, RESEND_BATCH_SIZE);
  let stop: string | null = null;

  while (Date.now() < options.deadline && !stop) {
    const { data, error } = await service.rpc("email_campaign_claim", { p_campaign: campaignId, p_limit: chunk });
    if (error) {
      stop = "kuyruk_okunamadi";
      break;
    }
    const claimed = (data ?? []) as Claimed[];
    if (!claimed.length) break;

    const items: BatchItem[] = [];
    const itemIds: number[] = [];
    const unsendable: { id: number; reason: string }[] = [];
    for (const recipient of claimed) {
      if (!recipient.email) {
        unsendable.push({ id: recipient.recipient_id, reason: "adres_yok" });
        continue;
      }
      const token = mailKind === "marketing" && recipient.user_id ? signUnsubscribeToken(recipient.user_id, "marketing") : null;
      if (mailKind === "marketing" && !token) {
        unsendable.push({ id: recipient.recipient_id, reason: "abonelik_baglantisi_yok" });
        continue;
      }
      const mail = renderCampaignMail({
        kind: mailKind,
        subject: String(campaign.subject),
        body: String(campaign.body),
        ctaLabel: (campaign.cta_label as string | null) ?? null,
        ctaPath: (campaign.cta_path as string | null) ?? null,
        context: { firstName: recipient.first_name, daysToExam: recipient.days_to_exam },
        unsubscribeUrl: token ? unsubscribePageUrl(token) : null,
      });
      items.push({ to: recipient.email, subject: mail.subject, html: mail.html, text: mail.text, ...(token ? { headers: unsubscribeHeaders(token) } : {}) });
      itemIds.push(recipient.recipient_id);
    }
    for (const bad of unsendable) await service.rpc("email_campaign_mark", { p_ids: [bad.id], p_status: "failed", p_error: bad.reason });
    if (!items.length) continue;

    const outcome = await sendResendBatch(items, {
      idempotencyKey: `cmp-${campaignId}-${itemIds[0]}-${itemIds[itemIds.length - 1]}-${itemIds.length}`,
    });

    if (!outcome.ok) {
      // Kota ya da geçici hata: alıcılar kuyruğa geri döner, gönderim durur; hiçbiri "başarısız" yazılmaz.
      await service.rpc("email_campaign_mark", { p_ids: itemIds, p_status: "pending", p_error: outcome.detail });
      stop = outcome.reason === "quota" ? "kota" : outcome.reason === "not_configured" ? "resend_yok" : `hata:${outcome.detail}`;
      break;
    }

    const sentIds: number[] = [];
    const sentProviders: string[] = [];
    const failures: { id: number; reason: string }[] = [];
    itemIds.forEach((id, index) => {
      const reason = outcome.errors.get(index);
      if (reason) failures.push({ id, reason });
      else {
        sentIds.push(id);
        sentProviders.push(outcome.ids[index] ?? "");
      }
    });
    if (sentIds.length) await service.rpc("email_campaign_mark_sent", { p_ids: sentIds, p_provider_ids: sentProviders });
    for (const failure of failures) {
      await service.rpc("email_campaign_mark", { p_ids: [failure.id], p_status: "failed", p_error: failure.reason });
    }
  }

  if (stop) await service.from("email_campaigns").update({ stop_reason: stop }).eq("id", campaignId);
  else await service.from("email_campaigns").update({ stop_reason: null }).eq("id", campaignId).not("stop_reason", "is", null);
  return campaignProgress(service, campaignId);
}

export async function cancelCampaign(service: SupabaseClient, actorId: string, campaignId: string): Promise<boolean> {
  const { data, error } = await service
    .from("email_campaigns")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending")
    .select("id")
    .maybeSingle();
  if (error || !data) return false;
  await auditLog(service, { actorId, action: "email.campaign_cancelled", entityType: "email_campaign", entityId: campaignId });
  return true;
}

export type SingleResult = { ok: true; id: string; known: boolean } | { ok: false; error: string };

/** Tek kişiye: hesabı varsa ad ve sınava kalan gün kullanılır; hizmet iletisi (izin istemez). Resend ya da SMTP. */
export async function sendSingleMail(service: SupabaseClient, actorId: string, input: SingleInput): Promise<SingleResult> {
  const { data: found } = await service.rpc("email_find_user", { p_email: input.to });
  const user = (Array.isArray(found) ? found[0] : found) as { user_id: string; first_name: string | null; days_to_exam: number | null } | undefined;
  const problem = ctaProblem(input.ctaLabel, input.ctaPath) ?? tokenProblem(input.subject, input.body, typeof user?.days_to_exam === "number");
  if (problem) return { ok: false, error: problem };

  const mail = renderCampaignMail({
    kind: "service",
    subject: input.subject,
    body: input.body,
    ctaLabel: input.ctaLabel || null,
    ctaPath: input.ctaPath || null,
    context: { firstName: user?.first_name ?? null, daysToExam: user?.days_to_exam ?? null },
    unsubscribeUrl: null,
  });

  const { data: campaign, error } = await service
    .from("email_campaigns")
    .insert({
      created_by: actorId,
      kind: "single",
      subject: input.subject,
      body: input.body,
      cta_label: input.ctaLabel || null,
      cta_path: input.ctaPath || null,
      audience: { to: user ? "hesapli" : "hesapsiz" },
      total: 1,
    })
    .select("id")
    .single();
  if (error || !campaign) return { ok: false, error: "Gönderim kaydı açılamadı." };
  const id = campaign.id as string;
  await service.from("email_campaign_recipients").insert({ campaign_id: id, user_id: user?.user_id ?? null, email: user ? null : input.to, status: "claimed", claimed_at: new Date().toISOString() });

  const result = await sendEmail({ to: input.to, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `single-${id}` });
  const { data: recipient } = await service.from("email_campaign_recipients").select("id").eq("campaign_id", id).maybeSingle();
  if (recipient) {
    if (result.ok) await service.rpc("email_campaign_mark_sent", { p_ids: [recipient.id], p_provider_ids: [] });
    else await service.rpc("email_campaign_mark", { p_ids: [recipient.id], p_status: "failed", p_error: result.reason });
  }
  await service.rpc("email_campaign_refresh", { p_campaign: id });
  await auditLog(service, {
    actorId,
    action: "email.single_sent",
    entityType: "email_campaign",
    entityId: id,
    metadata: { known_account: Boolean(user), ok: result.ok, subject: input.subject },
  });
  return result.ok ? { ok: true, id, known: Boolean(user) } : { ok: false, error: "E-posta gönderilemedi. Adresi ve e-posta altyapısını kontrol et." };
}

/** Kendine deneme: gerçek şablonla, örnek değerlerle; kurucunun kendi adresine. */
export async function sendTestMail(
  to: string,
  input: { kind: "service" | "marketing"; subject: string; body: string; ctaLabel: string; ctaPath: string },
  sample: { firstName: string | null; daysToExam: number | null; userId: string },
): Promise<{ ok: boolean }> {
  const token = input.kind === "marketing" ? signUnsubscribeToken(sample.userId, "marketing") : null;
  const mail = renderCampaignMail({
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    ctaLabel: input.ctaLabel || null,
    ctaPath: input.ctaPath || null,
    context: { firstName: sample.firstName ?? "Ayşe", daysToExam: sample.daysToExam ?? 30 },
    unsubscribeUrl: token ? unsubscribePageUrl(token) : null,
  });
  const result = await sendEmail({
    to,
    subject: `[Deneme] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
    ...(token ? { headers: unsubscribeHeaders(token) } : {}),
  });
  return { ok: result.ok };
}

export type CampaignRow = {
  id: string;
  kind: "service" | "marketing" | "single";
  subject: string;
  status: "sending" | "sent" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  stop_reason: string | null;
  created_at: string;
};

export async function listCampaigns(service: SupabaseClient, limit = 15): Promise<CampaignRow[]> {
  const { data } = await service
    .from("email_campaigns")
    .select("id, kind, subject, status, total, sent, failed, skipped, stop_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CampaignRow[];
}
