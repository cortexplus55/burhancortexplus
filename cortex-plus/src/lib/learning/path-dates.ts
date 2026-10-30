import { addDays, isoWeekday, istanbulDay } from "@/lib/istanbul-day";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { inFinalSection } from "@/lib/learning/final-block";
import { doneDayLabel, shortDayLabel, weekdayDayLabel } from "@/lib/learning/day-label";
import { HOLIDAY_BADGE, holidayRunsBetween } from "@/lib/learning/tr-calendar";

export { doneDayLabel, shortDayLabel } from "@/lib/learning/day-label";

/**
 * Çalışma yolunun gün ve hafta etiketleri (25 Ekim 2026, P2-1).
 * Takvim zaten `calendarDate` yazar; yol bunu göstermiyordu. Eksik tarihler
 * yalnız ekranda, konu sırası bozulmadan serilir. Veritabanına yazılmaz.
 */

/**
 * 7 günden kısa hazırlık ayrı kiptir (30 Ekim 2026, Paket I): hafta etiketi yazılmaz, gün yazılır
 * ("Bugün", "Yarın", "Cum 31 Eki"). İki günlük vize planında "1. Hafta" yazıyordu. Takvim kurucusu
 * (`buildExamScheduleV2`) da aynı sınırla kısa kipe geçer.
 */
export const SHORT_PLAN_DAYS = 7;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type DatedPathNode = {
  id: string;
  kind: PlanNodeKind;
  sortOrder: number;
  sessionMeta?: { calendarDate?: string | null; topicTitle?: string | null; adaptive?: unknown } | null;
};

export function isIsoDay(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DAY.test(value);
}

/** Hazırlığın kurulduğu İstanbul günü. Bozuk kayıtta bugün. */
export function pathOriginDay(createdAt: string | null | undefined, now = new Date()): string {
  if (!createdAt) return istanbulDay(now);
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return istanbulDay(now);
  return istanbulDay(parsed);
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Yakın gün konuşma dilinde; gerisi "30 Eki" (kısa planda "Cum 30 Eki"). */
export function pathDayLabel(iso: string, today = istanbulDay(), options?: { weekday?: boolean }): string {
  if (!isIsoDay(iso)) return "";
  if (iso === today) return "Bugün";
  if (iso === addDays(today, 1)) return "Yarın";
  return options?.weekday ? weekdayDayLabel(iso) : shortDayLabel(iso);
}

/** Hazırlık kurulduğu günden sınava 7 günden kısa mı (kısa kip: hafta yok, gün var). */
export function isShortPlan(origin: string, examDate: string | null | undefined): boolean {
  return isIsoDay(origin) && isIsoDay(examDate) && daysBetween(origin, examDate) < SHORT_PLAN_DAYS;
}

/**
 * Yoldaki tek adımın gün etiketi. Bitmiş adım "Bugün" ya da "Yarın" değil "Tamamlandı · 29 Eki" yazar
 * (30 Ekim 2026: iki öğrencide de bitmiş adımlar "Yarın" etiketliydi; plan günü yarındı, iş bugün bitti).
 * Tarih bitişin günüdür; bilinmiyorsa yalnız "Tamamlandı".
 */
export function pathNodeWhenLabel(
  node: { status: string; calendarDate?: string | null },
  options: { today?: string; doneOn?: string | null; weekday?: boolean } = {},
): string {
  if (node.status === "done") return doneDayLabel(options.doneOn);
  const date = node.calendarDate;
  return isIsoDay(date) ? pathDayLabel(date, options.today ?? istanbulDay(), { weekday: options.weekday }) : "";
}

function mondayOnOrBefore(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

/** Hazırlığın ilk gününden itibaren 1 tabanlı hafta. */
export function pathWeekIndex(dateIso: string, originIso: string): number {
  const diff = daysBetween(mondayOnOrBefore(originIso), mondayOnOrBefore(dateIso));
  return Math.floor(diff / 7) + 1;
}

/** "1. Hafta · 26 Eki – 1 Kas". Tek günde hafta yazılmaz. */
export function pathWeekLabel(startIso: string, endIso: string, originIso: string): string {
  const start = startIso <= endIso ? startIso : endIso;
  const end = startIso <= endIso ? endIso : startIso;
  const first = pathWeekIndex(start, originIso);
  const last = pathWeekIndex(end, originIso);
  const week = first === last ? `${first}. Hafta` : `${first}–${last}. Hafta`;
  const span = start === end ? shortDayLabel(start) : `${shortDayLabel(start)} – ${shortDayLabel(end)}`;
  return `${week} · ${span}`;
}

/**
 * Sınavdan önceki son yedi gün. Kısa planda pencere hazırlığın ilk gününden önceye taşmaz
 * (iki günlük planda final adımı geçmiş bir güne yazılabiliyordu).
 */
export function finalWindow(examDate: string, origin?: string | null): { start: string; end: string } {
  const end = addDays(examDate, -1);
  const start = addDays(end, -6);
  if (isIsoDay(origin) && origin > start) return { start: origin <= end ? origin : end, end };
  return { start, end };
}

/**
 * Son blok sınavdan önceki son yedi güne oturur. Tarihi zaten o penceredeyse
 * durur. Konu düğümlerinin sırasına dokunulmaz; yalnız tarih etiketi değişir.
 */
export function pinDateToFinalWeek(
  date: string | null | undefined,
  examDate: string,
  slot: number,
  slots: number,
  origin?: string | null,
): string {
  const { start, end } = finalWindow(examDate, origin);
  if (isIsoDay(date) && date >= start && date <= end) return date;
  const span = Math.max(0, daysBetween(start, end));
  const offset = slots <= 1 ? span : Math.round((Math.max(0, slot) * span) / Math.max(1, slots - 1));
  return addDays(start, Math.min(span, offset));
}

function spreadMissing(index: number, total: number, origin: string, examDate: string | null): string {
  const end = isIsoDay(examDate) ? addDays(examDate, -1) : addDays(origin, Math.max(0, total - 1));
  const start = origin <= end ? origin : end;
  const span = Math.max(0, daysBetween(start, end));
  const offset = total <= 1 ? 0 : Math.round((index * span) / (total - 1));
  return addDays(start, offset);
}

/**
 * Her düğüme ekranda gösterilecek günü yazar. Kayıtlı `calendarDate` durur.
 * Tarihi olmayan düğüm, başlangıç ile sınavın bir gün öncesi arasına sırayla serilir.
 * Son bölümdekiler son haftaya çekilir.
 */
export function applyDisplayDates<T extends DatedPathNode>(
  nodes: readonly T[],
  options: { origin: string; examDate?: string | null },
): T[] {
  const ordered = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  const origin = isIsoDay(options.origin) ? options.origin : istanbulDay();
  const examDate = isIsoDay(options.examDate) ? options.examDate : null;
  let lastTopicIndex = -1;
  ordered.forEach((node, index) => {
    if (!inFinalSection(node.kind, node.sessionMeta)) lastTopicIndex = index;
  });
  const finalSlots = ordered.filter((node, index) => inFinalSection(node.kind, node.sessionMeta) && index > lastTopicIndex);
  let finalSlot = 0;
  return ordered.map((node, index) => {
    const stored = node.sessionMeta?.calendarDate;
    const inFinal = inFinalSection(node.kind, node.sessionMeta) && index > lastTopicIndex;
    let calendarDate = isIsoDay(stored) ? stored : spreadMissing(index, ordered.length, origin, examDate);
    if (inFinal && examDate) {
      calendarDate = pinDateToFinalWeek(calendarDate, examDate, finalSlot, finalSlots.length, origin);
      finalSlot += 1;
    }
    if (calendarDate === stored) return node;
    return {
      ...node,
      sessionMeta: { ...(node.sessionMeta ?? {}), calendarDate },
    };
  });
}

/**
 * Konu bloğunun başlığı: tek günse "Bugün", aralıksa hafta etiketi. Kısa planda (sınav 7 günden
 * yakın) hafta yazılmaz: "Bugün – Yarın", "Yarın – Cum 31 Eki".
 */
export function sectionWhenLabel(
  dates: readonly string[],
  origin: string,
  today = istanbulDay(),
  options?: { examDate?: string | null },
): string | null {
  const sorted = [...new Set(dates.filter(isIsoDay))].sort();
  if (!sorted.length) return null;
  const start = sorted[0]!;
  const end = sorted[sorted.length - 1]!;
  const short = isShortPlan(origin, options?.examDate);
  if (start === end) return pathDayLabel(start, today, { weekday: short });
  if (short) return `${pathDayLabel(start, today, { weekday: true })} – ${pathDayLabel(end, today, { weekday: true })}`;
  return pathWeekLabel(start, end, origin);
}

/** Bitmiş konu bloğunun başlığı: bitiş günleri, göreli söz yok ("29 Eki", "29 Eki – 2 Kas"). */
export function sectionDoneLabel(dates: readonly string[]): string | null {
  const sorted = [...new Set(dates.filter(isIsoDay))].sort();
  if (!sorted.length) return null;
  const start = sorted[0]!;
  const end = sorted[sorted.length - 1]!;
  return start === end ? shortDayLabel(start) : `${shortDayLabel(start)} – ${shortDayLabel(end)}`;
}

function holidayRunLabel(run: { start: string; end: string; name: string }): string {
  if (run.start === run.end) return `${shortDayLabel(run.start)} ${run.name}`;
  const sameMonth = run.start.slice(0, 7) === run.end.slice(0, 7);
  const span = sameMonth
    ? `${Number(run.start.slice(8, 10))}–${shortDayLabel(run.end)}`
    : `${shortDayLabel(run.start)} – ${shortDayLabel(run.end)}`;
  return `${span} ${run.name}`;
}

/**
 * Bir yol bölümünün tarih aralığındaki resmî tatiller (30 Ekim 2026, Paket I): "🇹🇷 Resmî Tatil (Esnek
 * Gün): 23 Nis Ulusal Egemenlik ve Çocuk Bayramı · 1 May Emek ve Dayanışma Günü". Aralık bir önceki
 * bölümün son gününden sonra başlar; böylece iki bölüm arasına düşen tatil de bir bölümde görünür.
 * Tatil yoksa null. Tatil kararı değişmedi: gün esnek, yük yarıya iner (`studyDayBudgets`).
 */
export function sectionHolidayNote(afterIso: string | null, toIso: string | null): string | null {
  if (!isIsoDay(toIso)) return null;
  const from = isIsoDay(afterIso) ? addDays(afterIso, 1) : toIso;
  const runs = holidayRunsBetween(from, toIso);
  if (!runs.length) return null;
  return `${HOLIDAY_BADGE}: ${runs.map(holidayRunLabel).join(" · ")}`;
}

/**
 * Bölümlerin tatil notları sırayla: her bölüm bir öncekinin son gününden kendi son gününe kadar
 * olan tatilleri taşır; ilk bölüm hazırlığın ilk gününden başlar, son bölüm sınavdan önceki güne uzar.
 */
export function sectionHolidayNotes(
  sectionDates: readonly (readonly string[])[],
  origin: string,
  examDate?: string | null,
): (string | null)[] {
  let previousEnd: string | null = isIsoDay(origin) ? addDays(origin, -1) : null;
  return sectionDates.map((dates, index) => {
    const sorted = dates.filter(isIsoDay).sort();
    let end: string | null = sorted.length ? sorted[sorted.length - 1]! : null;
    if (index === sectionDates.length - 1 && isIsoDay(examDate)) {
      const lastDay = addDays(examDate, -1);
      if (!end || lastDay > end) end = lastDay;
    }
    if (!end || (previousEnd && end <= previousEnd)) return null;
    const note = sectionHolidayNote(previousEnd, end);
    previousEnd = end;
    return note;
  });
}

/**
 * Zamanlayıcıdaki hazırlık geneli oturum (deneme ve final türleri) son yedi
 * çalışma gününün dışındaysa son güne çekilir. Konu derslerinin günü ve sırası durur.
 */
export function pinFinalSessionsInPlace(
  sessions: { role: string; kind: PlanNodeKind; calendarDate: string; dayIndex: number }[],
  studyDayDates: readonly string[],
): void {
  if (!studyDayDates.length) return;
  const window = studyDayDates.slice(-Math.min(7, studyDayDates.length));
  const start = window[0]!;
  const end = window[window.length - 1]!;
  const endIndex = studyDayDates.indexOf(end);
  for (const session of sessions) {
    const prepWide = session.role === "mock" || inFinalSection(session.kind, null);
    if (!prepWide) continue;
    if (session.calendarDate >= start && session.calendarDate <= end) continue;
    session.calendarDate = end;
    if (endIndex >= 0) session.dayIndex = endIndex + 1;
  }
}
