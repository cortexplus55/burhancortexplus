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
  /** Düğüm türü: sorusuz etkinlikte kayıt 1/1 olsa da puan gösterilmez. */
  kind?: string | null;
};

/**
 * Soru sorulmayan etkinlikler. Bitince kayıt `score 1 / total 1` yazar (tamamlandı
 * işareti); sonuç ekranı bunu "Doğru cevaplar 1/1 · %100" diye gösteriyordu (19 Ekim 2026).
 */
export const UNSCORED_NODE_KINDS: ReadonlySet<string> = new Set(["podcast"]);

/**
 * Puan gösterilmez mi. Podcast'in dinleme kontrolü (20 Ekim 2026) cevaplandıysa kayıt "2/3" yazar
 * ve puan gösterilir; kontrolsüz ya da "Şimdi değil" ile biten podcast yine 1/1, puansız.
 */
export function unscoredResult(kind: string | null | undefined, total: number): boolean {
  return UNSCORED_NODE_KINDS.has(kind ?? "") && total <= 1;
}

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
  const scored = total > 0 && !unscoredResult(input.kind, total);
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
