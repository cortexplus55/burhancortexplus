/**
 * Bitmiş etkinliğin sonuç ekranı (17 Ekim 2026, Astra'daki gibi). Astra'da "Sonuçları gör"
 * önceki sonucu açıyor: büyük "3/7", bir cümle, doğruluk ve harcanan süre; bizde etkinliği
 * baştan kuruyordu ("Bu konuya ne kadar aşinasın?"). Sayılar kayıttan, söz burada.
 */

export type NodeResultInput = {
  score: number | null;
  total: number | null;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type NodeResultView = {
  scored: boolean;
  score: number;
  total: number;
  pct: number | null;
  minutes: number | null;
  headline: string;
  emoji: string;
};

/** Harcanan süre: başlangıçtan son kayda; ölçülemiyorsa (eski kayıt, saat kayması) yok. */
export function spentMinutes(input: Pick<NodeResultInput, "startedAt" | "createdAt" | "updatedAt">): number | null {
  const start = Date.parse(input.startedAt ?? input.createdAt);
  const end = input.updatedAt ? Date.parse(input.updatedAt) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60_000);
  return minutes > 600 ? null : Math.max(1, minutes);
}

export function nodeResultView(input: NodeResultInput): NodeResultView {
  const total = typeof input.total === "number" && input.total > 0 ? input.total : 0;
  const score = typeof input.score === "number" ? Math.max(0, Math.min(input.score, total || input.score)) : 0;
  const scored = total > 0;
  const pct = scored ? Math.round((score / total) * 100) : null;
  const tone =
    pct == null
      ? { headline: "Tamamladın!", emoji: "✅" }
      : pct >= 80
        ? { headline: "Harika iş çıkardın!", emoji: "🥳" }
        : pct >= 50
          ? { headline: "İyi gidiyorsun!", emoji: "💪" }
          : { headline: "Bir tekrar iyi gelir.", emoji: "📚" };
  return { scored, score, total, pct, minutes: spentMinutes(input), ...tone };
}
