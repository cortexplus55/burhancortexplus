/**
 * Sözlü cevapta sayı ve yön çelişkisi. Cümle cümle bakılır; kaynaktaki bir sayı
 * öğrencinin söylemediği bir iddiayı düşürmez. Ders adı ve terim listesi yok.
 */

export const ORAL_FACT_TIMEOUT_MS = 12_000;
/** Bir yanlış iddia, üç soruda toplamı %90'ın altında bırakır: (1+1+0.4)/3 = %80. */
export const FACT_RATIO_CAP = 0.4;

export type FactFinding = { index?: number; quote: string; correction: string };

export type FactHit = { quote: string; correction: string };

const INCREASE =
  /(?<!\p{L})(?:artar|artıyor|artiyor|yükselir|yukselir|çoğalır|cogalir|büyür|buyur|katlanır|iki\s+katına|iki\s+katina)(?!\p{L})/iu;
const DECREASE = /(?<!\p{L})(?:azalır|azalir|düşer|duser|iner|küçülür|kuculur)(?!\p{L})/iu;
const UNCHANGED =
  /(?<!\p{L})(?:değişmez|degismez|değişmiyor|degismiyor|aynı\s+kalır|ayni\s+kalir|sabit(?:tir)?)(?!\p{L})/iu;

const STOP = new Set(
  ["olarak", "vardır", "yoktur", "içinde", "kadar", "sonra", "önce", "degil", "değil", "ancak", "bütün", "şeyler"].map((word) =>
    word.toLocaleLowerCase("tr-TR"),
  ),
);

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 8);
}

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLocaleLowerCase("tr-TR").split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 5 || STOP.has(word)) continue;
    out.add(word);
  }
  return out;
}

function sharedStemCount(left: string, right: string): number {
  const a = stems(left);
  const b = stems(right);
  let n = 0;
  for (const stem of a) if (b.has(stem)) n += 1;
  return n;
}

type Direction = "increase" | "decrease" | "unchanged";

function direction(text: string): Direction | null {
  const groups: Direction[] = [];
  if (INCREASE.test(text)) groups.push("increase");
  if (DECREASE.test(text)) groups.push("decrease");
  if (UNCHANGED.test(text)) groups.push("unchanged");
  return groups.length === 1 ? groups[0]! : null;
}

function numbersIn(text: string): string[] {
  const found = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [...new Set(found.map((raw) => raw.replace(",", ".")))];
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

export function factWeaknessLine(hit: FactHit): string {
  return `«${clip(hit.quote)}» yanlış. Doğrusu: ${clip(hit.correction)}`;
}

/**
 * Öğrenci cümlesi ile kaynak cümlesi aynı iddiayı konuşuyorsa (en az iki ortak gövde)
 * ve yönleri ya da tek sayıları çelişiyorsa alıntı döner.
 */
export function factContradictions(input: { answer: string; source: string; expected?: readonly string[] }): FactHit[] {
  const answerSentences = sentences(input.answer);
  const sourceSentences = sentences([input.source, ...(input.expected ?? [])].filter(Boolean).join("\n"));
  const hits: FactHit[] = [];
  for (const claim of answerSentences) {
    let best: { sentence: string; shared: number } | null = null;
    for (const sourceSentence of sourceSentences) {
      const shared = sharedStemCount(claim, sourceSentence);
      if (shared < 2) continue;
      if (!best || shared > best.shared) best = { sentence: sourceSentence, shared };
    }
    if (!best) continue;
    const claimDirection = direction(claim);
    const sourceDirection = direction(best.sentence);
    const claimNumbers = numbersIn(claim);
    const sourceNumbers = numbersIn(best.sentence);
    const directionClash = Boolean(claimDirection && sourceDirection && claimDirection !== sourceDirection);
    const numberClash =
      claimNumbers.length === 1 &&
      sourceNumbers.length === 1 &&
      claimNumbers[0] !== sourceNumbers[0];
    if (!directionClash && !numberClash) continue;
    hits.push({ quote: clip(claim), correction: clip(best.sentence) });
  }
  return hits;
}

/**
 * Model iddiası yalnız alıntı cevapta varsa ve deterministik çelişki aynı alıntıyı
 * görüyorsa uygulanır. Model tek başına doğru cevabı düşürmez.
 */
export function confirmedFactHits(
  answer: string,
  source: string,
  expected: readonly string[] | undefined,
  model: readonly FactFinding[],
): FactHit[] {
  const deterministic = factContradictions({ answer, source, expected });
  if (!model.length) return deterministic;
  const agreed = deterministic.filter((hit) =>
    model.some((finding) => quoteInAnswer(answer, finding.quote) && overlaps(hit.quote, finding.quote)),
  );
  return agreed.length ? agreed : deterministic;
}

function overlaps(left: string, right: string): boolean {
  const a = left.toLocaleLowerCase("tr-TR");
  const b = right.toLocaleLowerCase("tr-TR");
  const slice = b.slice(0, 24);
  return slice.length >= 8 && (a.includes(slice) || b.includes(a.slice(0, 24)));
}

export function quoteInAnswer(answer: string, quote: string): boolean {
  const left = answer.replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
  const right = quote.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
  if (right.length < 8) return false;
  return left.includes(right);
}

export function parseFactFindings(raw: unknown): FactFinding[] {
  const row = (raw ?? {}) as { findings?: unknown };
  if (!Array.isArray(row.findings)) return [];
  const out: FactFinding[] = [];
  for (const item of row.findings) {
    if (!item || typeof item !== "object") continue;
    const finding = item as { index?: unknown; quote?: unknown; correction?: unknown };
    if (typeof finding.quote !== "string" || typeof finding.correction !== "string") continue;
    const quote = finding.quote.trim();
    const correction = finding.correction.trim();
    if (quote.length < 8 || correction.length < 4) continue;
    out.push({
      ...(typeof finding.index === "number" ? { index: finding.index } : {}),
      quote: quote.slice(0, 240),
      correction: correction.slice(0, 240),
    });
  }
  return out.slice(0, 8);
}

export const ORAL_FACT_SYSTEM =
  "Olgu denetçisisin. Öğrencinin her cümlesini verilen kaynakla karşılaştır. " +
  "Kaynakla çelişen iddiayı, öğrencinin cümlesinden birebir alıntı (quote) ve kaynaktaki doğru cümle (correction) olarak yaz. " +
  "Çelişki yoksa findings boş olsun. Kaynakta olmayan sayı, tarih ya da kural uydurma. Yalnızca JSON döndür: " +
  '{"findings":[{"index":number,"quote":string,"correction":string}]}';
