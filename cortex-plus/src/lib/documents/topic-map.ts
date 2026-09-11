/**
 * Build a document topic map from page analyses.
 * Heuristic only (no model calls) so CI and smoke probes stay free.
 */

import type { PageAnalysis } from "@/lib/documents/page-analysis";

export type TopicDraft = {
  title: string;
  learningObjective: string | null;
  prerequisites: string[];
  keyDefinitions: string[];
  keyRelations: string[];
  workedExamples: string[];
  commonMistakes: string[];
  sourceExercises: string[];
  pageNumbers: number[];
  /** Temporary key used while merging similar titles. */
  mergeKey: string;
};

export type TopicMapBuildResult = {
  topics: TopicDraft[];
  mergedTitles: { kept: string; dropped: string[] }[];
};


function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeKeyFor(title: string): string {
  return normalizeTitle(title).slice(0, 48);
}

function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) >= 8;
  }
  return false;
}

function definitionsFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (/^.+:\s+.+/.test(trimmed) && trimmed.length < 140) {
      out.push(trimmed.slice(0, 140));
    } else if (/\b(tanım|tanim|definition)\b/i.test(trimmed)) {
      out.push(trimmed.slice(0, 140));
    }
  }
  return out.slice(0, 8);
}

function examplesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/\b(örnek|ornek|example|çözüm|cozum)\b/i.test(line)) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 8);
}

function exercisesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/^\s*(\d+[.)]|[a-d][.)]|soru)\s+/i.test(line) && line.length > 8) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 10);
}

function mistakesFromText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    if (/\b(yanlış|yanlis|hata|dikkat|kaçın|kacin|common\s*mistake)\b/i.test(line)) {
      out.push(line.trim().slice(0, 160));
    }
  }
  return out.slice(0, 6);
}

function relationsFromFormulas(formulas: string[]): string[] {
  return formulas.filter((f) => /[=≠≈]/.test(f)).slice(0, 10);
}

/**
 * Build one draft from a model-produced topic (title + objective + pages).
 * Mirrors the enrichment {@link buildTopicMap} does per page, so the persisted
 * shape and coverage report are identical whichever builder ran.
 */
export function draftFromLlmTopic(
  title: string,
  learningObjective: string | null,
  pageNumbers: number[],
  pages: PageAnalysis[],
  index: number,
) {
  const byNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const draft: TopicDraft & { sortHint: number } = {
    title,
    learningObjective: learningObjective?.trim() || null,
    prerequisites: [],
    keyDefinitions: [],
    keyRelations: [],
    workedExamples: [],
    commonMistakes: [],
    sourceExercises: [],
    pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
    mergeKey: mergeKeyFor(`${title} ${index}`),
    sortHint: index,
  };

  for (const pageNumber of draft.pageNumbers) {
    const page = byNumber.get(pageNumber);
    if (!page) continue;
    draft.keyDefinitions.push(...definitionsFromText(page.textContent));
    draft.keyRelations.push(...relationsFromFormulas(page.formulas));
    draft.workedExamples.push(...examplesFromText(page.textContent));
    draft.commonMistakes.push(...mistakesFromText(page.textContent));
    draft.sourceExercises.push(...exercisesFromText(page.textContent));
  }

  draft.keyDefinitions = [...new Set(draft.keyDefinitions)].slice(0, 12);
  draft.keyRelations = [...new Set(draft.keyRelations)].slice(0, 12);
  draft.workedExamples = [...new Set(draft.workedExamples)].slice(0, 12);
  draft.commonMistakes = [...new Set(draft.commonMistakes)].slice(0, 8);
  draft.sourceExercises = [...new Set(draft.sourceExercises)].slice(0, 12);
  return draft;
}
