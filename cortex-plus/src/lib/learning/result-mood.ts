/**
 * Sonuç ekranının tonu — Astra'da büyük skorun altında emoji ve tek cümle
 * ("Harika iş çıkardın!"), arka plan da başarıya göre yeşile dönüyor
 * (30 Eylül 2026). Eşikler bizim eski "Güzel gidiyor" ayrımıyla aynı: %70.
 */
export type ResultMood = {
  emoji: string;
  text: string;
  tone: "great" | "good" | "work";
};

export function resultMood(score: number, total: number): ResultMood {
  const ratio = total > 0 ? score / total : 0;
  if (ratio >= 0.85) return { emoji: "🤩", text: "Harika iş çıkardın!", tone: "great" };
  if (ratio >= 0.7) return { emoji: "🙂", text: "Güzel gidiyor", tone: "good" };
  return { emoji: "💪", text: "Biraz daha pratikle oturacak", tone: "work" };
}
