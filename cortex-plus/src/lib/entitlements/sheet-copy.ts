import { allowanceInWork } from "@/lib/credits/price-table";
import { formatTryWhole } from "@/lib/format";
import { EXAM_WEEK_OFFER_THRESHOLD_DAYS, FREE_DAILY_LIMITS, PAID_PLANS, actionCost } from "@/lib/entitlements/config";
import type { Action, Gate, GateReason } from "@/lib/entitlements/types";

/*
  Yükseltme penceresinin içeriği (Faz 3B, 14 Kasım 2026). Metinler ANA-PROMPT 3B tablosundan birebir; sayılar
  yapılandırmadan (`config.ts`) ve veritabanı fiyatlarından gelir, gün ve saat hesaplanır. Tahtada olmayan özellik için
  cümle uydurulmaz: genel şablon. Çizili olmayan retler en yakın pencereye eşlenir (OTONOM §9 karar 5); `spend_cap`,
  `quota_reset_wait` ve `free_included_limit` pencere AÇMAZ (teklif yok, bugünkü ret metni gösterilir).
*/

export type PlanPrices = { plusMonthly: number | null; plusWeekly: number | null; sigmaMonthly: number | null };

export type SheetReason = "free_first_lesson_used" | "feature_requires_plus" | "daily_messages_used" | "daily_photo_used" | "plus_quota_90" | "plus_quota_100";

/** Kapı nedeninin penceresi; pencere açmayan nedende null. */
export function sheetReasonFor(reason: GateReason): SheetReason | null {
  switch (reason) {
    case "free_first_lesson_used":
    case "free_topic_limit":
    case "free_prep_limit":
      return "free_first_lesson_used";
    case "feature_requires_plus":
      return "feature_requires_plus";
    case "daily_messages_used":
      return "daily_messages_used";
    case "daily_photo_used":
    case "free_photo_abuse_limit":
      return "daily_photo_used";
    case "plus_quota_90":
      return "plus_quota_90";
    case "plus_quota_100":
      return "plus_quota_100";
    default:
      return null;
  }
}

/** `from` sorgu değeri yalnız bilinen eylem adlarından (açık yönlendirme ve rastgele değer yok). */
export const KNOWN_ACTIONS: readonly Action[] = [
  "lesson.create",
  "teacher.message",
  "photo.solve",
  "podcast.create",
  "video.create",
  "oral.start",
  "written.start",
  "cram.export",
  "duel.start",
];

export function payHref(plan: "plus" | "week" | "sigma", from: string | null | undefined): string {
  const safeFrom = from && (KNOWN_ACTIONS as readonly string[]).includes(from) ? from : null;
  return `/pay?plan=${plan}${safeFrom ? `&from=${safeFrom}` : ""}`;
}

/** Özellik adı ve cümlesi (ANA-PROMPT 3B "Özellik cümleleri"). Tahtada olmayan eylem: null (genel şablon). */
export const FEATURE_COPY: Partial<Record<Action, { name: string; sentence: string; mini?: string }>> = {
  "podcast.create": { name: "Podcast", sentence: "Notlarından iki sesli, 5 dakikalık bir diyalog.", mini: "Ada & Kerem · 5 dk" },
  "video.create": { name: "1 dk video", sentence: "Notlarından dikey, 1 dakikalık çizimli özet." },
  "oral.start": { name: "Sözlü", sentence: "Hocanın karşısındaymış gibi canlı sözlü; sesli ya da yazarak." },
  "written.start": { name: "Yazılı / İkiz", sentence: "Çıkmış sorulara göre hocanın ikiz sınavı ve yazılı deneme." },
  "cram.export": { name: "Sınav sabahı kağıdı", sentence: "Tüm formüller, sınav tuzakları ve yanlışların tek sayfada." },
};

const BUNDLE_LINE = "Plus ile birlikte açılanlar: 1 dk video, sözlü sınav, yazılı deneme, sınav sabahı kağıdı.";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;
/** Ay adının bulunma eki (Türkçe ses uyumu ve sert ünsüz benzeşmesi; sabit, ay adları kapalı bir küme). */
const MONTH_LOCATIVE = ["'ta", "'ta", "'ta", "'da", "'ta", "'da", "'da", "'ta", "'de", "'de", "'da", "'ta"] as const;

/** "12 Aralık" ve bulunma ekiyle "12 Aralık'ta" (İstanbul günü). */
export function resetDay(iso: string): { day: string; on: string } | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const local = new Date(time + 3 * 60 * 60 * 1000);
  const month = local.getUTCMonth();
  const day = `${local.getUTCDate()} ${MONTHS[month]}`;
  return { day, on: `${day}${MONTH_LOCATIVE[month]}` };
}

/** "14 sa 20 dk" (bir saatin altında "20 dk"; 0'da "1 dk"). */
export function resetLeft(iso: string, now: Date): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(1, Math.ceil((time - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} sa ${rest} dk` : `${rest} dk`;
}

const thousands = (value: number) => new Intl.NumberFormat("tr-TR").format(value);
const price = (kurus: number | null) => (kurus == null ? null : formatTryWhole(kurus));

export type SheetOption = { plan: "plus" | "week" | "sigma"; title: string; note: string | null; price: string | null; recommended?: boolean };

export type SheetContent = {
  reason: SheetReason;
  title: string;
  body: string[];
  /** Büyük gösterim sayısı (%90 penceresi). */
  figure?: string;
  /** Sayaç satırı ("3 / 3 kullanıldı"). */
  meter?: string;
  /** "Yenilenme 14 sa 20 dk". */
  reset?: string;
  /** Mini kart (podcast). */
  mini?: string;
  options: SheetOption[];
  primary: { label: string; href: string; plan: "plus" | "week" | "sigma" };
  /** `weak` ikinci düğme: kapatır (beklerim) ya da ikinci seçeneğin ödeme sayfası. */
  secondary?: { label: string; href?: string; plan?: "plus" | "week" | "sigma" };
};

export type SheetInput = {
  reason: GateReason;
  action: Action;
  gate?: Gate;
  prices: PlanPrices;
  /** Hazırlığın sınavına kalan gün (Sınav Haftası ikinci seçeneği için). */
  examDaysLeft?: number | null;
  now?: Date;
};

export function sheetContent(input: SheetInput): SheetContent | null {
  const reason = sheetReasonFor(input.reason);
  if (!reason) return null;
  const now = input.now ?? new Date();
  const plusPrice = price(input.prices.plusMonthly);
  const sigmaPrice = price(input.prices.sigmaMonthly);
  const plusWork = allowanceInWork(PAID_PLANS.plus.allowance);
  const sigmaWork = allowanceInWork(PAID_PLANS.sigma.allowance);
  const resetAt = input.gate?.resetAt;

  if (reason === "free_first_lesson_used") {
    const options: SheetOption[] = [
      { plan: "plus", title: "Plus", note: null, price: plusPrice ? `${plusPrice} / ay` : null, recommended: true },
    ];
    const days = input.examDaysLeft;
    const week = typeof days === "number" && days >= 0 && days <= EXAM_WEEK_OFFER_THRESHOLD_DAYS;
    const weekPrice = price(input.prices.plusWeekly);
    if (week) options.push({ plan: "week", title: "Sınav Haftası", note: `Sınavına ${days} gün var`, price: weekPrice ? `${weekPrice} / 7 gün` : null });
    return {
      reason,
      title: "Yeni ders için Plus gerekli",
      body: [`Ücretsiz hakkın olan ilk ders kullanıldı. Plus'ta ayda yaklaşık ${thousands(plusWork.lessons)} ders hazırlayabilirsin.`],
      options,
      primary: { label: "Plus'a geç", href: payHref("plus", input.action), plan: "plus" },
      ...(week ? { secondary: { label: "Sınav Haftası", href: payHref("week", input.action), plan: "week" as const } } : {}),
    };
  }

  if (reason === "feature_requires_plus") {
    const feature = FEATURE_COPY[input.action];
    return {
      reason,
      title: feature ? `${feature.name} Plus ile açılır` : "Bu özellik Plus ile açılır",
      body: [...(feature ? [feature.sentence] : []), BUNDLE_LINE],
      ...(feature?.mini ? { mini: feature.mini } : {}),
      options: [],
      primary: { label: plusPrice ? `Plus'a geç · ${plusPrice} / ay` : "Plus'a geç", href: payHref("plus", input.action), plan: "plus" },
    };
  }

  if (reason === "daily_messages_used") {
    const limit = input.gate?.limit ?? FREE_DAILY_LIMITS.messages;
    const left = resetAt ? resetLeft(resetAt, now) : null;
    return {
      reason,
      title: `Bugünkü ${limit} mesajın bitti`,
      body: [`Hakkın yarın yenilenir. Plus'ta ayda yaklaşık ${thousands(plusWork.messages)} mesaj var.`],
      meter: `${limit} / ${limit} kullanıldı`,
      ...(left ? { reset: `Yenilenme ${left}` } : {}),
      options: [],
      primary: { label: "Plus ile devam et", href: payHref("plus", input.action), plan: "plus" },
      secondary: { label: "Yarın devam ederim" },
    };
  }

  if (reason === "daily_photo_used") {
    const left = resetAt ? resetLeft(resetAt, now) : null;
    return {
      reason,
      title: "Bugünkü fotoğraf hakkın bitti",
      body: ["Hakkın yarın yenilenir."],
      ...(left ? { reset: `Yenilenme ${left}` } : {}),
      options: [],
      primary: { label: "Plus ile devam et", href: payHref("plus", input.action), plan: "plus" },
      secondary: { label: "Yarın devam ederim" },
    };
  }

  const day = resetAt ? resetDay(resetAt) : null;
  if (reason === "plus_quota_90") {
    const remaining = input.gate?.remaining ?? 0;
    const lessonsLeft = Math.floor(remaining / Math.max(1, actionCost("lesson.create")));
    const used = input.gate?.limit ? Math.round(((input.gate.limit - remaining) / input.gate.limit) * 100) : null;
    return {
      reason,
      title: "Aylık limitine yaklaşıyorsun",
      body: [day ? `${day.on} sıfırlanır · yaklaşık ${thousands(lessonsLeft)} ders kaldı` : `yaklaşık ${thousands(lessonsLeft)} ders kaldı`],
      ...(used !== null ? { figure: `%${used}` } : {}),
      options: [{ plan: "sigma", title: "Sigma", note: `Ayda yaklaşık ${thousands(sigmaWork.lessons)} ders`, price: sigmaPrice ? `${sigmaPrice} / ay` : null }],
      primary: { label: "Sigma'ya geç", href: payHref("sigma", input.action), plan: "sigma" },
      secondary: { label: "Sıfırlanmayı beklerim" },
    };
  }

  return {
    reason,
    title: "Bu ayki hakkın doldu",
    body: [
      ...(day ? [`Yeni ders ve mesajlar ${day.on} açılır`] : []),
      "Daha önce hazırladığın dersler, kartlar ve testler açık kalır.",
    ],
    options: [],
    primary: { label: sigmaPrice ? `Sigma'ya geç · ${sigmaPrice} / ay` : "Sigma'ya geç", href: payHref("sigma", input.action), plan: "sigma" },
    secondary: { label: "Sıfırlanmayı beklerim" },
  };
}
