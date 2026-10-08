import { DEFAULT_MOOD, parseMood, type Mood } from "@/lib/learning/session-signals";

/**
 * Ders seçiciyle gönderilen mesaj modele "[Matematik] soru" diye gider —
 * ders bilgisi modele lazım. Öğrencinin balonunda o etiket görünmemeli:
 * 1 Ekim 2026'da canlıda "[Matematik] Pisagor teoremi nedir" yazıyordu.
 * Yalnızca harf ve boşluktan oluşan baştaki tek etiket silinir; "[1]" gibi
 * öğrencinin kendi yazdığı şeylere dokunulmaz.
 */
export function displayUserText(content: string): string {
  return content.replace(/^\[[\p{L} ]{2,40}\]\s+/u, "");
}

/** "Bugünkü ruh hali" günle birlikte saklanır; ertesi gün Nötr'e döner. */
export const CHAT_MOOD_KEY = "cortex-chat-mood";

export function istanbulDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}

export function todayMoodFrom(raw: string | null, today: string): Mood {
  if (!raw) return DEFAULT_MOOD;
  try {
    const saved = JSON.parse(raw) as { day?: unknown; mood?: unknown };
    return saved?.day === today ? parseMood(saved.mood) : DEFAULT_MOOD;
  } catch {
    return DEFAULT_MOOD;
  }
}
