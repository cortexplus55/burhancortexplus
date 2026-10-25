import { addDays, isoWeekday, istanbulDay } from "@/lib/istanbul-day";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { inFinalSection } from "@/lib/learning/final-block";

/**
 * Çalışma yolunun gün ve hafta etiketleri (25 Ekim 2026, P2-1).
 * Takvim zaten `calendarDate` yazar; yol bunu göstermiyordu. Eksik tarihler
 * yalnız ekranda, konu sırası bozulmadan serilir. Veritabanına yazılmaz.
 */

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

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

/** "2026-10-30" → "30 Eki". */
export function shortDayLabel(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const name = MONTHS[month - 1] ?? "";
  return `${day} ${name}`;
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** Yakın gün konuşma dilinde; gerisi "30 Eki". */
export function pathDayLabel(iso: string, today = istanbulDay()): string {
  if (!isIsoDay(iso)) return "";
  if (iso === today) return "Bugün";
  if (iso === addDays(today, 1)) return "Yarın";
  return shortDayLabel(iso);
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

export function finalWindow(examDate: string): { start: string; end: string } {
  const end = addDays(examDate, -1);
  return { start: addDays(end, -6), end };
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
): string {
  const { start, end } = finalWindow(examDate);
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
      calendarDate = pinDateToFinalWeek(calendarDate, examDate, finalSlot, finalSlots.length);
      finalSlot += 1;
    }
    if (calendarDate === stored) return node;
    return {
      ...node,
      sessionMeta: { ...(node.sessionMeta ?? {}), calendarDate },
    };
  });
}

/** Konu bloğunun başlığı: tek günse "Bugün", aralıksa hafta etiketi. */
export function sectionWhenLabel(
  dates: readonly string[],
  origin: string,
  today = istanbulDay(),
): string | null {
  const sorted = [...new Set(dates.filter(isIsoDay))].sort();
  if (!sorted.length) return null;
  const start = sorted[0]!;
  const end = sorted[sorted.length - 1]!;
  if (start === end) return pathDayLabel(start, today);
  return pathWeekLabel(start, end, origin);
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
