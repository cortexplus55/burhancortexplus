/**
 * Aynı olgu kapısı (bütün dersler).
 *
 * Bir kaynak cümlesi bir iddiayla ancak aynı olguysa çelişir: aynı konu öbeği ve
 * aynı nicelik biçimi (birim, yıl, madde) ya da aynı işlemde geçen sayılar.
 * Sayı çelişkisinden önce ifade hesaplanır. Emin değilsek yanlış yazılmaz.
 * Ders adı, terim listesi ya da tek bir sınavın kalıbı yok.
 */

import { evaluateExpression, valuesClose } from "@/lib/learning/solution-plan";
import { parseCounts, parseMeasures, type Measure } from "@/lib/learning/unit-expect";

export type ClaimVerdict =
  | { kind: "agree" }
  | { kind: "conflict"; correct: string }
  | { kind: "unsure" };

type Polarity = "increase" | "decrease" | "invariant" | "continuous" | "can_jump" | "necessity" | "prohibition";

const OPPOSITE: Record<Polarity, Polarity[]> = {
  increase: ["decrease", "invariant"],
  decrease: ["increase", "invariant"],
  invariant: ["increase", "decrease", "can_jump"],
  continuous: ["can_jump"],
  can_jump: ["continuous", "invariant"],
  necessity: ["prohibition"],
  prohibition: ["necessity"],
};

const POLARITY: { kind: Polarity; re: RegExp }[] = [
  { kind: "continuous", re: /ani(?:\s+[a-z0-9]+){0,3}\s+degisemez|cannot change instantly|zamanla degisir|continuously|\bsurekli\b/g },
  { kind: "can_jump", re: /ani(?:\s+[a-z0-9]+){0,3}\s+degisebilir|can change instantly/g },
  {
    kind: "invariant",
    re: /\b(?:degismez|degismedi|ayni kalir|sabit kalir|unchanged|does not change|remains the same|no change|artmaz|azalmaz)\b/g,
  },
  { kind: "increase", re: /\b(?:artar|artti|artmis|yukselir|cogalir|doubles|increases|rises|grows)\b|\biki kat\b/g },
  { kind: "decrease", re: /\b(?:azalir|azalmis|duser|dusmus|iner|decreases|falls|drops|halves)\b/g },
  { kind: "necessity", re: /\b(?:gerekir|zorunlu|must|needs to)\b/g },
  { kind: "prohibition", re: /\b(?:yasak|olmaz|must not|cannot)\b/g },
];

const STOP = new Set([
  "icin",
  "olan",
  "olarak",
  "daha",
  "gibi",
  "veya",
  "anda",
  "ile",
  "bir",
  "bu",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "does",
  "was",
  "were",
  "are",
  "not",
  "but",
  "then",
  "into",
  "when",
  "where",
  "which",
  "olur",
  "sonra",
  "once",
  "kadar",
  "gore",
  "diye",
  "is",
  "its",
  "his",
  "her",
  "you",
  "your",
  "has",
  "been",
  "will",
  "that",
  "they",
  "them",
  "form",
]);

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function yearsOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g)].map((match) => match[0]))];
}

function articlesOf(text: string): string[] {
  const folded = fold(text);
  const found: string[] = [];
  const patterns = [
    /\b(?:madde|md|article|art)\.?\s*(\d{1,4})\b/g,
    /\bm\.(\d{1,4})\b/g,
    /\b(\d{1,4})\.\s*madde\b/g,
    /\b(\d{1,4})(?:st|nd|rd|th)\s+article\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of folded.matchAll(pattern)) {
      if (match[1] && !found.includes(match[1])) found.push(match[1]);
    }
  }
  return found;
}

function polarities(text: string): Set<Polarity> {
  const folded = fold(text);
  const taken: { start: number; end: number }[] = [];
  const out = new Set<Polarity>();
  for (const row of POLARITY) {
    row.re.lastIndex = 0;
    for (const match of folded.matchAll(row.re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (taken.some((span) => start < span.end && end > span.start)) continue;
      taken.push({ start, end });
      out.add(row.kind);
    }
  }
  return out;
}

function polarityConflict(left: Set<Polarity>, right: Set<Polarity>): boolean {
  if (!left.size || !right.size) return false;
  for (const a of left) {
    for (const b of right) {
      if (OPPOSITE[a].includes(b)) return true;
    }
  }
  return false;
}

function subjectStems(text: string): string[] {
  let folded = fold(text);
  for (const row of POLARITY) {
    row.re.lastIndex = 0;
    folded = folded.replace(row.re, " ");
  }
  folded = folded
    .replace(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g, " ")
    .replace(/\b(?:madde|md|article|art)\.?\s*\d{1,4}\b/g, " ")
    .replace(/\bm\.\d{1,4}\b/g, " ")
    .replace(/\d+(?:[.,]\d+)?/g, " ");
  const out: string[] = [];
  for (const word of folded.split(/[^a-z0-9]+/)) {
    if (word.length < 4 || STOP.has(word)) continue;
    const stem = word.slice(0, 4);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

function sharedCount(left: string[], right: string[]): number {
  const have = new Set(right);
  return left.filter((stem) => have.has(stem)).length;
}

function sameSubject(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  const shared = sharedCount(left, right);
  if (shared >= 2) return true;
  const shorter = Math.min(new Set(left).size, new Set(right).size);
  if (shorter === 1 && shared === 1) return true;
  return shorter >= 2 && shared / shorter >= 0.67;
}

type Quantity = { quantity: string; canonical: number };

function quantities(text: string): Quantity[] {
  const measures: Measure[] = parseMeasures(text);
  return measures.map((item) => ({ quantity: item.quantity, canonical: item.canonical }));
}

type Equality = { results: Quantity[]; operands: number[] };

function equalityOf(text: string): Equality | null {
  const normalized = text.replace(/[−–]/g, "-").replace(/[·×∙]/g, "*").replace(/÷/g, "/");
  const match = normalized.match(
    /(-?\d+(?:[.,]\d+)?(?:\s*[-+*/×÷·]\s*-?\d+(?:[.,]\d+)?)+)\s*=\s*(-?\d+(?:[.,]\d+)?)(?:\s*([%a-zA-ZΩωµ]+))?/,
  );
  if (!match) return null;
  const formula = match[1]!;
  const rhs = Number(match[2]!.replace(",", "."));
  const computed = evaluateExpression(formula);
  const unitTail = match[3] ?? "";
  const withUnit = unitTail ? `${match[2]} ${unitTail}` : "";
  const measured = withUnit ? quantities(withUnit) : [];
  const quantity = measured[0]?.quantity ?? "count";
  const scale = measured[0] && measured[0].canonical !== 0 && rhs !== 0 ? measured[0].canonical / rhs : 1;
  const results: Quantity[] = [];
  if (Number.isFinite(rhs)) results.push({ quantity, canonical: rhs * (Number.isFinite(scale) ? scale : 1) });
  if (computed != null && Number.isFinite(computed)) {
    results.push({ quantity, canonical: computed * (Number.isFinite(scale) ? scale : 1) });
  }
  const operands: number[] = [];
  for (const part of formula.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(part[0].replace(",", "."));
    if (Number.isFinite(value)) operands.push(value);
  }
  return { results, operands };
}

function asserted(text: string): Quantity[] {
  const equality = equalityOf(text);
  if (equality) return equality.results;
  const measured = quantities(text);
  if (measured.length) return measured;
  return parseCounts(text).map((value) => ({ quantity: "count", canonical: value }));
}

function sourceValues(text: string): Quantity[] {
  const measured = quantities(text);
  const counts = parseCounts(text).map((value) => ({ quantity: "count", canonical: value }));
  return [...measured, ...counts];
}

function sameQuantity(left: Quantity, right: Quantity): boolean {
  if (left.quantity === right.quantity) return valuesClose(left.canonical, right.canonical);
  if (left.quantity === "percent" && right.quantity === "count") {
    return valuesClose(left.canonical, right.canonical) || valuesClose(left.canonical, right.canonical * 100);
  }
  if (right.quantity === "percent" && left.quantity === "count") {
    return valuesClose(right.canonical, left.canonical) || valuesClose(right.canonical, left.canonical * 100);
  }
  return false;
}

function operandsIn(operands: number[], source: string): boolean {
  if (operands.length < 2) return false;
  const have = new Set(parseCounts(source).concat(quantities(source).map((item) => item.canonical)));
  const raw = new Set<number>();
  for (const match of source.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(match[0].replace(",", "."));
    if (Number.isFinite(value)) raw.add(value);
  }
  return operands.every((value) => have.has(value) || raw.has(value) || [...raw].some((item) => valuesClose(item, value)));
}

function copula(text: string): { left: string; right: string } | null {
  const folded = fold(text);
  const is = folded.match(/^(.+?)\s+is\s+(.+)$/);
  if (is?.[1] && is[2]) return { left: is[1], right: is[2] };
  return null;
}

function disjoint(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  return left.some((item) => !right.includes(item)) && right.some((item) => !left.includes(item));
}

function relate(claim: string, source: string): "agree" | "conflict" | "unsure" {
  const claimStems = subjectStems(claim);
  const sourceStems = subjectStems(source);
  const same = sameSubject(claimStems, sourceStems);
  const shared = sharedCount(claimStems, sourceStems) >= 1;
  const claimYears = yearsOf(claim);
  const sourceYears = yearsOf(source);
  const claimArticles = articlesOf(claim);
  const sourceArticles = articlesOf(source);
  const claimPolarity = polarities(claim);
  const sourcePolarity = polarities(source);
  const claimEq = equalityOf(claim);
  const claimValues = asserted(claim);
  const sourceVals = sourceValues(source);
  const linked = same || (claimEq ? operandsIn(claimEq.operands, source) : false);

  const claimCopula = copula(claim);
  const sourceCopula = copula(source);
  if (claimCopula && sourceCopula) {
    const leftShare = sharedCount(subjectStems(claimCopula.left), subjectStems(sourceCopula.left));
    const rightShare = sharedCount(subjectStems(claimCopula.right), subjectStems(sourceCopula.right));
    const rightStems = subjectStems(claimCopula.right).length > 0 && subjectStems(sourceCopula.right).length > 0;
    if (leftShare >= 1 && rightStems && rightShare === 0) return "conflict";
  }

  if (polarityConflict(claimPolarity, sourcePolarity) && same) return "conflict";

  if (claimYears.length && sourceYears.length) {
    const subset = claimYears.every((year) => sourceYears.includes(year));
    if (subset && (same || shared || claimStems.length === 0)) return "agree";
    if (disjoint(claimYears, sourceYears) && (same || shared)) return "conflict";
  }

  if (claimArticles.length && sourceArticles.length) {
    const sameArticle = claimArticles.every((item) => sourceArticles.includes(item));
    if (sameArticle && (same || shared || claimStems.length === 0) && !disjoint(claimYears, sourceYears)) return "agree";
    if (disjoint(claimArticles, sourceArticles) && (same || shared)) return "conflict";
  }

  if (claimValues.length && sourceVals.length) {
    const covered = (item: Quantity) => sourceVals.some((other) => sameQuantity(item, other));
    const sourceHasKind = (item: Quantity) =>
      sourceVals.some((other) => other.quantity === item.quantity || other.quantity === "count" || item.quantity === "count");
    const allCovered = claimValues.every(covered);
    const measured = claimValues.some((item) => item.quantity !== "count");
    if (allCovered && (linked || measured)) return "agree";
    if (linked && claimValues.some((item) => !covered(item) && sourceHasKind(item))) return "conflict";
  }

  if (same && claimPolarity.size && sourcePolarity.size && !polarityConflict(claimPolarity, sourcePolarity)) {
    if (!claimValues.length || claimValues.every((item) => sourceVals.some((other) => sameQuantity(item, other)))) return "agree";
  }

  return "unsure";
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).trimEnd();
}

/** İddia kaynak cümlelere göre: uzlaşı, çelişki ya da emin değil. */
export function claimVerdict(claim: string, sentences: readonly string[]): ClaimVerdict {
  const text = claim.trim();
  if (!text || !sentences.length) return { kind: "unsure" };
  let conflict: { sentence: string; score: number } | null = null;
  let agreed = false;
  for (const sentence of sentences) {
    const relation = relate(text, sentence);
    if (relation === "agree") agreed = true;
    if (relation === "conflict") {
      const score = sharedCount(subjectStems(text), subjectStems(sentence));
      if (!conflict || score > conflict.score) conflict = { sentence, score };
    }
  }
  if (agreed) return { kind: "agree" };
  if (conflict) return { kind: "conflict", correct: clip(conflict.sentence, 200) };
  const bareYears = yearsOf(text);
  if (bareYears.length && subjectStems(text).length === 0) {
    const all = [...new Set(sentences.flatMap((sentence) => yearsOf(sentence)))];
    if (all.length === 1 && bareYears.some((year) => !all.includes(year))) {
      const home = sentences.find((sentence) => yearsOf(sentence).includes(all[0]!));
      if (home) return { kind: "conflict", correct: clip(home, 200) };
    }
  }
  return { kind: "unsure" };
}
