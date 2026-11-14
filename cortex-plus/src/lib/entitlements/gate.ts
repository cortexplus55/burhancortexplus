import { freeMeterResetsAt } from "@/lib/billing/free-meters";
import { planIdentity } from "@/lib/student/plan-identity";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { PAID_PLANS, PLUS_QUOTA_WARN_PERCENT, ACTION_METER, actionCost, plusOnly } from "@/lib/entitlements/config";
import type { Action, EntitlementSnapshot, Gate, GateContext, GateReason, MeterSnapshot, ResolvedPlan } from "@/lib/entitlements/types";

/*
  Kapı kararı (Faz 3A). Sunucu gerçektir, tablo hedeftir (OTONOM §9): her dal bugünkü sunucunun verdiği kararı
  verir; ANA-PROMPT tablosundan ayrıldığı her yer `10-entitlements.md` "Tablo–sunucu farkları"nda ve
  `KNOWN_DEVIATION` testlerinde. Ret sırası `reserveCredits` + `credit_reserve_metered` ile aynı:
    kurucu (önizleme kapalı) ve abone → dönem hakkı + bakiye (`credit_reserve`);
    ücretsiz → ders kapısı (bakiye = hediye) → harcama sigortası → okunamayan fotoğraf → Plus'a özel iş → sayaç → bakiye.
  Arayüz bu kararı yalnız GÖSTERİR; işi açıp kapatan yine sunucudur. Sunucu reddederse 402 gövdesindeki `gate`
  (`gateFromRefusal`) kazanır.
*/

/** Profilden plan: kimlik kapsülüyle aynı çözücü (`planIdentity`); `is_admin` = Kurucu görünümü (OTONOM §9 karar 4). */
export function resolvePlan(account: StudentAccountContext | undefined, now: Date = new Date()): ResolvedPlan {
  const identity = planIdentity(account, now);
  return identity.kind === "week" && identity.daysLeft !== null
    ? { plan: "week", weekDaysLeft: identity.daysLeft }
    : { plan: identity.kind };
}

/** Kabuk hesabından kapı girdisi. Sunucuya özel bilgiler (`spendCap`, `photoAbuse`, `firstLesson`) dışarıdan gelir. */
export function snapshotFromAccount(
  account: StudentAccountContext,
  extra: Pick<EntitlementSnapshot, "firstLesson" | "spendCap" | "photoAbuse" | "prices"> = {},
  now: Date = new Date(),
): EntitlementSnapshot {
  const { plan, weekDaysLeft } = resolvePlan(account, now);
  const meters: EntitlementSnapshot["meters"] = {};
  for (const item of account.freeMeters ?? []) {
    if (item.meter === "chat" || item.meter === "photo" || item.meter === "included") {
      meters[item.meter] = { used: item.used, limit: item.limit, resetsAt: item.resetsAtIso };
    }
  }
  const paid = plan === "plus" || plan === "week" || plan === "sigma";
  const allowance = account.quotaAllowance ?? account.subscriptionAllowance ?? (paid ? PAID_PLANS[plan].allowance : 0);
  return {
    plan,
    ...(weekDaysLeft !== undefined ? { weekDaysLeft } : {}),
    ...(account.freePreview ? { freePreview: true } : {}),
    ...(paid
      ? {
          quota: {
            remaining: account.quotaRemaining ?? account.freeAllowanceRemaining,
            allowance: Math.max(1, allowance),
            usedPercent: account.usedPercent,
            ...(account.resetsAtIso ? { resetsAt: account.resetsAtIso } : {}),
          },
        }
      : {}),
    // Önizlemedeki kurucunun cüzdanı hediye değil (SQL ile aynı); kabuk zaten 0 yazar.
    balance: account.freePreview ? 0 : Math.max(0, account.balance),
    ...(Object.keys(meters).length ? { meters } : {}),
    ...extra,
  };
}

const OPEN: Gate = { state: "open", reason: "open" };

function cost(snapshot: EntitlementSnapshot, action: Action): number {
  return snapshot.prices?.[action] ?? actionCost(action);
}

/** Ücretli plan: dönem hakkı + bakiye bedeli karşılıyorsa açık (SQL `credit_reserve`), değilse kilitli. */
function paidGate(snapshot: EntitlementSnapshot, action: Action): Gate {
  const plan = snapshot.plan as "plus" | "week" | "sigma";
  const price = cost(snapshot, action);
  if (price === 0) return OPEN;
  const quota = snapshot.quota;
  const period = PAID_PLANS[plan].period;
  if (!quota) return { state: "limited", reason: "quota_ok", period };
  const usable = quota.remaining + snapshot.balance;
  const base = {
    period,
    limit: quota.allowance,
    remaining: Math.max(0, quota.remaining),
    ...(quota.resetsAt ? { resetAt: quota.resetsAt } : {}),
  } as const;
  if (usable < price) {
    // Sigma'da ve Sınav Haftası'nda teklif yok: yenilenmeyi bekler (Sınav Haftası'na kota sheet'i açılmaz, karar 2).
    if (plan === "plus") return { state: "locked", reason: "plus_quota_100", ...base, requiredPlan: "sigma" };
    return { state: "locked", reason: "quota_reset_wait", ...base };
  }
  // Ek paket ya da hediye %100'ün üstünde de açık tutar (karar 1): uyarı yine %90 eşiğinden.
  const reason: GateReason = plan === "plus" && quota.usedPercent >= PLUS_QUOTA_WARN_PERCENT ? "plus_quota_90" : "quota_ok";
  return { state: "limited", reason, ...base };
}

function dailyMeter(
  meter: MeterSnapshot | undefined,
  name: "chat" | "photo",
  now: Date,
): { remaining: number; limit: number; resetAt: string } | null {
  if (!meter) return null;
  return {
    remaining: Math.max(0, meter.limit - meter.used),
    limit: meter.limit,
    resetAt: meter.resetsAt || freeMeterResetsAt(name, now).toISOString(),
  };
}

/** Bakiye (hediye) işi karşılıyorsa: sunucu sayaç dolunca bakiyeden düşer (`credit_reserve_metered`). */
function giftGate(snapshot: EntitlementSnapshot, price: number): Gate | null {
  if (snapshot.freePreview || price <= 0 || snapshot.balance < price) return null;
  return { state: "limited", reason: "quota_ok", period: "lifetime", remaining: Math.floor(snapshot.balance / price) };
}

function freeGate(snapshot: EntitlementSnapshot, action: Action, context: GateContext, now: Date): Gate {
  const price = cost(snapshot, action);

  if (action === "lesson.create") {
    if (context.otherTopic) return { state: "locked", reason: "free_topic_limit", requiredPlan: "plus" };
    if (context.firstLessonCycle) {
      const included = snapshot.meters?.included;
      if (included && included.used >= included.limit) {
        return { state: "locked", reason: "free_included_limit", period: "day", limit: included.limit, remaining: 0, resetAt: included.resetsAt };
      }
      // İlk dersin adımları ders bittikten sonra da açık (konu testi, kartlar …); "ilk ders duruyor" demek o zaman yanlış.
      return snapshot.firstLesson === "done" ? OPEN : { state: "open", reason: "free_first_lesson_available" };
    }
    // Düğüm bağlamı yoksa: ilk ders kesin bitmediyse açık (karar 3); kilit yalnız sunucu 402'sinde.
    if (snapshot.firstLesson !== "done") {
      return snapshot.firstLesson === null || snapshot.firstLesson === undefined
        ? OPEN
        : { state: "open", reason: "free_first_lesson_available" };
    }
    const gift = giftGate(snapshot, price);
    if (!gift) return { state: "locked", reason: "free_first_lesson_used", requiredPlan: "plus" };
    return snapshot.spendCap ? { state: "locked", reason: "spend_cap" } : gift;
  }

  if (action === "duel.start") {
    // Düello kurmak ders sayacına düşer: bakiye (hediye) yetiyorsa açık, değilse Plus (`freeLessonRefused`).
    const gift = giftGate(snapshot, price);
    if (!gift) return { state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" };
    return snapshot.spendCap ? { state: "locked", reason: "spend_cap" } : gift;
  }

  // Video ucu ücretsiz hesabı ayırmadan önce reddeder (`requireFeature("video")`): harcama sigortasına hiç gelmez.
  if (action === "video.create") return { state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" };

  if (snapshot.spendCap && price > 0) return { state: "locked", reason: "spend_cap" };
  if (action === "photo.solve" && snapshot.photoAbuse) {
    return { state: "locked", reason: "free_photo_abuse_limit", period: "day", resetAt: freeMeterResetsAt("photo", now).toISOString() };
  }
  if (plusOnly(action)) return { state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" };

  const meterName = ACTION_METER[action];
  if (!meterName) return OPEN;
  const meter = dailyMeter(snapshot.meters?.[meterName], meterName, now);
  const available: GateReason = meterName === "chat" ? "daily_messages_available" : "daily_photo_available";
  const used: GateReason = meterName === "chat" ? "daily_messages_used" : "daily_photo_used";
  // Sayaç okunamadıysa: sınırı biliyoruz ama kalanı bilmiyoruz; karar sunucuda.
  if (!meter) return { state: "limited", reason: available, period: "day" };
  if (meter.remaining > 0) {
    return { state: "limited", reason: available, period: "day", limit: meter.limit, remaining: meter.remaining, resetAt: meter.resetAt };
  }
  return (
    giftGate(snapshot, price) ?? {
      state: "locked",
      reason: used,
      period: "day",
      limit: meter.limit,
      remaining: 0,
      resetAt: meter.resetAt,
      requiredPlan: "plus",
    }
  );
}

/** Bu hesap bu eylemi şu an yapabilir mi; yapamıyorsa neden ve neyle açılır. Saf fonksiyon (istemci ve sunucu). */
export function getGate(snapshot: EntitlementSnapshot, action: Action, context: GateContext = {}, now: Date = new Date()): Gate {
  if (snapshot.plan === "founder") return OPEN;
  if (snapshot.plan === "free") return freeGate(snapshot, action, context, now);
  return paidGate(snapshot, action);
}

/**
 * Sunucunun ret kodundan kapı (402 gövdesindeki `gate`). Kod `refusalCode` / `errorResponse` adlarıdır; tanınmayan
 * kodda null (gövdeye `gate` yazılmaz). Sayaçlı retlerde yenilenme anı İstanbul gece yarısıdır (SQL ile aynı).
 */
export function gateFromRefusal(code: string, now: Date = new Date()): Gate | null {
  const midnight = () => freeMeterResetsAt("chat", now).toISOString();
  switch (code) {
    case "free_lesson_limit":
      return { state: "locked", reason: "free_first_lesson_used", requiredPlan: "plus" };
    case "free_topic_limit":
      return { state: "locked", reason: "free_topic_limit", requiredPlan: "plus" };
    case "free_prep_limit":
      return { state: "locked", reason: "free_prep_limit", requiredPlan: "plus" };
    case "premium_required":
      return { state: "locked", reason: "feature_requires_plus", requiredPlan: "plus" };
    case "free_chat_limit":
      return { state: "locked", reason: "daily_messages_used", period: "day", remaining: 0, resetAt: midnight(), requiredPlan: "plus" };
    case "free_photo_limit":
    case "free_image_limit":
      return { state: "locked", reason: "daily_photo_used", period: "day", remaining: 0, resetAt: midnight(), requiredPlan: "plus" };
    case "free_included_limit":
      return { state: "locked", reason: "free_included_limit", period: "day", remaining: 0, resetAt: midnight() };
    case "free_photo_abuse_limit":
      return { state: "locked", reason: "free_photo_abuse_limit", period: "day", resetAt: midnight() };
    case "spend_cap_free":
      return { state: "locked", reason: "spend_cap" };
    default:
      return null;
  }
}
