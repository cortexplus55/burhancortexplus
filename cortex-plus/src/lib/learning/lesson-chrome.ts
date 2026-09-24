import type { SectionCheck } from "@/lib/learning/teaching-standards";

/** Ders üretim ekranındaki beş adım — yakalanan yükleme listesi. */
export const LESSON_PREP_STEPS = [
  "Materyallerin okunuyor",
  "Bilgi seviyen kontrol ediliyor",
  "Uygun zorluk seviyesi ayarlanıyor",
  "Sorular seviyene göre seçiliyor",
  "Materyallerinle karşılaştırılıyor",
] as const;

export type CalloutTone = "warn" | "info" | "unit";

export function checkPresentation(check: Pick<SectionCheck, "type">): "trueFalse" | "quickQuiz" {
  return check.type === "trueFalse" ? "trueFalse" : "quickQuiz";
}

/**
 * Doğru/yanlış düğmeleri her zaman solda Yanlış, sağda Doğru.
 * Seçenek metni bu iki etiketten biri değilse eşleme yok; düğmede
 * seçeneğin kendi yazısı kalır.
 */
export function trueFalseIndexes(options: string[]): { wrong: number; right: number } | null {
  const norm = (value: string) => value.trim().toLocaleLowerCase("tr");
  const wrong = options.findIndex((option) => norm(option) === "yanlış");
  const right = options.findIndex((option) => norm(option) === "doğru");
  if (wrong < 0 || right < 0 || wrong === right) return null;
  return { wrong, right };
}

export function calloutTone(note: { title: string; tone?: CalloutTone | null }): CalloutTone {
  if (note.tone === "warn" || note.tone === "info" || note.tone === "unit") return note.tone;
  const title = note.title.toLocaleLowerCase("tr");
  if (title.includes("birim")) return "unit";
  if (/(uyarı|dikkat|hareket|tuzak|yanlış)/.test(title)) return "warn";
  return "info";
}

export function reviewGateLead(count: number): string {
  const n = Math.max(1, Math.floor(count));
  return `Bitirmeden önce, yanlış cevapladığın ${n} kontrol sorusunu yeniden sorup tekrar deneyelim.`;
}
