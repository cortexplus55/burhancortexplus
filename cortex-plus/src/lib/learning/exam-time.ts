import { shortDayLabel } from "@/lib/learning/day-label";

/**
 * Sınavın saati ve yeri (30 Ekim 2026, Paket I). Canlıda 31 Ekim 10:00'daki vize planda hiç
 * görünmüyordu: kurulumda saat alanı yoktu. İkisi de isteğe bağlı ve göç yazılmadı; hazırlığın
 * `learning_preferences` jsonb alanında durur (`examTime`, `examPlace`). Okurken bozuk ya da eksik
 * değer sessizce yok sayılır.
 */

/** "09:30", "14:00" — 24 saat. */
export const EXAM_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Yer en çok bu kadar karakter ("Amfi 2", "B Blok 204"). */
export const EXAM_PLACE_MAX = 80;

export function parseExamTime(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return EXAM_TIME_PATTERN.test(value) ? value : undefined;
}

export function parseExamPlace(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.replace(/\s+/g, " ").trim().slice(0, EXAM_PLACE_MAX).trim();
  return value || undefined;
}

/** Kayıttaki tercihlerden saat ve yer. */
export function examTimeFromPreferences(raw: unknown): { time: string | null; place: string | null } {
  const bag = raw && typeof raw === "object" ? (raw as { examTime?: unknown; examPlace?: unknown }) : {};
  return { time: parseExamTime(bag.examTime) ?? null, place: parseExamPlace(bag.examPlace) ?? null };
}

/** "31 Eki 10:00 · Sınav · Amfi 2"; saat yoksa "31 Eki · Sınav". */
export function examDayLabel(input: { date: string; time?: string | null; place?: string | null }): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "";
  const time = parseExamTime(input.time);
  const place = parseExamPlace(input.place);
  const when = time ? `${shortDayLabel(input.date)} ${time}` : shortDayLabel(input.date);
  return place ? `${when} · Sınav · ${place}` : `${when} · Sınav`;
}
