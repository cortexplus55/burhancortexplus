import { addDays, istanbulDay, isoWeekday } from "@/lib/istanbul-day";
import { turkishHolidayOn } from "@/lib/learning/tr-calendar";

/**
 * Türkiye vergi takvimi (Faz 13, 26 Kasım 2026). Saf ve deterministik; günler "YYYY-MM-DD" (Türkiye günü).
 *
 * Kaynak (26 Kasım 2026'da doğrulandı):
 * - 2 No.lu KDV (sorumlu sıfatıyla, yurt dışı hizmet alımı): izleyen ayın 25'i (VUK-164 Sirküleri, Şubat 2024).
 * - Muhtasar ve Damga: izleyen ayın 26'sı.
 * - 1 No.lu KDV: izleyen ayın 28'i.
 * - Geçici vergi: 17 Şubat (önceki yılın 4. dönemi; 7566 sayılı Kanunla 2025 dönemlerinden itibaren geri geldi),
 *   17 Mayıs, 17 Ağustos, 17 Kasım.
 * - Son gün hafta sonuna ya da resmî tatile rastlarsa takip eden ilk iş gününe kayar (VUK 18). Arife (yarım gün)
 *   kaydırmaz: erken hatırlatmak geç kalmaktan iyidir.
 * - Ayın 20'si bir beyanname değil, iç hatırlatmadır: önceki ayın yurt dışı API ve bulut faturalarını topla (2 No.lu
 *   KDV ve mali müşavir paketi için). Kaydırılmaz.
 *
 * Mali tatil (1–20 Temmuz) uzatmaları uygulanmaz: o dönemde ekrandaki tarih resmî son günden erken kalır, geç değil.
 * Resmî beyannamelerde mali müşavir ve GİB vergi takvimi esastır.
 */

export type TaxDeadlineKind =
  "invoice_collect" | "kdv2" | "muhtasar_damga" | "kdv1" | "gecici_vergi";

export type TaxDeadline = {
  /** Benzersiz ve kalıcı: hatırlatma kilidi bu anahtarla (`tax:<key>:<eşik>`). */
  key: string;
  kind: TaxDeadlineKind;
  title: string;
  /** Beyanın dönemi: aylıklarda "YYYY-MM", geçici vergide "YYYY-Q1".."YYYY-Q4". */
  period: string;
  periodLabel: string;
  /** Son gün (kaydırılmış). */
  dueDate: string;
  /** Takvimdeki gün (kaydırmadan önce). */
  originalDate: string;
  /** Kaydırıldıysa nedeni ("Cumartesi", "Cumhuriyet Bayramı" …). */
  shiftedFrom: string | null;
  /** İç hatırlatma (beyanname değil). */
  internal: boolean;
  hint: string;
};

const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const TAX_KIND_LABEL: Record<TaxDeadlineKind, string> = {
  invoice_collect: "Yurt dışı faturaları topla",
  kdv2: "2 No.lu KDV (KDV 2)",
  muhtasar_damga: "Muhtasar ve Damga",
  kdv1: "1 No.lu KDV (KDV 1)",
  gecici_vergi: "Geçici Vergi",
};

const KIND_HINT: Record<TaxDeadlineKind, string> = {
  invoice_collect:
    "Önceki ayın OpenAI, Vercel, Supabase, Resend, Sentry ve Upstash faturalarının PDF'lerini indir, tabloya gir ve mali müşavire gönder.",
  kdv2: "Yurt dışından alınan hizmetlerin (API ve bulut) KDV'si sorumlu sıfatıyla beyan edilip ödenir; aynı ay 1 No.lu KDV'de indirilir.",
  muhtasar_damga:
    "Kesinti (stopaj) ve damga vergisi varsa beyan edilir; ücretli çalışanın yoksa mali müşavirine sor.",
  kdv1: "Satışlardaki KDV'den indirilecek KDV (2 No.lu KDV, PayTR komisyonu faturası) düşülür, kalan ödenir.",
  gecici_vergi:
    "Dönem kârı üzerinden peşin vergi; yıllık beyannamede mahsup edilir.",
};

const WEEKDAY_TR = [
  "",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthOf(isoDay: string): { year: number; month: number } {
  return {
    year: Number(isoDay.slice(0, 4)),
    month: Number(isoDay.slice(5, 7)),
  };
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function periodLabelOf(period: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) return `${quarter[1]} ${quarter[2]}. dönem`;
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return `${MONTHS_TR[Number(month[2]) - 1]} ${month[1]}`;
  return period;
}

/** Tam gün resmî tatil mi (arife yarım gündür, sayılmaz). */
function fullHoliday(isoDay: string): string | null {
  const name = turkishHolidayOn(isoDay);
  if (!name || /arife/i.test(name)) return null;
  return name;
}

/**
 * Son gün iş gününe denk gelmiyorsa takip eden ilk iş günü (VUK 18). Döner: gün ve ilk kaydırma nedeni.
 */
export function shiftToBusinessDay(isoDay: string): {
  date: string;
  reason: string | null;
} {
  let date = isoDay;
  let reason: string | null = null;
  for (let guard = 0; guard < 15; guard += 1) {
    const weekday = isoWeekday(date);
    const holiday = fullHoliday(date);
    if (weekday < 6 && !holiday) break;
    reason ??= holiday ?? WEEKDAY_TR[weekday]!;
    date = addDays(date, 1);
  }
  return { date, reason };
}

function deadline(
  kind: TaxDeadlineKind,
  period: string,
  originalDate: string,
  internal = false,
): TaxDeadline {
  const shifted = internal
    ? { date: originalDate, reason: null }
    : shiftToBusinessDay(originalDate);
  return {
    key: `${kind}:${period}`,
    kind,
    title: TAX_KIND_LABEL[kind],
    period,
    periodLabel: periodLabelOf(period),
    dueDate: shifted.date,
    originalDate,
    shiftedFrom: shifted.reason,
    internal,
    hint: KIND_HINT[kind],
  };
}

/** Bir dönemin (ay) dört aylık işi: faturaları topla (20'si), KDV 2 (25'i), Muhtasar ve Damga (26'sı), KDV 1 (28'i). */
export function monthlyDeadlines(period: string): TaxDeadline[] {
  const { year, month } = monthOf(`${period}-01`);
  const next = shiftMonth(year, month, 1);
  return [
    deadline("invoice_collect", period, iso(next.year, next.month, 20), true),
    deadline("kdv2", period, iso(next.year, next.month, 25)),
    deadline("muhtasar_damga", period, iso(next.year, next.month, 26)),
    deadline("kdv1", period, iso(next.year, next.month, 28)),
  ];
}

/** Bir takvim yılında son günü düşen geçici vergi beyanları (17 Şubat önceki yılın 4. dönemi). */
export function provisionalTaxDeadlines(year: number): TaxDeadline[] {
  return [
    deadline("gecici_vergi", `${year - 1}-Q4`, iso(year, 2, 17)),
    deadline("gecici_vergi", `${year}-Q1`, iso(year, 5, 17)),
    deadline("gecici_vergi", `${year}-Q2`, iso(year, 8, 17)),
    deadline("gecici_vergi", `${year}-Q3`, iso(year, 11, 17)),
  ];
}

/** [from, to] aralığında son günü düşen bütün işler, tarih sırasıyla. */
export function taxDeadlinesBetween(
  fromIso: string,
  toIso: string,
): TaxDeadline[] {
  const from = monthOf(fromIso);
  const to = monthOf(toIso);
  const out: TaxDeadline[] = [];
  // Son günü aralığa düşebilecek dönemler: aralığın ilk ayından iki ay öncesinden son ayına kadar.
  for (
    let cursor = shiftMonth(from.year, from.month, -2);
    cursor.year * 12 + cursor.month <= to.year * 12 + to.month;
    cursor = shiftMonth(cursor.year, cursor.month, 1)
  ) {
    out.push(
      ...monthlyDeadlines(
        `${cursor.year}-${String(cursor.month).padStart(2, "0")}`,
      ),
    );
  }
  for (let year = from.year; year <= to.year + 1; year += 1)
    out.push(...provisionalTaxDeadlines(year));
  const seen = new Set<string>();
  return out
    .filter((item) => item.dueDate >= fromIso && item.dueDate <= toIso)
    .filter((item) => (seen.has(item.key) ? false : (seen.add(item.key), true)))
    .sort((a, b) =>
      a.dueDate === b.dueDate
        ? a.kind.localeCompare(b.kind)
        : a.dueDate.localeCompare(b.dueDate),
    );
}

/** Bugünden (Türkiye günü) itibaren `days` gün içindeki işler. */
export function upcomingTaxDeadlines(
  now: Date = new Date(),
  days = 30,
): TaxDeadline[] {
  const today = istanbulDay(now);
  return taxDeadlinesBetween(today, addDays(today, days));
}

/** Son güne kalan gün (bugün son günse 0). */
export function daysUntil(todayIso: string, dueIso: string): number {
  return Math.round(
    (Date.parse(`${dueIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Hatırlatma eşikleri: 5 gün ve 1 gün kala. */
export const REMINDER_THRESHOLDS = [5, 1] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

/**
 * Bugün gönderilmesi gereken eşik. Günlük iş bir gün atlansa da hatırlatma kaybolmasın diye pencereli: 5 günlük
 * hatırlatma 5–2 gün kala, 1 günlük 1–0 gün kala. Her eşik kendi anahtarıyla bir kez gönderilir (`alerts.ts`).
 */
export function reminderThresholdFor(
  todayIso: string,
  dueIso: string,
): ReminderThreshold | null {
  const left = daysUntil(todayIso, dueIso);
  if (left < 0) return null;
  if (left <= 1) return 1;
  if (left <= 5) return 5;
  return null;
}

export function taxReminderKey(
  item: Pick<TaxDeadline, "key">,
  threshold: ReminderThreshold,
): string {
  return `tax:${item.key}:${threshold}`;
}

export function dueDateLabel(isoDay: string): string {
  const { year, month } = monthOf(isoDay);
  const day = Number(isoDay.slice(8, 10));
  return `${day} ${MONTHS_TR[month - 1]} ${year} ${WEEKDAY_TR[isoWeekday(isoDay)]}`;
}
