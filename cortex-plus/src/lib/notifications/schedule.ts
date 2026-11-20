import { isoWeekKey } from "@/lib/istanbul-day";

/**
 * Faz 6 (20 Kasım 2026): bildirim ve e-posta zamanlaması, saf ve deterministik. Bütün saatler Türkiye saatiyle
 * (`Europe/Istanbul`); cron her 30 dakikada bir çalışır, bu yüzden her gönderim zamanı bir yarım saat dilimidir.
 */

export const NOTIFICATION_TIME_ZONE = "Europe/Istanbul";

/** Öğrencinin seçebileceği çalışma saatleri. Saklanan değer saattir; 18 → 18:30 (UI'daki ilk seçenek). */
export const STUDY_SLOTS = [
  { hour: 18, minute: 30, label: "18:30" },
  { hour: 19, minute: 0, label: "19:00" },
  { hour: 20, minute: 0, label: "20:00" },
  { hour: 21, minute: 0, label: "21:00" },
] as const;

export type StudyHour = (typeof STUDY_SLOTS)[number]["hour"];
export const DEFAULT_STUDY_HOUR: StudyHour = 19;

export function isStudyHour(value: unknown): value is StudyHour {
  return STUDY_SLOTS.some((slot) => slot.hour === value);
}

export function studySlotLabel(hour: StudyHour): string {
  return STUDY_SLOTS.find((slot) => slot.hour === hour)?.label ?? "19:00";
}

export type IstanbulClock = {
  /** YYYY-MM-DD */
  day: string;
  hour: number;
  minute: number;
  /** 1 Pazartesi … 7 Pazar (ISO). */
  weekday: number;
};

export function istanbulClock(now: Date): IstanbulClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NOTIFICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdays[get("weekday")] ?? 1,
  };
}

/** Yarım saat dilimi: 18:30 → "18:30", 18:44 → "18:30", 19:05 → "19:00". */
export function slotOf(clock: Pick<IstanbulClock, "hour" | "minute">): { hour: number; minute: 0 | 30 } {
  return { hour: clock.hour, minute: clock.minute >= 30 ? 30 : 0 };
}

/** Saat dilimi verilen zamana denk geliyor mu (cron dilimin içinde birkaç dakika geç çalışabilir). */
export function inSlot(clock: Pick<IstanbulClock, "hour" | "minute">, hour: number, minute: 0 | 30): boolean {
  const slot = slotOf(clock);
  return slot.hour === hour && slot.minute === minute;
}

/** Öğrencinin seçtiği saat şu anki dilim mi. */
export function inStudySlot(clock: Pick<IstanbulClock, "hour" | "minute">, hour: StudyHour): boolean {
  const slot = STUDY_SLOTS.find((item) => item.hour === hour) ?? STUDY_SLOTS[1];
  return inSlot(clock, slot.hour, slot.minute as 0 | 30);
}

/** Gece sessizliği: 22:00 (dahil) – 08:00 (hariç) Türkiye saati. */
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;

export function isQuietHour(now: Date): boolean {
  const { hour } = istanbulClock(now);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** ISO hafta anahtarı (Türkiye günüyle): "2026-W47". Tek kaynak: `istanbul-day.ts`. */
export function isoWeekOf(now: Date): string {
  return isoWeekKey(now, NOTIFICATION_TIME_ZONE);
}

/** İki Türkiye günü arasındaki gün farkı (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
