/**
 * Öğrenme tercihleri (saf): Astra'nın Ayarlar > Öğrenme tercihleri
 * sekmesinin karşılığı (1 Ekim 2026).
 */

export const DAILY_GOAL_OPTIONS = [10, 20, 30, 45, 60, 90, 120] as const;
export const DEFAULT_DAILY_GOAL = 30;

export const TUTOR_VOICES = [
  { id: "female", label: "Kadın sesi" },
  { id: "male", label: "Erkek sesi" },
] as const;
export type TutorVoice = (typeof TUTOR_VOICES)[number]["id"];

export function parseTutorVoice(value: unknown): TutorVoice {
  return value === "male" ? "male" : "female";
}

/** "Bugün 12 / 30 dk". */
export function dailyGoalLabel(todayMinutes: number, goalMinutes: number): string {
  return `${Math.max(0, Math.floor(todayMinutes))} / ${goalMinutes} dk`;
}

/**
 * Seri penceresindeki rekor satırı. Rekorun gerisindeyken Astra gibi kalan
 * gün sayısı yazılır: "Rekoru kırmana 4 gün daha var".
 */
export function streakRecordLine(current: number, longest: number): string {
  if (longest <= 0) return "Rekorunu bugün başlat";
  if (current >= longest) return "Rekorundasın";
  return `Rekoru kırmana ${longest - current + 1} gün daha var`;
}
