/**
 * Kazanım ustalığı — Beta-Binom (Plan PR 3, Burhan R2 + t232u, 1 Kasım 2026). Saf fonksiyonlar; istemcide de çalışır.
 *
 * - Ön dağılım α = β = 1 (bilgisizlik).
 * - Zorluk ağırlığı: kolay 0,7 · orta 1,0 · zor 1,3. Doğru yanıt α'ya w, yanlış yanıt β'ya w ekler.
 * - Ustalık = α / (α + β).
 * - n = ağırlıksız yanıt sayısı. Güven etiketi yalnız n ≥ 3'te; altında "tahmini"; hiç veri yoksa
 *   "Henüz yeterli veri yok".
 */
export type Difficulty = "easy" | "medium" | "hard";
export type MasteryState = { alpha: number; beta: number; n: number };

export const PRIOR: MasteryState = { alpha: 1, beta: 1, n: 0 };
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { easy: 0.7, medium: 1.0, hard: 1.3 };
export const CONFIDENT_MIN_N = 3;

export function applyResponse(state: MasteryState, correct: boolean, difficulty: Difficulty): MasteryState {
  const w = DIFFICULTY_WEIGHT[difficulty] ?? 1;
  return correct
    ? { alpha: round(state.alpha + w), beta: state.beta, n: state.n + 1 }
    : { alpha: state.alpha, beta: round(state.beta + w), n: state.n + 1 };
}

export function foldResponses(responses: readonly { correct: boolean; difficulty: Difficulty }[], start: MasteryState = PRIOR): MasteryState {
  return responses.reduce((s, r) => applyResponse(s, r.correct, r.difficulty), start);
}

export function masteryValue(state: MasteryState): number {
  return state.alpha / (state.alpha + state.beta);
}

export type MasteryLabel =
  | { kind: "no_data"; text: "Henüz yeterli veri yok" }
  | { kind: "estimate"; text: "tahmini"; mastery: number }
  | { kind: "confident"; text: string; mastery: number };

export function masteryLabel(state: MasteryState): MasteryLabel {
  if (state.n <= 0) return { kind: "no_data", text: "Henüz yeterli veri yok" };
  const mastery = masteryValue(state);
  if (state.n < CONFIDENT_MIN_N) return { kind: "estimate", text: "tahmini", mastery };
  return { kind: "confident", text: `${state.n} yanıta dayalı`, mastery };
}

/**
 * Tarama → ilk yol sırası (öz değerlendirme ile aynı kanal: "zayif" öne, "iyi" sona).
 * Eşikler (ünite düzeyinde, taramadaki yanıtlardan):
 * - ustalık ≤ 0,40 → "zayif" (ör. tek orta soruda yanlış: 1/(1+2) = 0,33)
 * - ustalık ≥ 0,75 → "iyi"   (ör. iki orta soruda doğru: 3/4 = 0,75; tek doğru 0,67 yetmez)
 * - arası → "orta" (sıra değişmez)
 * Yanıt yoksa tahmin yok (null). Öğrencinin kendi işareti her zaman taramadan üstündür.
 */
export const SCAN_WEAK_MAX = 0.4;
export const SCAN_KNOWN_MIN = 0.75;
export type ScanRating = "iyi" | "orta" | "zayif";

export function scanRating(state: MasteryState): ScanRating | null {
  if (state.n <= 0) return null;
  const m = masteryValue(state);
  if (m <= SCAN_WEAK_MAX) return "zayif";
  if (m >= SCAN_KNOWN_MIN) return "iyi";
  return "orta";
}

/** Açık öz değerlendirme kazanır; yalnız işaretlenmemiş üniteye tarama tahmini yazılır. */
export function mergeRatings<R extends string>(explicit: Record<string, R>, scan: Record<string, R>): Record<string, R> {
  return { ...scan, ...explicit };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
