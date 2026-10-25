import { lessonKeyFacts, type KeyFact } from "@/lib/learning/lesson-key-facts";
import { validFirstAnswerErrors, type OralAnswerError } from "@/lib/learning/oral-first-answer";

/**
 * Sözlüden önce olgu denetimi. Kaynakla çelişen sayı, yön, tarih, madde, sıra, tanım ve istisna.
 * Ders adı, terim listesi veya tek bir sınavın kalıbı yok. Model susarsa deterministik yedek çalışır.
 */
export const FACT_CHECK_TIMEOUT_MS = 12_000;

export type FactAnswer = { index: number; answer: string };

type Dir = "up" | "down" | "flat";

const DIRECTIONS: { dir: Dir; re: RegExp }[] = [
  { dir: "up", re: /\b(?:artar|artti|artmis|yukselir|yukselmis|cogalir|cogalmis|doubles|increases|rises|grows)\b|\biki\s+kat/gi },
  { dir: "down", re: /\b(?:azalir|azalmis|duser|dusmus|iner|inmis|decreases|falls|drops|halves)\b/gi },
  {
    dir: "flat",
    re: /\b(?:degismez|degismedi|ayni\s+kalir|sabit\s+kalir|unchanged|stays\s+the\s+same|does\s+not\s+change|remains\s+the\s+same|no\s+change)\b/gi,
  },
];

const STOP = new Set(["icin", "olan", "olarak", "daha", "gibi", "veya", "anda", "ile", "bir", "bu", "the", "and", "for", "with", "that", "this", "from"]);

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

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function words(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function stemsOf(text: string): string[] {
  const out: string[] = [];
  for (const word of words(text)) {
    if (word.length < 5 || STOP.has(word) || /^\d+$/.test(word)) continue;
    const stem = word.slice(0, 5);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

function distinctiveShared(a: string, b: string): boolean {
  const foldedB = ` ${fold(b)} `;
  const foldedA = ` ${fold(a)} `;
  const hit = (from: string, into: string) =>
    words(from).some((word) => word.length >= 8 && into.includes(word.slice(0, 5)));
  return hit(a, foldedB) || hit(b, foldedA);
}

function overlapScore(a: string, b: string): number {
  const right = new Set(stemsOf(b));
  const shared = stemsOf(a).filter((stem) => right.has(stem)).length;
  if (shared >= 2) return shared;
  if (distinctiveShared(a, b)) return Math.max(shared, 2);
  return shared;
}

function related(a: string, b: string): boolean {
  return overlapScore(a, b) >= 2;
}

function lastDirection(text: string): Dir | null {
  const folded = fold(text);
  let best: { dir: Dir; at: number } | null = null;
  for (const row of DIRECTIONS) {
    for (const match of folded.matchAll(row.re)) {
      const at = match.index ?? 0;
      if (!best || at >= best.at) best = { dir: row.dir, at };
    }
  }
  return best?.dir ?? null;
}

function years(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g)].map((match) => match[0]))];
}

function articles(text: string): string[] {
  const folded = fold(text);
  return [...new Set([...folded.matchAll(/\b(?:madde|md|article|art)\.?\s*(\d{1,4})\b/g)].map((match) => match[1]!))];
}

function salientNumbers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const token = match[0].replace(",", ".");
    if (token === "0" || token === "1") continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

function exclusive(left: readonly string[], right: readonly string[]): boolean {
  if (!left.length || !right.length) return false;
  const a = new Set(left);
  const b = new Set(right);
  return [...a].some((item) => !b.has(item)) && [...b].some((item) => !a.has(item));
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

function bestSentence(claim: string, sourceSentences: readonly string[]): string | null {
  let best: { text: string; score: number } | null = null;
  for (const text of sourceSentences) {
    const score = overlapScore(claim, text);
    if (!best || score > best.score) best = { text, score };
  }
  if (!best || best.score < 2) return null;
  return best.text;
}

function pairError(claim: string, sourceSentence: string): OralAnswerError {
  return { wrong: clip(claim, 160), correct: clip(sourceSentence, 200) };
}

function contradictSentence(claim: string, sourceSentence: string): OralAnswerError | null {
  if (!related(claim, sourceSentence)) return null;
  const claimDir = lastDirection(claim);
  const sourceDir = lastDirection(sourceSentence);
  if (claimDir && sourceDir && claimDir !== sourceDir) return pairError(claim, sourceSentence);
  if (exclusive(articles(claim), articles(sourceSentence))) return pairError(claim, sourceSentence);
  if (exclusive(years(claim), years(sourceSentence))) return pairError(claim, sourceSentence);
  if (exclusive(salientNumbers(claim), salientNumbers(sourceSentence))) return pairError(claim, sourceSentence);
  return null;
}

function signatureClash(claim: string, sourceFacts: readonly KeyFact[]): KeyFact | null {
  const claimFacts = lessonKeyFacts([{ text: claim }]);
  for (const left of sourceFacts) {
    if (left.kind === "sequence" || !left.signatures.length) continue;
    for (const right of claimFacts) {
      if (right.kind !== left.kind || !right.signatures.length) continue;
      const stems = new Set(left.stems);
      const shared = right.stems.some((stem) => stems.has(stem));
      if (!shared && !related(left.text, right.text)) continue;
      const leftSig = left.signatures.map((item) => fold(item).replace(/\s+/g, ""));
      const rightSig = right.signatures.map((item) => fold(item).replace(/\s+/g, ""));
      if (exclusive(leftSig, rightSig)) return left;
    }
  }
  return null;
}

function stepAt(text: string, step: string): number {
  const folded = fold(text).replace(/[^a-z0-9]+/g, " ");
  const needle = fold(step).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
  if (needle.length >= 4) {
    const at = folded.indexOf(needle);
    if (at >= 0) return at;
  }
  const stem = words(step).find((word) => word.length >= 4)?.slice(0, 5);
  return stem ? folded.indexOf(stem) : -1;
}

function sequenceConflict(answer: string, facts: readonly KeyFact[], sourceSentences: readonly string[]): OralAnswerError | null {
  for (const fact of facts) {
    if (fact.kind !== "sequence" || !fact.steps || fact.steps.length < 2) continue;
    const positions = fact.steps.map((step) => stepAt(answer, step));
    if (positions.some((at) => at < 0)) continue;
    let reversed = false;
    for (let i = 1; i < positions.length; i += 1) {
      if (positions[i]! < positions[i - 1]!) reversed = true;
    }
    if (!reversed) continue;
    const sourceSentence = sourceSentences.find((sentence) => fact.steps!.every((step) => stepAt(sentence, step) >= 0)) ?? fact.text;
    return { wrong: clip(answer, 160), correct: clip(sourceSentence, 200) };
  }
  return null;
}

/** Kaynaktaki ölçüyle çelişen iddia. Eksik anlatım ve aynı ölçüyü tekrar etmek yanlış değildir. */
export function deterministicFactConflicts(source: string, answers: readonly FactAnswer[]): Map<number, OralAnswerError[]> {
  const map = new Map<number, OralAnswerError[]>();
  if (!source.trim()) return map;
  const sourceSentences = sentences(source);
  const facts = lessonKeyFacts([{ text: source }]);
  for (const row of answers) {
    const answer = row.answer.trim();
    if (!answer) continue;
    const found: OralAnswerError[] = [];
    for (const claim of sentences(answer)) {
      const sourceSentence = bestSentence(claim, sourceSentences);
      const direct = sourceSentence ? contradictSentence(claim, sourceSentence) : null;
      if (direct) {
        found.push(direct);
        continue;
      }
      const clash = signatureClash(claim, facts);
      if (clash) {
        const home = sourceSentences.find((sentence) => sentence.includes(clash.text.slice(0, 24))) ?? clash.text;
        found.push({ wrong: clip(claim, 160), correct: clip(home, 200) });
      }
    }
    const order = sequenceConflict(answer, facts, sourceSentences);
    if (order) found.push(order);
    const valid = validFirstAnswerErrors(answer, found);
    if (valid.length) map.set(row.index, valid);
  }
  return map;
}

export function factCheckUserPrompt(answers: readonly FactAnswer[], source: string): string {
  return [
    "Kaynak metin:",
    source.slice(0, 12_000),
    "",
    "Öğrenci cevapları:",
    ...answers.map((row) => `${row.index}) ${row.answer}`),
    "",
    "Her cevap için kaynağa aykırı iddiaları yaz.",
    "Aykırı olan: sayı, yön (artar, azalır veya değişmez), tarih, madde numarası, sıralı adım, tanım veya istisna kaynağın tersini söylüyorsa.",
    "Eksik anlatım ve aynı anlamı başka sözle söylemek aykırı değildir.",
    "wrong öğrencinin cümlesinden birebir alıntıdır. correct kaynağın cümlesinden birebir alıntıdır.",
    'JSON: {"items":[{"index":0,"errors":[{"wrong":"...","correct":"..."}]}]}',
  ].join("\n");
}

export function parseFactCheckPayload(raw: unknown, answers: readonly FactAnswer[]): Map<number, OralAnswerError[]> {
  const map = new Map<number, OralAnswerError[]>();
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return map;
  const byIndex = new Map(answers.map((row) => [row.index, row.answer]));
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const index = Number((item as { index?: unknown }).index);
    const answer = byIndex.get(index);
    if (answer == null || !Number.isInteger(index)) continue;
    const errors = (item as { errors?: OralAnswerError[] }).errors;
    const valid = validFirstAnswerErrors(answer, errors);
    if (valid.length) map.set(index, valid);
  }
  return map;
}

export function mergeFactConflicts(...maps: Array<Map<number, OralAnswerError[]> | null | undefined>): Map<number, OralAnswerError[]> {
  const out = new Map<number, OralAnswerError[]>();
  for (const map of maps) {
    if (!map) continue;
    for (const [index, errors] of map) {
      const have = out.get(index) ?? [];
      for (const error of errors) {
        if (have.some((row) => fold(row.wrong) === fold(error.wrong))) continue;
        have.push(error);
        if (have.length >= 2) break;
      }
      if (have.length) out.set(index, have);
    }
  }
  return out;
}

type SemanticLike = { index: number; points?: unknown[]; errors?: OralAnswerError[] | null };

/** Anlam çağrısının üstüne olgu çelişkisini yazar. Anlam yoksa çelişki tek başına puan tavanını açar. */
export function withFactConflicts<T extends SemanticLike>(
  semantics: T[] | null,
  conflicts: Map<number, OralAnswerError[]>,
): T[] | null {
  if (!conflicts.size) return semantics;
  const rows = new Map<number, T>();
  for (const row of semantics ?? []) rows.set(row.index, { ...row, errors: [...(row.errors ?? [])] });
  for (const [index, errors] of conflicts) {
    const row = rows.get(index);
    if (row) {
      const have = [...(row.errors ?? [])];
      for (const error of errors) {
        if (have.some((item) => fold(item.wrong) === fold(error.wrong))) continue;
        have.push(error);
      }
      row.errors = have.slice(0, 2);
      continue;
    }
    rows.set(index, { index, points: [], errors } as unknown as T);
  }
  return [...rows.values()];
}

/**
 * Kaynak varsa deterministik yedek her zaman çalışır. Model çağrısı süre aşımında düşer, yedek kalır.
 * Kaynak boşsa ne model ne yedek çalışır.
 */
export async function collectFactConflicts(input: {
  source: string;
  answers: readonly FactAnswer[];
  model: Promise<unknown | null> | null;
}): Promise<Map<number, OralAnswerError[]>> {
  if (!input.source.trim()) return new Map();
  const backup = deterministicFactConflicts(input.source, input.answers);
  const raw = input.model ? await withDeadline(input.model, FACT_CHECK_TIMEOUT_MS) : null;
  const parsed = parseFactCheckPayload(raw, input.answers);
  return mergeFactConflicts(parsed, backup);
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
