/**
 * Öğrenme hafızası özeti (5 Kasım 2026) — SAF. Girdiler düz diziler, çıktı `StudentMemory`.
 *
 * Hiçbir model çağrısı yok; her alan kayıtlardan sayılır. Sınırlar burada tek yerde (`MEMORY_LIMITS`).
 * Ders ya da konu adı kodda yok; konu etiketleri verinin kendisinden gelir.
 */
import { z } from "zod";
import { topicLabelKey } from "@/lib/learning/topic-identity";
import { ERROR_KINDS, HURRIED_MS, isErrorKind, type ErrorKind } from "./error-kinds";

export const STUDENT_MEMORY_VERSION = 1;

export const MEMORY_LIMITS = {
  weakOutcomes: 8,
  openMisconceptions: 6,
  repeatedMistakeTopics: 6,
  claimChars: 200,
} as const;

/** Bir kazanım bu kadar cevaptan azıyla "zayıf" sayılmaz. */
export const WEAK_OUTCOME_MIN_N = 3;

export type ErrorKindCount = { kind: ErrorKind; count: number; lastAt: string | null };
export type WeakOutcome = { outcomeId: string; unitId: string; programId: string; mastery: number; n: number };
export type OpenMisconception = { topicLabel: string | null; claim: string; count: number };
export type RepeatedMistakeTopic = { topicLabel: string; wrongCount: number };
export type MemoryStyle = { modalities?: string[]; explanationStyle?: string | null; familiarity?: string | null };
export type MemoryPace = { avgTimeMs: number | null; hurriedShare: number | null };

export type StudentMemory = {
  version: number;
  updatedAt: string;
  /** Taranan cevap sayısı (doğru + yanlış). */
  sampleSize: number;
  errorKinds: ErrorKindCount[];
  weakOutcomes: WeakOutcome[];
  openMisconceptions: OpenMisconception[];
  repeatedMistakeTopics: RepeatedMistakeTopic[];
  style: MemoryStyle;
  pace: MemoryPace;
};

export type MemoryInputs = {
  now?: Date;
  /** Sınıflandırılmış yanlış cevaplar (`classifyWrongAnswer`) ve zaman damgaları. */
  wrongAnswers: readonly { kind: ErrorKind; at: string | null }[];
  /** Taranan cevap sayısı (doğru + yanlış). */
  answeredCount: number;
  outcomes: readonly { outcomeId: string; unitId: string; programId: string; alpha: number; beta: number; n: number }[];
  misconceptions: readonly { topicLabel: string | null; claim: string }[];
  mistakes: readonly { topicLabel: string | null; wrongCount: number }[];
  preferences: { modalities?: readonly string[]; style?: string | null } | null;
  /** Konu başına aşinalık seçimleri; en sık olanı özetlenir. */
  familiarities: readonly string[];
  /** Soru başına cevap süreleri (ms). */
  responseTimesMs: readonly number[];
};

const errorKindCountSchema = z.object({
  kind: z.string().refine(isErrorKind),
  count: z.number().int().nonnegative(),
  lastAt: z.string().nullable(),
});

const memorySchema = z.object({
  version: z.number().int(),
  updatedAt: z.string(),
  sampleSize: z.number().int().nonnegative(),
  errorKinds: z.array(z.unknown()),
  weakOutcomes: z.array(
    z.object({ outcomeId: z.string(), unitId: z.string(), programId: z.string(), mastery: z.number(), n: z.number().int() }),
  ),
  openMisconceptions: z.array(z.object({ topicLabel: z.string().nullable(), claim: z.string(), count: z.number().int() })),
  repeatedMistakeTopics: z.array(z.object({ topicLabel: z.string(), wrongCount: z.number().int() })),
  style: z.object({
    modalities: z.array(z.string()).optional(),
    explanationStyle: z.string().nullable().optional(),
    familiarity: z.string().nullable().optional(),
  }),
  pace: z.object({ avgTimeMs: z.number().nullable(), hurriedShare: z.number().nullable() }),
});

const KIND_ORDER = new Map<ErrorKind, number>(ERROR_KINDS.map((kind, index) => [kind, index]));

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function countErrorKinds(wrong: MemoryInputs["wrongAnswers"]): ErrorKindCount[] {
  const counts = new Map<ErrorKind, ErrorKindCount>();
  for (const item of wrong) {
    const entry = counts.get(item.kind) ?? { kind: item.kind, count: 0, lastAt: null };
    entry.count += 1;
    entry.lastAt = laterOf(entry.lastAt, item.at);
    counts.set(item.kind, entry);
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      (b.lastAt ?? "").localeCompare(a.lastAt ?? "") ||
      (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0),
  );
}

function weakOutcomes(outcomes: MemoryInputs["outcomes"]): WeakOutcome[] {
  return outcomes
    .filter((row) => row.n >= WEAK_OUTCOME_MIN_N && row.alpha > 0 && row.beta > 0)
    .map((row) => ({
      outcomeId: row.outcomeId,
      unitId: row.unitId,
      programId: row.programId,
      mastery: Math.round((row.alpha / (row.alpha + row.beta)) * 1000) / 1000,
      n: row.n,
    }))
    .sort((a, b) => a.mastery - b.mastery || b.n - a.n || a.outcomeId.localeCompare(b.outcomeId))
    .slice(0, MEMORY_LIMITS.weakOutcomes);
}

function claimKey(claim: string): string {
  return claim.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

function groupMisconceptions(rows: MemoryInputs["misconceptions"]): OpenMisconception[] {
  const groups = new Map<string, OpenMisconception>();
  for (const row of rows) {
    const claim = row.claim.trim();
    if (!claim) continue;
    const topicLabel = row.topicLabel?.trim() || null;
    const key = `${topicLabelKey(topicLabel)}|${claimKey(claim)}`;
    const entry = groups.get(key) ?? { topicLabel, claim: claim.slice(0, MEMORY_LIMITS.claimChars), count: 0 };
    entry.count += 1;
    groups.set(key, entry);
  }
  // Sıralama kararlı: eşit sayıda ilk görülen önde (Map ekleme sırası).
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, MEMORY_LIMITS.openMisconceptions);
}

function groupMistakeTopics(rows: MemoryInputs["mistakes"]): RepeatedMistakeTopic[] {
  const groups = new Map<string, RepeatedMistakeTopic>();
  for (const row of rows) {
    const label = row.topicLabel?.trim();
    if (!label) continue;
    const key = topicLabelKey(label);
    const entry = groups.get(key) ?? { topicLabel: label, wrongCount: 0 };
    entry.wrongCount += Math.max(0, Math.round(row.wrongCount));
    groups.set(key, entry);
  }
  return [...groups.values()]
    .filter((entry) => entry.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, MEMORY_LIMITS.repeatedMistakeTopics);
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function pace(times: readonly number[]): MemoryPace {
  const valid = times.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return { avgTimeMs: null, hurriedShare: null };
  const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const hurried = valid.filter((value) => value < HURRIED_MS).length / valid.length;
  return { avgTimeMs: Math.round(avg), hurriedShare: Math.round(hurried * 100) / 100 };
}

/** Kayıtlardan özet: saf, deterministik; sıralama ve sınırlar burada. */
export function buildStudentMemory(inputs: MemoryInputs): StudentMemory {
  const preferences = inputs.preferences;
  const modalities = [...new Set((preferences?.modalities ?? []).map((item) => item.trim()).filter(Boolean))];
  return {
    version: STUDENT_MEMORY_VERSION,
    updatedAt: (inputs.now ?? new Date()).toISOString(),
    sampleSize: Math.max(0, Math.round(inputs.answeredCount)),
    errorKinds: countErrorKinds(inputs.wrongAnswers),
    weakOutcomes: weakOutcomes(inputs.outcomes),
    openMisconceptions: groupMisconceptions(inputs.misconceptions),
    repeatedMistakeTopics: groupMistakeTopics(inputs.mistakes),
    style: {
      ...(modalities.length ? { modalities } : {}),
      explanationStyle: preferences?.style?.trim() || null,
      familiarity: mostCommon(inputs.familiarities),
    },
    pace: pace(inputs.responseTimesMs),
  };
}

/** Hiçbir şey söylemeyen hafıza: kart "yeterli veri yok" der, istem satırı çıkmaz. */
export function isEmptyMemory(memory: StudentMemory | null | undefined): boolean {
  if (!memory) return true;
  return (
    !memory.errorKinds.length &&
    !memory.weakOutcomes.length &&
    !memory.openMisconceptions.length &&
    !memory.repeatedMistakeTopics.length
  );
}

/** Kayıttan okunan JSON: bilinmeyen hata türü satırı atılır, biçim bozuksa null. */
export function parseStudentMemory(raw: unknown): StudentMemory | null {
  const parsed = memorySchema.safeParse(raw);
  if (!parsed.success) return null;
  const errorKinds = parsed.data.errorKinds
    .map((row) => errorKindCountSchema.safeParse(row))
    .flatMap((row) => (row.success ? [{ ...row.data, kind: row.data.kind as ErrorKind }] : []));
  return { ...parsed.data, errorKinds };
}
