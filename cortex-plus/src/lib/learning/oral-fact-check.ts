import { lessonKeyFacts, type KeyFact } from "@/lib/learning/lesson-key-facts";
import { validFirstAnswerErrors, type OralAnswerError } from "@/lib/learning/oral-first-answer";
import { claimVerdict, sourceSentences } from "@/lib/learning/same-fact";

/**
 * Sözlüden önce olgu denetimi. Kaynakla çelişen sayı, yön, tarih, madde, sıra, tanım ve istisna.
 * Ders adı, terim listesi veya tek bir sınavın kalıbı yok. Model susarsa deterministik yedek çalışır.
 */
export const FACT_CHECK_TIMEOUT_MS = 12_000;

export type FactAnswer = { index: number; answer: string };

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

function words(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
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
  const lines = sourceSentences(source);
  const facts = lessonKeyFacts([{ text: source }]);
  for (const row of answers) {
    const answer = row.answer.trim();
    if (!answer) continue;
    const found: OralAnswerError[] = [];
    for (const claim of sourceSentences(answer)) {
      const verdict = claimVerdict(claim, lines);
      if (verdict.kind === "conflict") {
        found.push({ wrong: clip(claim, 160), correct: verdict.correct });
      }
    }
    const order = sequenceConflict(answer, facts, lines);
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
    "Eksik anlatım, aynı anlamı başka sözle söylemek, eşdeğer biçim ve birim dönüşümü aykırı değildir.",
    "Emin değilsen errors yazma. correct yalnız aynı olgunun kaynak cümlesidir.",
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
  const parsed = confirmModelConflicts(input.source, parseFactCheckPayload(raw, input.answers));
  return mergeFactConflicts(parsed, backup);
}

/** Model çelişkisi yalnız aynı olgu cümlesiyle kalır. Uzlaşılan iddia düşer. */
function confirmModelConflicts(
  source: string,
  parsed: Map<number, OralAnswerError[]>,
): Map<number, OralAnswerError[]> {
  const lines = sourceSentences(source);
  const out = new Map<number, OralAnswerError[]>();
  for (const [index, errors] of parsed) {
    const kept: OralAnswerError[] = [];
    for (const error of errors) {
      const verdict = claimVerdict(error.wrong, lines);
      if (verdict.kind === "agree") continue;
      if (verdict.kind === "conflict") {
        kept.push({ wrong: error.wrong, correct: verdict.correct });
        continue;
      }
      const home = lines.find((sentence) => {
        const folded = fold(sentence);
        const quote = fold(error.correct);
        return quote.length >= 8 && (folded.includes(quote.slice(0, 48)) || quote.includes(folded.slice(0, 48)));
      });
      if (home) kept.push({ wrong: error.wrong, correct: clip(home, 200) });
    }
    if (kept.length) out.set(index, kept);
  }
  return out;
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
