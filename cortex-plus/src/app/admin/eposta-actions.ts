"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { isFeatureEnabled, MARKETING_EMAIL_FLAG } from "@/lib/admin/feature-flags";
import { checkFounderActor } from "@/lib/auth/admin-actor";
import {
  cancelCampaign,
  campaignProgress,
  createCampaign,
  previewAudience,
  processCampaign,
  sendSingleMail,
  sendTestMail,
  singleInputSchema,
  validateCampaign,
  type AudiencePreview,
  type CampaignProgress,
} from "@/lib/email/campaign";
import { REFERRAL_CAP_MAX, REFERRAL_CAP_MIN } from "@/lib/email/referral-cap";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/*
  Yönetimden e-posta (7 Kasım 2026): yalnız kurucu. Her eylem kimliği ve PIN kapısını ister (`checkFounderActor`),
  her gönderim denetim kaydına yazılır. Toplu gönderimde kurucunun onayladığı kişi sayısı gönderim anında yeniden
  sayılır: arada değiştiyse gönderilmez (kayıt olanlar, izin değiştirenler).
*/

type Fail = { ok: false; error: string };

export type PreviewResult =
  | { ok: true; preview: AudiencePreview; warning: string | null; marketingOpen: boolean }
  | Fail;

export async function previewEmailCampaign(raw: unknown): Promise<PreviewResult> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  const parsed = validateCampaign(raw);
  if (!parsed.ok) return parsed;

  const service = createServiceClient();
  const preview = await previewAudience(service, parsed.value.kind, parsed.value.audience);
  if (!preview) return { ok: false, error: "Hedef kitle okunamadı. Birkaç saniye sonra yeniden dene." };
  // Kampanya anahtarı kapalıysa önizleme yine çalışır ama arayüz gönderimin neden açılmadığını söyler.
  const marketingOpen =
    parsed.value.kind !== "marketing" || (await isFeatureEnabled(service, MARKETING_EMAIL_FLAG).catch(() => false));
  return { ok: true, preview, warning: parsed.warning, marketingOpen };
}

export async function sendEmailTest(raw: unknown): Promise<{ ok: true; to: string } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;

  const input = raw as { kind?: unknown; subject?: unknown; body?: unknown; ctaLabel?: unknown; ctaPath?: unknown };
  const parsed = validateCampaign({
    kind: input.kind === "marketing" ? "marketing" : "service",
    subject: input.subject,
    body: input.body,
    ctaLabel: input.ctaLabel ?? "",
    ctaPath: input.ctaPath ?? "",
    // Deneme tek kişiye gider: sınava kalan gün örnek değerle dolar, bu yüzden tarih şartı aranmaz.
    audience: { plan: "all", signupDays: null, examDays: 30 },
  });
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Hesabının e-posta adresi okunamadı." };

  const result = await sendTestMail(
    user.email,
    {
      kind: parsed.value.kind,
      subject: parsed.value.subject,
      body: parsed.value.body,
      ctaLabel: parsed.value.ctaLabel,
      ctaPath: parsed.value.ctaPath,
    },
    { firstName: String(user.user_metadata?.full_name ?? "").split(" ")[0] || null, daysToExam: 30, userId: user.id },
  );
  if (!result.ok) return { ok: false, error: "Deneme e-postası gönderilemedi. E-posta altyapısını kontrol et." };

  await auditLog(createServiceClient(), {
    actorId: actor.userId,
    action: "email.test_sent",
    entityType: "email_campaign",
    metadata: { kind: parsed.value.kind, subject: parsed.value.subject },
  });
  return { ok: true, to: user.email };
}

export async function startEmailCampaign(
  raw: unknown,
  confirmedCount: number,
): Promise<{ ok: true; id: string; total: number } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  const parsed = validateCampaign(raw);
  if (!parsed.ok) return parsed;

  const service = createServiceClient();
  const preview = await previewAudience(service, parsed.value.kind, parsed.value.audience);
  if (!preview) return { ok: false, error: "Hedef kitle okunamadı. Birkaç saniye sonra yeniden dene." };
  if (preview.count !== confirmedCount) {
    return {
      ok: false,
      error: `Hedef kitle onayından sonra değişti (${confirmedCount} → ${preview.count}). Önizlemeyi yenileyip yeniden onayla.`,
    };
  }

  const started = await createCampaign(service, actor.userId, parsed.value);
  if (!started.ok) return started;
  revalidatePath("/admin/eposta");
  return started;
}

/** Kuyruğun bir turu (en çok ~45 sn); istemci bitene ya da durana kadar yeniden çağırır. */
export async function continueEmailCampaign(campaignId: string): Promise<{ ok: true; progress: CampaignProgress } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return { ok: false, error: "Gönderim bulunamadı." };

  const service = createServiceClient();
  const progress = await processCampaign(service, campaignId, { deadline: Date.now() + 45_000 });
  if (!progress) return { ok: false, error: "Gönderim bulunamadı." };
  if (progress.status !== "sending") revalidatePath("/admin/eposta");
  return { ok: true, progress };
}

export async function readEmailCampaign(campaignId: string): Promise<{ ok: true; progress: CampaignProgress } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  const progress = await campaignProgress(createServiceClient(), campaignId);
  return progress ? { ok: true, progress } : { ok: false, error: "Gönderim bulunamadı." };
}

export async function stopEmailCampaign(campaignId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await checkFounderActor();
  if (!actor.ok) return { ok: false, error: actor.error };
  const stopped = await cancelCampaign(createServiceClient(), actor.userId, campaignId);
  revalidatePath("/admin/eposta");
  return stopped ? { ok: true } : { ok: false, error: "Gönderim zaten bitmiş ya da durmuş." };
}

/** Davet hediyesinin günlük tavanı (çift sayısı). Anahtarın açık/kapalı durumuna dokunmaz. */
export async function saveReferralGiftCap(raw: unknown): Promise<{ ok: true; message: string } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  const cap = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  if (!Number.isInteger(cap) || cap < REFERRAL_CAP_MIN || cap > REFERRAL_CAP_MAX) {
    return { ok: false, error: `Tavan ${REFERRAL_CAP_MIN}–${REFERRAL_CAP_MAX} arasında bir tam sayı olmalı.` };
  }
  const service = createServiceClient();
  const { data: row, error: readError } = await service
    .from("feature_flags")
    .select("metadata")
    .eq("key", "referral_gifts")
    .maybeSingle();
  if (readError || !row) return { ok: false, error: "Davet anahtarı okunamadı. Veritabanı değişikliği uygulanmamış olabilir." };
  const previous = (row.metadata ?? {}) as Record<string, unknown>;
  const { error } = await service
    .from("feature_flags")
    .update({ metadata: { ...previous, daily_cap: cap }, updated_at: new Date().toISOString() })
    .eq("key", "referral_gifts");
  if (error) return { ok: false, error: "Tavan kaydedilemedi." };
  await auditLog(service, {
    actorId: actor.userId,
    action: "email.referral_cap.saved",
    entityType: "feature_flag",
    entityId: "referral_gifts",
    metadata: { dailyCap: cap, previous: previous.daily_cap ?? null },
  });
  revalidatePath("/admin/eposta");
  return { ok: true, message: `Günlük tavan kaydedildi: ${cap} çift. Bir sonraki hediyeden itibaren geçerli.` };
}

export async function sendSingleEmail(raw: unknown): Promise<{ ok: true; known: boolean } | Fail> {
  const actor = await checkFounderActor();
  if (!actor.ok) return actor;
  const parsed = singleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Alıcı adresini, konuyu ve mesajı (en az 10 karakter) doldur." };

  const result = await sendSingleMail(createServiceClient(), actor.userId, parsed.data);
  if (!result.ok) return result;
  revalidatePath("/admin/eposta");
  return { ok: true, known: result.known };
}
