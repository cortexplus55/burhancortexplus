/**
 * Sonuç ekranının tonu — kıyas ürününde büyük skorun altında emoji ve tek cümle
 * ("Harika iş çıkardın!"), arka plan da başarıya göre yeşile dönüyor
 * (30 Eylül 2026). Eşikler bizim eski "Güzel gidiyor" ayrımıyla aynı: %70.
 */
import type { Mood } from "@/lib/learning/session-signals";

export type ResultMood = {
  emoji: string;
  text: string;
  tone: "great" | "good" | "work";
};

export function resultMood(score: number, total: number, mood?: Mood | null): ResultMood {
  const ratio = total > 0 ? score / total : 0;
  const tone: ResultMood["tone"] = ratio >= 0.85 ? "great" : ratio >= 0.7 ? "good" : "work";
  // Dost katmanı (8 Kasım 2026): günün ruh hali biliniyorsa kapanış cümlesi onu anar; yalnız gerçek olan söylenir
  // (öğrenci bugün bunu işaretledi, etkinliği bitirdi).
  if (mood === "stressed") {
    if (tone === "great") return { emoji: "🤩", text: "Stresli başladın, harika bitirdin.", tone };
    if (tone === "good") return { emoji: "🙂", text: "Stresli bir günde güzel gitti.", tone };
    return { emoji: "💪", text: "Stresli bir günde buraya kadar gelmek de sayılır; yarın yeniden bakarız.", tone };
  }
  if (mood === "low_energy") {
    if (tone === "work") return { emoji: "💪", text: "Yorgun günde bitirdin; bugünkü payın tamam, gerisi yarın.", tone };
    return { emoji: tone === "great" ? "🤩" : "🙂", text: "Enerjin düşüktü, yine de iyi gitti.", tone };
  }
  if (mood === "ready" && tone === "great") return { emoji: "🤩", text: "Hazırım demiştin; haklıymışsın.", tone };
  if (tone === "great") return { emoji: "🤩", text: "Harika iş çıkardın!", tone };
  if (tone === "good") return { emoji: "🙂", text: "Güzel gidiyor", tone };
  return { emoji: "💪", text: "Biraz daha pratikle oturacak", tone };
}
