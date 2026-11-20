import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/app-url";
import { pathSkipKinds } from "@/lib/billing/node-free-meter";
import { isEmailUnverified } from "@/lib/auth/email-verification";
import { sendEmail } from "@/lib/email/mailer";
import {
  allowanceForPurchase,
  purchaseKindFor,
  renderPurchaseMail,
  renderWelcomeMail,
  type LifecycleMailId,
  type PurchaseKind,
  type PurchaseMailInput,
  type WelcomeMailInput,
} from "@/lib/email/lifecycle-templates";
import { renderWelcomeOnboarding } from "@/lib/email/templates/welcome-onboarding";
import { renderPaymentConfirmed, type PaymentConfirmedKind } from "@/lib/email/templates/payment-confirmed";
import { PLAN_WORK_BY_ID, workCount, type PlanWorkId } from "@/lib/billing/plan-value";
import { sigmaBenefitLines } from "@/lib/billing/tier-presentation";
import { claimDispatch, dedupeKeys, settleDispatch, type DispatchDecision } from "@/lib/notifications/dispatch-guard";
import { missingRelation } from "@/lib/learning/missing-column";
import { loadNearestExamCountdown } from "@/lib/learning/exam-countdown-load";
import { loadContinueStep } from "@/lib/learning/prep-cards";
import { runWithBudget } from "@/lib/learning/reminder-facts";
import type { RenderedMail } from "@/lib/email/templates";

/*
  Yaşam döngüsü e-postaları (8 Kasım 2026): hoş geldin, satın alma (paket türüne göre), beta deneme. Hepsi hesapla ilgili
  bilgilendirme (hizmet e-postası: izin istemez), hepsi Resend'den (`sendEmail`) ve her biri bir kez gider (Faz 6, 20 Kasım
  2026'dan beri gönderim kaydı `email_dispatch_log`, işlem kategorisi; hoş geldin ve ödeme yeni şablonlarla): PayTR geri çağrısı yeniden denense, sayfa iki kez açılsa, iki sekme aynı anda bitirse çift
  e-posta çıkmaz. Hiçbiri fırlatmaz: çağıranın akışı (kayıt tamamlama, ödeme "OK"u) e-posta yüzünden bozulmaz.
*/

export type LifecycleOutcome = "sent" | "skipped" | "failed";

type Persona = {
  email: string;
  firstName: string | null;
  via: "google" | "email";
  needsVerification: boolean;
};

async function loadPersona(service: SupabaseClient, userId: string): Promise<Persona | null> {
  const { data } = await service.auth.admin.getUserById(userId);
  const user = data?.user;
  if (!user?.email || user.banned_until) return null;
  const { data: profile } = await service.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const fullName = String(profile?.full_name ?? (user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "");
  const providers = (user.app_metadata?.providers ?? []) as string[];
  return {
    email: user.email,
    firstName: fullName.trim().split(/\s+/)[0] || null,
    via: providers.includes("email") ? "email" : "google",
    needsVerification: isEmailUnverified(user.app_metadata as Record<string, unknown> | undefined),
  };
}

/** Sınava kalan gün ve kaldığı yer: ikisi de okunamazsa e-posta yine gider, yalnız o parça olmaz. */
async function loadPersonalContext(service: SupabaseClient, userId: string, origin: string) {
  const [countdown, step] = await Promise.all([
    loadNearestExamCountdown(service, userId).catch(() => null),
    pathSkipKinds(service, userId)
      .catch(() => new Set<string>())
      .then((skip) => loadContinueStep(service, userId, skip))
      .catch(() => null),
  ]);
  return {
    exam:
      countdown && countdown.state === "countdown" && countdown.daysLeft >= 1
        ? { daysLeft: countdown.daysLeft, title: countdown.examTitle }
        : null,
    next: step ? { heading: step.next.heading, url: `${origin}${step.next.href}` } : null,
  };
}

function urls(origin: string) {
  return {
    ctaUrl: `${origin}/ogretmen`,
    createUrl: `${origin}/deneme-sinavlari/olustur`,
    solveUrl: `${origin}/soru-coz`,
    paymentsUrl: `${origin}/odemeler`,
    renewUrl: `${origin}/pay`,
  };
}

/** "Bir kez" kilidi (işlem e-postası: sessiz saat ve 24 saat kuralı yok, yalnız tekillik). */
type Claim = { userId: string; dedupeKey: string; decision: Extract<DispatchDecision, { ok: true }> };

async function claim(service: SupabaseClient, userId: string, templateKey: string, dedupeKey: string): Promise<Claim | null> {
  const decision = await claimDispatch(service, { userId, templateKey, dedupeKey, category: "transactional" });
  return decision.ok ? { userId, dedupeKey, decision } : null;
}

async function release(service: SupabaseClient, held: Claim, sent: boolean): Promise<void> {
  await settleDispatch(service, { userId: held.userId, dedupeKey: held.dedupeKey }, held.decision, sent);
}

async function deliver(
  service: SupabaseClient,
  held: Claim,
  to: string,
  mail: RenderedMail,
): Promise<LifecycleOutcome> {
  const result = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: held.dedupeKey.slice(0, 200) });
  await release(service, held, result.ok);
  if (!result.ok) console.warn("lifecycle_mail_failed", { key: held.dedupeKey.split(":")[0], reason: result.reason.slice(0, 160) });
  return result.ok ? "sent" : "failed";
}

/** Paket türüne göre ödeme e-postasının kazanım satırları (sayılar kredi tablosundan; elle yazılmaz). */
const BENEFIT_GRID: PlanWorkId[] = ["lesson", "podcast", "oral", "written", "video", "photo"];

export function purchaseBenefits(kind: PaymentConfirmedKind, allowance: number): string[] {
  const fmt = (value: number) => new Intl.NumberFormat("tr-TR").format(value);
  const grid = BENEFIT_GRID.map((id) => `${fmt(workCount(allowance, PLAN_WORK_BY_ID[id]))} ${PLAN_WORK_BY_ID[id].noun}`);
  const lines = [`Bu dönem hakkınla örneğin: ${grid.join(", ")} (her biri tek başına; hepsi aynı haktan düşer).`];
  if (kind === "sigma") lines.push(...sigmaBenefitLines());
  if (kind === "addon") return [`Ek hakkın hesabına eklendi: örneğin ${grid.slice(0, 3).join(", ")} (her biri tek başına).`];
  return lines;
}

/**
 * Hoş geldin: kayıt ve kurulum tamamlanınca bir kez (e-posta ya da Google fark etmez). Gönderim düşerse kayıt
 * silinir; günlük tur (`sendWelcomeCatchUp`) birkaç gün içinde yeniden dener.
 */
export async function sendWelcomeOnce(service: SupabaseClient, userId: string, origin: string = appOrigin()): Promise<LifecycleOutcome> {
  let held: Claim | null = null;
  try {
    held = await claim(service, userId, "welcome_onboarding", dedupeKeys.welcome(userId));
    if (!held) return "skipped";
    const persona = await loadPersona(service, userId);
    if (!persona) {
      await release(service, held, false);
      return "skipped";
    }
    const context = await loadPersonalContext(service, userId, origin);
    // Faz 6: "Hoş geldin {ad}! İlk sınav yolunu 2 dakikada kuralım" (yeni şablon, ilk ders süresiz ücretsiz).
    const mail = renderWelcomeOnboarding({
      firstName: persona.firstName,
      origin,
      unverified: persona.needsVerification,
      daysToExam: context.exam?.daysLeft ?? null,
    });
    return await deliver(service, held, persona.email, mail);
  } catch (error) {
    if (held) await release(service, held, false).catch(() => undefined);
    console.error("lifecycle_welcome_failed", { error: String(error).slice(0, 200) });
    return "failed";
  }
}

type PaymentRow = {
  amount_try?: number | null;
  user_id: string | null;
  beneficiary_user_id: string | null;
  status: string | null;
  plans:
    | { slug?: string | null; name?: string | null; tier?: string | null; billing_period?: string | null; is_premium?: boolean | null; credit_amount?: number | null }
    | { slug?: string | null; name?: string | null; tier?: string | null; billing_period?: string | null; is_premium?: boolean | null; credit_amount?: number | null }[]
    | null;
};

/**
 * Satın alma: ödeme kesinleşince paketin yararlanıcısına (veli ödemesinde öğrenciye) pakete göre değişen e-posta.
 * Sözleşme örneği (`purchase-contract.ts`) ayrı gider; bu e-posta karşılamadır. Sipariş başına bir kez.
 */
export async function sendPurchaseMail(service: SupabaseClient, merchantOid: string, origin: string = appOrigin()): Promise<LifecycleOutcome> {
  try {
    const { data: payment } = await service
      .from("payments")
      .select("user_id, beneficiary_user_id, status, amount_try, plans(slug, name, tier, billing_period, is_premium, credit_amount)")
      .eq("merchant_oid", merchantOid)
      .maybeSingle();
    const row = payment as PaymentRow | null;
    const plan = Array.isArray(row?.plans) ? row?.plans[0] : row?.plans;
    const userId = row?.beneficiary_user_id ?? row?.user_id ?? null;
    if (!row || row.status !== "paid" || !plan || !userId) return "skipped";
    const kind = purchaseKindFor(plan);
    if (!kind) return "skipped";

    const held = await claim(service, userId, "payment_confirmed", dedupeKeys.purchase(merchantOid));
    if (!held) return "skipped";
    try {
      const persona = await loadPersona(service, userId);
      if (!persona) {
        await release(service, held, false);
        return "skipped";
      }
      const { data: audit } = await service
        .from("audit_logs")
        .select("metadata")
        .eq("action", "payment.token.created")
        .eq("entity_id", merchantOid)
        .limit(1)
        .maybeSingle();
      const giftedByParent = (audit?.metadata as { via?: string } | null)?.via === "parent_link";

      let endsAt: string | null = null;
      if (kind !== "addon") {
        const { data: sub } = await service
          .from("subscriptions")
          .select("current_period_end")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("current_period_end", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        endsAt = (sub?.current_period_end as string | null) ?? null;
      }
      const planName = plan.name?.trim() || "Cortex Plus";
      let mail: RenderedMail;
      if (kind === "trial") {
        const context = await loadPersonalContext(service, userId, origin);
        mail = renderPurchaseMail({ kind, firstName: persona.firstName, planName, endsAt, giftedByParent, exam: context.exam, next: context.next, ...urls(origin) });
      } else {
        // Faz 6: "{plan} paketin aktif! Sınav yolunda tüm kilitler açıldı" (tutar KDV dahil, otomatik çekim yok).
        const allowance = allowanceForPurchase({ kind, addonCredits: plan.credit_amount ?? null });
        mail = renderPaymentConfirmed({
          firstName: persona.firstName,
          planName,
          kind,
          amountKurus: Number(row.amount_try ?? 0),
          periodEnd: endsAt,
          benefits: purchaseBenefits(kind, allowance),
          parentPaid: giftedByParent,
          origin,
        });
      }
      return await deliver(service, held, persona.email, mail);
    } catch (error) {
      await release(service, held, false).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("lifecycle_purchase_failed", { merchantOid, error: String(error).slice(0, 200) });
    return "failed";
  }
}

/** Beta kodu ile açılan Plus denemesi: hesap başına bir kez (deneme zaten hesap başına bir kez alınır). */
export async function sendTrialMail(
  service: SupabaseClient,
  userId: string,
  trial: { plusDays: number | null; plusUntil: string | null },
  origin: string = appOrigin(),
): Promise<LifecycleOutcome> {
  if (!trial.plusDays || trial.plusDays < 1) return "skipped";
  let held: Claim | null = null;
  try {
    held = await claim(service, userId, "trial", dedupeKeys.trial(userId));
    if (!held) return "skipped";
    const persona = await loadPersona(service, userId);
    if (!persona) {
      await release(service, held, false);
      return "skipped";
    }
    const context = await loadPersonalContext(service, userId, origin);
    const mail = renderPurchaseMail({
      kind: "trial",
      firstName: persona.firstName,
      planName: "Plus",
      endsAt: trial.plusUntil,
      trialDays: trial.plusDays,
      exam: context.exam,
      next: context.next,
      ...urls(origin),
    });
    return await deliver(service, held, persona.email, mail);
  } catch (error) {
    if (held) await release(service, held, false).catch(() => undefined);
    console.error("lifecycle_trial_failed", { error: String(error).slice(0, 200) });
    return "failed";
  }
}

/**
 * Günlük telafi: kurulumu son 3 günde biten ama hoş geldin e-postası gitmemiş hesaplar (Resend o an düşmüş, sayfa
 * kapanmış olabilir). Son 20 dakika hariç: anlık gönderimle yarışmasın.
 */
export async function sendWelcomeCatchUp(
  service: SupabaseClient,
  options: { deadline: number; limit?: number },
): Promise<{ mailed: number; skipped: number }> {
  const now = Date.now();
  const { data: profiles } = await service
    .from("profiles")
    .select("id")
    .gte("onboarding_completed_at", new Date(now - 3 * 86_400_000).toISOString())
    .lte("onboarding_completed_at", new Date(now - 20 * 60_000).toISOString())
    .order("onboarding_completed_at", { ascending: false })
    .limit(options.limit ?? 100);
  const ids = (profiles ?? []).map((row) => String(row.id));
  if (!ids.length) return { mailed: 0, skipped: 0 };
  const logged = await service.from("email_dispatch_log").select("user_id").in("dedupe_key", ids.map((id) => dedupeKeys.welcome(id)));
  const done = logged.error && missingRelation(logged.error)
    ? (await service.from("email_events").select("user_id").eq("template_key", "once:welcome").in("user_id", ids)).data
    : logged.data;
  const sent = new Set((done ?? []).map((row) => String(row.user_id)));
  const pending = ids.filter((id) => !sent.has(id));
  const result = await runWithBudget(pending, async (id) => (await sendWelcomeOnce(service, id)) === "sent", {
    concurrency: 3,
    deadline: options.deadline,
  });
  return { mailed: result.done, skipped: result.skipped };
}

/** Yönetim önizlemesi: örnek verilerle çizer; hiçbir kayıt yazmaz, kimseye gitmez. */
export function renderLifecycleSample(id: LifecycleMailId, origin: string = appOrigin()): RenderedMail {
  const base = urls(origin);
  const exam = { daysLeft: 23, title: "TYT Biyoloji" };
  const next = { heading: "Hücre zarının yapısı ve seçici geçirgenliği", url: `${origin}/ogretmen` };
  if (id === "welcome") {
    const input: WelcomeMailInput = { firstName: "ayşe", via: "email", needsVerification: true, exam, next: null, ctaUrl: base.ctaUrl, createUrl: base.createUrl, solveUrl: base.solveUrl };
    return renderWelcomeMail(input);
  }
  const kind: PurchaseKind = id;
  const names: Record<PurchaseKind, string> = {
    plus_monthly: "Plus",
    plus_weekly: "Plus",
    plus_yearly: "Plus",
    sigma: "Sigma",
    addon: "Ek Kredi 150",
    trial: "Plus",
  };
  const day = 86_400_000;
  const days = kind === "plus_weekly" ? 7 : kind === "trial" ? 14 : 30;
  const input: PurchaseMailInput = {
    kind,
    firstName: "ayşe",
    planName: names[kind],
    endsAt: kind === "addon" ? null : new Date(Date.now() + days * day).toISOString(),
    trialDays: kind === "trial" ? 14 : null,
    addonCredits: kind === "addon" ? 2500 : null,
    exam,
    next,
    ...base,
  };
  return renderPurchaseMail(input);
}
