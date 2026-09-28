/**
 * Outline cleaning for scanned / OCR books — pure, no I/O.
 *
 * Turns a polluted heading list (question stems, running headers, series
 * labels, code fences, hyphen-cut fragments) into a study outline:
 * units → topics, with coverage preserved.
 */

export type CleanPageInput = {
  pageNumber: number;
  text: string;
  headings?: string[];
  pageKind?: string | null;
};

export type FurnitureDetection = {
  seriesLabels: string[];
  unitRuns: { label: string; pageNumbers: number[] }[];
  furnitureLines: string[];
};

export type CleanCandidate = {
  title: string;
  sourceTitle: string;
  pageNumbers: number[];
  needsModelReview?: boolean;
  dropReason?: string;
};

export type CleanOutlineResult = {
  kept: CleanCandidate[];
  dropped: { title: string; reason: string; pageNumbers: number[] }[];
  units: { title: string; topicIndexes: number[]; pageNumbers: number[] }[];
  furniture: FurnitureDetection;
};

export type OutlineUnitDraft = {
  title: string;
  topics: {
    title: string;
    sourceTitles: string[];
    pageNumbers: number[];
  }[];
};

const QUESTION_PHRASES_TR =
  /\b(hangisi|hangisidir|hangileri|aşağıdakilerden|asagidakilerden|aşağıda verilen|asagida verilen|yukarıdaki|yukaridaki|kaçtır|kactir|nedir|değildir|degildir|doğru olan|dogru olan|yanlış olan|yanlis olan)\b/i;
const QUESTION_PHRASES_EN =
  /\b(which of the following|what is|true\/false|true or false)\b/i;
const ANSWER_OPTION = /^[A-E][).]\s/;
const ROMAN_STATEMENT = /^(I|II|III|IV|V)[.)]\s/;
const PRACTICE_HEADING =
  /\b(test|deneme|soru(lar)?|alıştırma|alistirma|çıkmış sorular|cikmis sorular|practice|exercises?|quiz)\b/i;
const TRAILING_CONJ =
  /\b(ve|ile|veya|için|icin|göre|gore|gibi|olan|of|and|the|for|with|to)\s*$/i;
const CODE_FENCE = /^```/;
const YEAR_LED = /^\s*(1[0-9]{3}|20[0-9]{2})\s+\S/;
/** Chapter number to strip — not a 4-digit year. */
const LEADING_CHAPTER_NUMBER =
  /^\s*(?:\d{1,3}(?:[.)]\d+)*[.)]?|[IVXLC]{1,6}[.)])\s+/;

const GENERIC_SINGLE_WORDS = new Set([
  "durum",
  "bakanlar",
  "giris",
  "giriş",
  "ozet",
  "özet",
  "sonuc",
  "sonuç",
  "not",
  "notlar",
  "ek",
  "ekler",
  "overview",
  "summary",
  "status",
  "notes",
]);

export function foldOutlineKey(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip OCR model formatting without touching LaTeX bodies. */
export function cleanOcrPageText(text: string): string {
  let out = (text ?? "").replace(/\u0000/g, "");
  out = out.replace(/^\s*```[a-zA-Z0-9_-]*\s*\n?/, "");
  out = out.replace(/\n?\s*```\s*$/g, "");
  out = out.replace(/```[a-zA-Z0-9_-]*\n?/g, "");
  out = out.replace(/```/g, "");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*\[METIN_YOK\]\s*$/gim, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeLines(text: string): string[] {
  return cleanOcrPageText(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function isPracticePage(text: string): boolean {
  const lines = normalizeLines(text);
  if (!lines.length) return false;
  const optionLines = lines.filter((line) => ANSWER_OPTION.test(line)).length;
  const questionStems = lines.filter((line) => looksLikeQuestionStem(line)).length;
  if (optionLines >= 3 || questionStems >= 2) return true;
  const head = lines.slice(0, 6).join(" ");
  if (PRACTICE_HEADING.test(head) && (optionLines >= 1 || questionStems >= 1 || /\d/.test(head))) {
    return true;
  }
  // Answer tables: many short A) B) C) rows
  if (optionLines >= 2 && lines.some((line) => /\b(cevap|answer)\b/i.test(line))) {
    return true;
  }
  return false;
}

export function looksLikeQuestionStem(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  if (/\?$/.test(text)) return true;
  if (QUESTION_PHRASES_TR.test(text) || QUESTION_PHRASES_EN.test(text)) return true;
  return false;
}

function unbalancedQuotesOrParens(text: string): boolean {
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 !== 0) return true;
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens !== closes) return true;
  return false;
}

function letterWordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}]{2,}/u.test(w)).length;
}

function startsLowercase(text: string): boolean {
  const first = text.trim().match(/\p{L}/u)?.[0];
  if (!first) return false;
  return first === first.toLocaleLowerCase("tr") && first !== first.toLocaleUpperCase("tr");
}

export type HeadingCandidateContext = {
  practicePage?: boolean;
  furnitureKeys?: Set<string>;
  seriesLabels?: string[];
};

/**
 * Line-level heading filter used by extractHeadings and chapterHeadings.
 */
export function isHeadingCandidate(
  line: string,
  ctx: HeadingCandidateContext = {},
): boolean {
  const text = line.trim();
  if (!text || text.length < 3) return false;
  if (CODE_FENCE.test(text) || text.includes("```")) return false;
  if (looksLikeQuestionStem(text)) return false;
  if (ANSWER_OPTION.test(text)) return false;
  // Roman statement lists (I./II./III.) are never chapter titles in our books.
  if (ROMAN_STATEMENT.test(text)) return false;
  if (/[-–—,]\s*$/.test(text)) return false;
  if (unbalancedQuotesOrParens(text)) return false;
  if (startsLowercase(text)) return false;
  if (TRAILING_CONJ.test(text)) return false;
  const letters = text.replace(/[^\p{L}]/gu, "").length;
  // Need either ≥2 letter-words or one substantial word (≥6 letters).
  if (letterWordCount(text) < 2 && letters < 6 && !/^\d+\.\s+\S/.test(text)) {
    return false;
  }
  if (/^\d+$/.test(text)) return false;
  const folded = foldOutlineKey(text);
  if (ctx.furnitureKeys?.has(folded)) return false;
  for (const label of ctx.seriesLabels ?? []) {
    if (foldOutlineKey(text) === foldOutlineKey(label)) return false;
  }
  // Bare series-like single token that is ALL CAPS / short brand
  if (/^[A-ZÇĞİÖŞÜ0-9]{2,12}$/.test(text) && letterWordCount(text) <= 1) {
    return false;
  }
  return true;
}

/** Title-case shouting OCR lines with Turkish locale. */
export function turkishTitleCase(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const shouting = letters.length > 3 && upper / letters.length > 0.7;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const body = shouting ? word.toLocaleLowerCase("tr") : word;
      return body.charAt(0).toLocaleUpperCase("tr") + body.slice(1);
    })
    .join(" ")
    .trim();
}

/** Strip series label prefix from a heading / title. */
export function stripSeriesLabel(title: string, seriesLabels: string[]): string {
  let out = title.trim();
  for (const label of seriesLabels) {
    const re = new RegExp(`^${escapeRegExp(label)}\\s+`, "i");
    if (re.test(out)) {
      out = out.replace(re, "").trim();
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize topic titles without stripping 4-digit years (1000–2099).
 * Chapter numbers like "3." still drop.
 */
export function normalizeOutlineTitle(title: string): string {
  let out = title.trim();
  if (YEAR_LED.test(out)) {
    // keep year; only drop trailing acronym paren later
  } else {
    out = out.replace(LEADING_CHAPTER_NUMBER, "");
  }
  out = out.replace(/\s*\([^()]{2,20}\)\s*$/, "");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Document-level running header / series / unit detection from light page data.
 */
export function detectPageFurniture(
  pages: { pageNumber: number; text: string; pageKind?: string | null }[],
): FurnitureDetection {
  const content = pages.filter((page) => {
    const kind = page.pageKind ?? "content";
    return kind === "content" || kind === "uncertain" || !page.pageKind;
  });
  if (!content.length) {
    return { seriesLabels: [], unitRuns: [], furnitureLines: [] };
  }

  const firstLastCounts = new Map<string, { count: number; sample: string; pages: number[] }>();
  for (const page of content) {
    const lines = normalizeLines(page.text);
    if (!lines.length) continue;
    for (const line of [lines[0], lines[lines.length - 1]]) {
      if (!line || line.length < 2 || line.length > 60) continue;
      if (looksLikeQuestionStem(line) || ANSWER_OPTION.test(line)) continue;
      const key = foldOutlineKey(line);
      if (!key) continue;
      const row = firstLastCounts.get(key) ?? { count: 0, sample: line, pages: [] };
      row.count += 1;
      row.pages.push(page.pageNumber);
      firstLastCounts.set(key, row);
    }
  }

  const threshold = Math.max(3, Math.ceil(content.length * 0.2));
  const furnitureEntries = [...firstLastCounts.entries()].filter(
    ([, row]) => row.count >= threshold,
  );
  const furnitureLines = furnitureEntries.map(([, row]) => row.sample);

  // Series label = common first token across furniture lines
  const tokenCounts = new Map<string, number>();
  for (const line of furnitureLines) {
    const token = line.trim().split(/\s+/)[0] ?? "";
    if (token.length < 2 || token.length > 12) continue;
    const key = foldOutlineKey(token);
    tokenCounts.set(key, (tokenCounts.get(key) ?? 0) + 1);
  }
  const seriesLabels: string[] = [];
  for (const [key, count] of tokenCounts) {
    if (count >= Math.max(2, Math.ceil(furnitureLines.length * 0.5))) {
      const sample = furnitureLines.find((line) => foldOutlineKey(line.split(/\s+/)[0] ?? "") === key);
      if (sample) seriesLabels.push(sample.trim().split(/\s+/)[0]!);
    }
  }

  // Unit runs: remainder after stripping series label, contiguous pages ≥60%
  const unitMap = new Map<string, number[]>();
  for (const page of content) {
    const lines = normalizeLines(page.text);
    const lead = lines[0] ?? "";
    if (!lead) continue;
    const stripped = stripSeriesLabel(lead, seriesLabels).trim();
    if (!stripped || foldOutlineKey(stripped) === foldOutlineKey(lead) && seriesLabels.some((s) => foldOutlineKey(s) === foldOutlineKey(lead))) {
      // bare series label only
      if (seriesLabels.some((s) => foldOutlineKey(s) === foldOutlineKey(lead))) continue;
    }
    if (!stripped || looksLikeQuestionStem(stripped)) continue;
    const key = foldOutlineKey(stripped);
    if (!key || key.length < 2) continue;
    // Only if this lead is furniture-ish (repeats) or series-prefixed
    const isFurniture = firstLastCounts.has(foldOutlineKey(lead));
    const hasSeries = seriesLabels.some((s) =>
      new RegExp(`^${escapeRegExp(s)}\\s+`, "i").test(lead),
    );
    if (!isFurniture && !hasSeries) continue;
    const pagesFor = unitMap.get(key) ?? [];
    pagesFor.push(page.pageNumber);
    unitMap.set(key, pagesFor);
  }

  const unitRuns: FurnitureDetection["unitRuns"] = [];
  for (const [key, pageNumbers] of unitMap) {
    const unique = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (unique.length < 2) continue;
    // Contiguous density: ≥60% of the span
    const span = unique[unique.length - 1]! - unique[0]! + 1;
    if (unique.length / span < 0.6 && unique.length < 3) continue;
    const sample =
      furnitureLines.find((line) => foldOutlineKey(stripSeriesLabel(line, seriesLabels)) === key) ??
      turkishTitleCase(key);
    unitRuns.push({
      label: turkishTitleCase(stripSeriesLabel(sample, seriesLabels) || sample),
      pageNumbers: unique,
    });
  }

  return { seriesLabels: [...new Set(seriesLabels)], unitRuns, furnitureLines };
}

export function outlineTopicBounds(contentPages: number): {
  unitsMin: number;
  unitsMax: number;
  topicsMin: number;
  topicsMax: number;
  targetUnits: number;
  targetTopics: number;
} {
  if (contentPages <= 40) {
    // Short docs keep existing ceiling behavior; callers use topicCeiling.
    return {
      unitsMin: 1,
      unitsMax: 16,
      topicsMin: 1,
      topicsMax: Math.max(8, Math.round(contentPages * 0.6)),
      targetUnits: Math.max(1, Math.round(contentPages / 15)),
      targetTopics: Math.max(1, Math.round(contentPages / 6)),
    };
  }
  const targetUnits = clamp(Math.round(contentPages / 15), 3, 16);
  const targetTopics = clamp(Math.round(contentPages / 6), targetUnits, 40);
  return {
    unitsMin: 3,
    unitsMax: 16,
    topicsMin: targetUnits,
    topicsMax: 40,
    targetUnits,
    targetTopics,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isFragmentTitle(title: string): boolean {
  const text = title.trim();
  if (/[-–—,]\s*$/.test(text)) return true;
  if (unbalancedQuotesOrParens(text)) return true;
  if (startsLowercase(text)) return true;
  if (TRAILING_CONJ.test(text)) return true;
  if (CODE_FENCE.test(text) || text.includes("```")) return true;
  const letters = text.replace(/[^\p{L}]/gu, "").length;
  // Single substantial words ("Kanunuesası", "BELEDİYELER") are valid topics.
  if (letterWordCount(text) < 1 || letters < 4) return true;
  if (letterWordCount(text) < 2 && letters < 6) return true;
  return false;
}

function isGenericBareWord(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 1) return false;
  return GENERIC_SINGLE_WORDS.has(foldOutlineKey(words[0]!));
}

function needsModelReviewTitle(title: string): boolean {
  const text = title.trim();
  const folded = foldOutlineKey(text);
  // Ambiguous cut-offs that might still be real topics after OCR repair
  if (text.length >= 18 && text.length <= 70 && !/[.!?]$/.test(text)) {
    if (
      /^(bir |turk |meclisin |tbmm|valilerin |baskomutanlik)/i.test(folded) &&
      !looksLikeQuestionStem(text)
    ) {
      return true;
    }
  }
  // Dative/ablative tails that look like cut mid-sentence clauses
  if (/(ligina|madan|mesine|dikten|aktan)$/i.test(folded)) return true;
  if (/^[A-ZÇĞİÖŞÜ].{8,40}$/.test(text) && letterWordCount(text) <= 4 && !/[a-zçğıöşü]/.test(text.slice(1))) {
    return false;
  }
  if (/\s(ile|ve|için|icin|olan|göre|gore)\s*$/i.test(text)) return true;
  if (text.length > 25 && letterWordCount(text) <= 5 && !/[.?!:]$/.test(text) && /[a-zçğıöşü]$/i.test(text)) {
    if (/^(bir |aşağı|asagi|tbmm|meclis|valilerin |bakanlar)/i.test(text)) return true;
  }
  return false;
}

/**
 * Deterministic cleaner over a flat title list (+ page numbers).
 */
export function cleanOutlineDeterministic(input: {
  titles: { title: string; pageNumbers: number[] }[];
  seriesLabels?: string[];
  unitRuns?: FurnitureDetection["unitRuns"];
  contentPageCount?: number;
}): CleanOutlineResult {
  const seriesLabels = input.seriesLabels ?? [];
  const furniture = {
    seriesLabels,
    unitRuns: input.unitRuns ?? [],
    furnitureLines: [],
  };
  const dropped: CleanOutlineResult["dropped"] = [];
  const kept: CleanCandidate[] = [];
  const reattachQueue: { pageNumbers: number[]; afterIndex: number }[] = [];

  for (let i = 0; i < input.titles.length; i += 1) {
    const raw = input.titles[i]!;
    const original = raw.title.trim();
    let reason: string | null = null;

    if (CODE_FENCE.test(original) || original.includes("```")) {
      reason = "code_fence";
    } else if (looksLikeQuestionStem(original)) {
      reason = "question_stem";
    } else if (ANSWER_OPTION.test(original)) {
      reason = "answer_option";
    } else if (PRACTICE_HEADING.test(original) && /\b(test|deneme|quiz)\b/i.test(original)) {
      reason = "practice_heading";
    } else if (seriesLabels.some((s) => foldOutlineKey(s) === foldOutlineKey(original))) {
      reason = "bare_series_label";
    } else if (
      furniture.unitRuns.some((u) => foldOutlineKey(u.label) === foldOutlineKey(stripSeriesLabel(original, seriesLabels)))
      && seriesLabels.some((s) => new RegExp(`^${escapeRegExp(s)}\\s+`, "i").test(original))
    ) {
      reason = "running_unit_header";
    } else if (isFragmentTitle(original)) {
      reason = "fragment";
    } else if (isGenericBareWord(stripSeriesLabel(original, seriesLabels))) {
      reason = "generic_word";
    }

    // Also drop series+unit furniture that matches detected unit runs exactly
    if (!reason) {
      const strippedLead = stripSeriesLabel(original, seriesLabels);
      for (const run of furniture.unitRuns) {
        if (foldOutlineKey(strippedLead) === foldOutlineKey(run.label) && seriesLabels.length) {
          // If title is just "SERIES UNIT" with no extra words → furniture
          const tokens = original.trim().split(/\s+/);
          if (tokens.length <= 3) {
            reason = "running_unit_header";
            break;
          }
        }
      }
    }

    if (reason) {
      dropped.push({ title: original, reason, pageNumbers: raw.pageNumbers });
      reattachQueue.push({ pageNumbers: raw.pageNumbers, afterIndex: kept.length - 1 });
      continue;
    }

    let title = normalizeOutlineTitle(stripSeriesLabel(original, seriesLabels));
    title = turkishTitleCase(title);
    if (!title || letterWordCount(title) < 1) {
      dropped.push({ title: original, reason: "empty_after_strip", pageNumbers: raw.pageNumbers });
      reattachQueue.push({ pageNumbers: raw.pageNumbers, afterIndex: kept.length - 1 });
      continue;
    }

    const review = needsModelReviewTitle(title) || needsModelReviewTitle(original);
    kept.push({
      title,
      sourceTitle: original,
      pageNumbers: [...raw.pageNumbers],
      needsModelReview: review || undefined,
    });
  }

  // Reattach dropped pages to nearest kept neighbour
  for (const item of reattachQueue) {
    if (!item.pageNumbers.length || !kept.length) continue;
    const targetIndex = item.afterIndex >= 0 ? item.afterIndex : 0;
    const target = kept[Math.min(targetIndex, kept.length - 1)]!;
    target.pageNumbers = [...new Set([...target.pageNumbers, ...item.pageNumbers])].sort(
      (a, b) => a - b,
    );
  }

  // Near-duplicate merge (simple)
  const merged: CleanCandidate[] = [];
  for (const candidate of kept) {
    const prev = merged[merged.length - 1];
    if (prev && areOutlineNearDuplicates(prev.title, candidate.title)) {
      prev.pageNumbers = [...new Set([...prev.pageNumbers, ...candidate.pageNumbers])].sort(
        (a, b) => a - b,
      );
      if (candidate.title.length > prev.title.length) prev.title = candidate.title;
      continue;
    }
    merged.push({ ...candidate, pageNumbers: [...candidate.pageNumbers] });
  }

  const bounds = outlineTopicBounds(input.contentPageCount ?? merged.length * 2);
  // Soft trim extreme oversplit before LLM — prefer dropping review-flagged /
  // short titles, never silently cut the document's tail.
  let finalKept = merged;
  if ((input.contentPageCount ?? 0) > 40 && merged.length > 80) {
    const ranked = [...merged].sort((a, b) => {
      const score = (c: CleanCandidate) =>
        (c.needsModelReview ? 0 : 2) + Math.min(c.title.split(/\s+/).length, 6);
      return score(b) - score(a);
    });
    const keptKeys = new Set(ranked.slice(0, 80).map((c) => c.sourceTitle));
    finalKept = merged.filter((c) => keptKeys.has(c.sourceTitle));
    // Reattach pages from trimmed rows
    for (const c of merged) {
      if (keptKeys.has(c.sourceTitle)) continue;
      dropped.push({
        title: c.sourceTitle,
        reason: "over_cap",
        pageNumbers: c.pageNumbers,
      });
      if (finalKept.length) {
        const host = finalKept[finalKept.length - 1]!;
        host.pageNumbers = [...new Set([...host.pageNumbers, ...c.pageNumbers])].sort(
          (a, b) => a - b,
        );
      }
    }
  }

  const units = groupIntoUnits(finalKept, furniture.unitRuns, bounds.targetUnits);

  return { kept: finalKept, dropped, units, furniture };
}

export function areOutlineNearDuplicates(a: string, b: string): boolean {
  const fa = foldOutlineKey(a);
  const fb = foldOutlineKey(b);
  if (fa === fb) return true;
  if (fa.startsWith(fb) || fb.startsWith(fa)) {
    const shorter = Math.min(fa.length, fb.length);
    if (shorter >= 12) return true;
  }
  const wa = new Set(fa.split(" ").filter((w) => w.length >= 4));
  const wb = new Set(fb.split(" ").filter((w) => w.length >= 4));
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const ratio = shared / Math.min(wa.size, wb.size);
  return shared >= 2 && ratio >= 0.75;
}

function groupIntoUnits(
  topics: CleanCandidate[],
  unitRuns: FurnitureDetection["unitRuns"],
  targetUnits: number,
): CleanOutlineResult["units"] {
  if (!topics.length) return [];
  if (unitRuns.length >= 2) {
    const units: CleanOutlineResult["units"] = [];
    const assigned = new Set<number>();
    for (const run of unitRuns) {
      const indexes: number[] = [];
      const pageSet = new Set(run.pageNumbers);
      topics.forEach((topic, index) => {
        if (assigned.has(index)) return;
        if (topic.pageNumbers.some((p) => pageSet.has(p))) {
          indexes.push(index);
          assigned.add(index);
        }
      });
      if (indexes.length) {
        units.push({
          title: run.label,
          topicIndexes: indexes,
          pageNumbers: [...new Set(indexes.flatMap((i) => topics[i]!.pageNumbers))].sort(
            (a, b) => a - b,
          ),
        });
      }
    }
    const rest = topics.map((_, i) => i).filter((i) => !assigned.has(i));
    if (rest.length) {
      units.push({
        title: "Diğer konular",
        topicIndexes: rest,
        pageNumbers: [...new Set(rest.flatMap((i) => topics[i]!.pageNumbers))].sort(
          (a, b) => a - b,
        ),
      });
    }
    if (units.length) return units;
  }

  const count = clamp(targetUnits, 1, Math.max(1, topics.length));
  const size = Math.ceil(topics.length / count);
  const units: CleanOutlineResult["units"] = [];
  for (let i = 0; i < topics.length; i += size) {
    const indexes = topics.slice(i, i + size).map((_, j) => i + j);
    const first = topics[i]!;
    units.push({
      title: first.title,
      topicIndexes: indexes,
      pageNumbers: [...new Set(indexes.flatMap((idx) => topics[idx]!.pageNumbers))].sort(
        (a, b) => a - b,
      ),
    });
  }
  return units;
}

/** Levenshtein distance for outline validator. */
export function editDistance(a: string, b: string): number {
  const s = foldOutlineKey(a);
  const t = foldOutlineKey(b);
  const m = s.length;
  const n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

export function titleEditAcceptable(source: string, proposed: string): boolean {
  if (foldOutlineKey(source) === foldOutlineKey(proposed)) return true;
  // Allow series strip / leading number / casing
  const normSource = foldOutlineKey(normalizeOutlineTitle(source));
  const normProposed = foldOutlineKey(normalizeOutlineTitle(proposed));
  if (normSource === normProposed) return true;
  if (normSource.includes(normProposed) || normProposed.includes(normSource)) {
    const shorter = Math.min(normSource.length, normProposed.length);
    if (shorter >= 8) return true;
  }
  // Merge "A ve B"
  if (/\sve\s/i.test(proposed)) {
    const parts = proposed.split(/\sve\s/i).map((p) => foldOutlineKey(p.trim()));
    if (parts.some((p) => p && (normSource.includes(p) || p.includes(normSource)))) {
      return true;
    }
  }
  const wordsS = normSource.split(" ").filter(Boolean);
  const wordsP = normProposed.split(" ").filter(Boolean);
  if (wordsS.length && wordsP.length && wordsS.length === wordsP.length) {
    let ok = true;
    for (let i = 0; i < wordsS.length; i += 1) {
      const d = editDistance(wordsS[i]!, wordsP[i]!);
      if (d > 2 && d / Math.max(wordsS[i]!.length, 1) > 0.2) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  const dist = editDistance(normSource, normProposed);
  const maxLen = Math.max(normSource.length, normProposed.length, 1);
  return dist <= 2 || dist / maxLen <= 0.2;
}

export type OutlineValidationIssue =
  | { code: "invented_topic"; title: string }
  | { code: "edit_too_large"; title: string; source: string }
  | { code: "missing_chapter"; heading: string }
  | { code: "uncovered_pages"; pages: number[] }
  | { code: "count_bounds"; units: number; topics: number; contentPages: number };

export function validateOutlineLlmResult(input: {
  draft: OutlineUnitDraft[];
  candidates: { title: string; sourceTitle?: string; pageNumbers: number[] }[];
  contentPages: number[];
  numberedChapters?: string[];
  contentPageCount: number;
}): { ok: true } | { ok: false; issues: OutlineValidationIssue[] } {
  const issues: OutlineValidationIssue[] = [];
  const candidateTitles = input.candidates.flatMap((c) =>
    [c.title, c.sourceTitle].filter(Boolean) as string[],
  );
  const allTopics = input.draft.flatMap((u) => u.topics);
  const bounds = outlineTopicBounds(input.contentPageCount);

  if (input.contentPageCount > 40) {
    if (
      input.draft.length < bounds.unitsMin ||
      input.draft.length > bounds.unitsMax ||
      allTopics.length < bounds.topicsMin ||
      allTopics.length > bounds.topicsMax
    ) {
      issues.push({
        code: "count_bounds",
        units: input.draft.length,
        topics: allTopics.length,
        contentPages: input.contentPageCount,
      });
    }
  }

  for (const topic of allTopics) {
    if (!topic.sourceTitles?.length) {
      issues.push({ code: "invented_topic", title: topic.title });
      continue;
    }
    let matched = false;
    for (const source of topic.sourceTitles) {
      const exists = candidateTitles.some(
        (c) => foldOutlineKey(c) === foldOutlineKey(source) || titleEditAcceptable(c, source),
      );
      if (!exists) continue;
      if (!titleEditAcceptable(source, topic.title) && !candidateTitles.some((c) => titleEditAcceptable(c, topic.title))) {
        issues.push({ code: "edit_too_large", title: topic.title, source });
      }
      matched = true;
      break;
    }
    if (!matched) issues.push({ code: "invented_topic", title: topic.title });
  }

  const covered = new Set(allTopics.flatMap((t) => t.pageNumbers));
  const uncovered = input.contentPages.filter((p) => !covered.has(p));
  // Allow small gaps — attach step fills them; reject large holes
  if (uncovered.length > Math.max(3, Math.ceil(input.contentPages.length * 0.15))) {
    issues.push({ code: "uncovered_pages", pages: uncovered });
  }

  for (const heading of input.numberedChapters ?? []) {
    const titles = allTopics.map((t) => t.title);
    const sources = allTopics.flatMap((t) => t.sourceTitles);
    const represented = [...titles, ...sources].some(
      (t) => titleEditAcceptable(heading, t) || foldOutlineKey(t).includes(foldOutlineKey(normalizeOutlineTitle(heading))),
    );
    if (!represented) issues.push({ code: "missing_chapter", heading });
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

/** Build hierarchical units from a validated outline draft. */
export function flattenOutlineUnits(draft: OutlineUnitDraft[]): {
  units: { title: string; topics: { title: string; pageNumbers: number[]; sourceTitles: string[] }[] }[];
  leafTopics: { title: string; pageNumbers: number[]; unitTitle: string }[];
} {
  const units = draft.map((unit) => ({
    title: turkishTitleCase(unit.title),
    topics: unit.topics.map((topic) => ({
      title: turkishTitleCase(topic.title),
      pageNumbers: [...new Set(topic.pageNumbers)].sort((a, b) => a - b),
      sourceTitles: topic.sourceTitles,
    })),
  }));
  const leafTopics = units.flatMap((unit) =>
    unit.topics.map((topic) => ({
      title: topic.title,
      pageNumbers: topic.pageNumbers,
      unitTitle: unit.title,
    })),
  );
  return { units, leafTopics };
}

/** Convert deterministic clean result into OutlineUnitDraft for fallback. */
export function deterministicUnitsAsDraft(result: CleanOutlineResult): OutlineUnitDraft[] {
  return result.units.map((unit) => ({
    title: unit.title,
    topics: unit.topicIndexes.map((index) => {
      const topic = result.kept[index]!;
      return {
        title: topic.title,
        sourceTitles: [topic.sourceTitle],
        pageNumbers: topic.pageNumbers,
      };
    }),
  }));
}
