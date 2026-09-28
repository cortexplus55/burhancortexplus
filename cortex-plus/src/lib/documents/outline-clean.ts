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

const QUESTION_STEM_MARKERS_TR =
  /\b(hangisi|hangisidir|hangileri|aşağıdakilerden|asagidakilerden|aşağıda verilen|asagida verilen)\b/i;
const QUESTION_STEM_MARKERS_MISC_TR =
  /\b(yukarıdaki|yukaridaki|kaçtır|kactir|doğru olan|dogru olan|yanlış olan|yanlis olan)\b/i;
const QUESTION_PHRASES_EN =
  /\b(which of the following|what is|true\/false|true or false)\b/i;
const TOC_PAGE_HEAD = /icindekiler|table\s+of\s+contents|contents\b/i;
const TOC_UNIT_LINE =
  /^\s*(?:ÜNİTE|UNITE|BÖLÜM|BOLUM|Chapter|CHAPTER|Unit|UNIT)\s*\d+\s*[:.\-–]?\s*(.+)/i;
const TOC_NUMBERED_LINE = /^\s*\d+[.)]\s+(.{4,80})/;
const TR_STOPWORD_RE =
  /\b(ve|bir|için|icin|olan|ile|da|de|mi|mu|mı|bu|şu|olarak|gibi|kadar|ancak|veya|ise|ki|ne|için|üzerine|sonra|kadar|olan|değil|degil)\b/gi;
const EN_STOPWORD_RE =
  /\b(the|and|of|to|in|for|with|chapter|unit|section|is|are|was|be|this|that|from)\b/gi;
const EN_TITLE_MINOR = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "as",
]);
const MORPHOLOGICAL_TAIL =
  /(ligina|madan|mesine|dikten|aktan|ina|ine|ndan|nden)$/i;
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
  "status",
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
  if (QUESTION_STEM_MARKERS_TR.test(text) || QUESTION_PHRASES_EN.test(text)) return true;
  if (QUESTION_STEM_MARKERS_MISC_TR.test(text)) return true;
  if (/\b(nedir|değildir|degildir)\b/i.test(text)) {
    if (
      /\b(hangisi|aşağı|asagi|yukarı|yukari|şu|su |bu |hangiler)\b/i.test(text)
    ) {
      return true;
    }
    if (/^(?:\d+[.)]\s*)?(?:aşağı|asagi)\b/i.test(text)) return true;
  }
  return false;
}

/** Heuristic language from stopwords and script. */
export function detectTextLanguage(text: string): "tr" | "en" | "unknown" {
  const sample = (text ?? "").slice(0, 8000);
  if (!sample.trim()) return "unknown";
  const trDiacritics = (sample.match(/[ıİşğüöçŞĞÜÖÇ]/g) ?? []).length;
  const trScore = (sample.match(TR_STOPWORD_RE) ?? []).length + trDiacritics * 2;
  const enScore = (sample.match(EN_STOPWORD_RE) ?? []).length;
  if (trScore >= 3 && trScore > enScore * 1.2) return "tr";
  if (enScore >= 3 && enScore > trScore * 1.2) return "en";
  if (trDiacritics >= 2) return "tr";
  return "unknown";
}

function englishTitleCase(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const shouting = letters.length > 3 && upper / letters.length > 0.7;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const body = shouting ? word.toLowerCase() : word;
      const lower = body.toLowerCase();
      if (index > 0 && EN_TITLE_MINOR.has(lower)) return lower;
      if (!lower.length) return body;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .trim();
}

export function titleCaseForLanguage(
  text: string,
  lang: "tr" | "en" | "unknown",
): string {
  if (lang === "en") return englishTitleCase(text);
  return turkishTitleCase(text);
}

function minPageNumber(topic: CleanCandidate): number {
  if (!topic.pageNumbers.length) return Number.MAX_SAFE_INTEGER;
  return Math.min(...topic.pageNumbers);
}

function trailingTocPageNumber(line: string): number | null {
  const m = line.match(/(?:\.{2,}|…)\s*(\d{1,4})\s*$/) ?? line.match(/\s+(\d{1,4})\s*$/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isTocPage(page: CleanPageInput): boolean {
  if (page.pageKind === "toc") return true;
  const head = foldOutlineKey(cleanOcrPageText(page.text).slice(0, 200));
  return TOC_PAGE_HEAD.test(head);
}

function tocLineDensity(text: string): number {
  const lines = normalizeLines(text);
  if (!lines.length) return 0;
  let hits = 0;
  for (const line of lines) {
    if (TOC_UNIT_LINE.test(line) || TOC_NUMBERED_LINE.test(line)) hits += 1;
  }
  return hits / lines.length;
}

/**
 * TOC head page plus contiguous continuation pages dense with unit/chapter lines.
 */
function collectTocPages(
  pages: { pageNumber: number; text: string; pageKind?: string | null; headings?: string[] }[],
): typeof pages {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const heads = ordered.filter((p) => isTocPage(p));
  if (!heads.length) return [];
  const selected = new Map<number, (typeof pages)[number]>();
  for (const head of heads) selected.set(head.pageNumber, head);
  for (const head of heads) {
    for (const page of ordered) {
      if (page.pageNumber <= head.pageNumber) continue;
      if (page.pageNumber > head.pageNumber + 3) break;
      if (selected.has(page.pageNumber)) continue;
      // Continuation: dense unit/chapter listing, little body prose.
      if (tocLineDensity(page.text) >= 0.35 || page.pageKind === "toc") {
        selected.set(page.pageNumber, page);
        continue;
      }
      break;
    }
  }
  return [...selected.values()].sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Parse table-of-contents pages into ordered unit titles with start pages.
 */
export function extractTocUnits(
  pages: { pageNumber: number; text: string; pageKind?: string | null; headings?: string[] }[],
): { title: string; startPage: number }[] {
  const tocPages = collectTocPages(pages);
  if (!tocPages.length) return [];

  const raw: { title: string; startPage: number }[] = [];
  let fallbackPage = 1;

  for (const page of tocPages) {
    const lines = normalizeLines(page.text);
    for (const line of lines) {
      if (looksLikeQuestionStem(line) || ANSWER_OPTION.test(line)) continue;
      const trimmed = line.trim();
      if (!trimmed || /^\d{1,4}\s*$/.test(trimmed)) continue;

      let title: string | null = null;
      const unitMatch = trimmed.match(TOC_UNIT_LINE);
      if (unitMatch) {
        title = unitMatch[1]!.trim();
      } else {
        const numMatch = trimmed.match(TOC_NUMBERED_LINE);
        if (numMatch) title = numMatch[1]!.trim();
      }
      if (!title || title.length < 4) continue;
      if (looksLikeQuestionStem(title)) continue;
      if (/^[\d.\s]+$/.test(title)) continue;

      title = title.replace(/(?:\.{2,}|…)\s*\d+\s*$/, "").replace(/\s+\d{1,4}\s*$/, "").trim();
      if (!title || title.length < 4) continue;

      const fromLine = trailingTocPageNumber(trimmed);
      const startPage = fromLine ?? fallbackPage;
      fallbackPage = startPage + 1;
      raw.push({ title, startPage });
    }
  }

  const seen = new Set<string>();
  const unique: { title: string; startPage: number }[] = [];
  for (const row of raw) {
    const key = foldOutlineKey(row.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique.sort((a, b) => a.startPage - b.startPage);
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
  // Contents rows are not study topics.
  if (TOC_UNIT_LINE.test(text) || TOC_PAGE_HEAD.test(foldOutlineKey(text))) return false;
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

const TR_TITLE_MINOR = new Set([
  "ve",
  "ile",
  "veya",
  "ya",
  "de",
  "da",
  "ki",
  "icin",
  "için",
]);

/** Title-case shouting OCR lines with Turkish locale. */
export function turkishTitleCase(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const shouting = letters.length > 3 && upper / letters.length > 0.7;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const body = shouting ? word.toLocaleLowerCase("tr") : word;
      const lower = body.toLocaleLowerCase("tr");
      if (index > 0 && TR_TITLE_MINOR.has(lower)) return lower;
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
  const lang = detectTextLanguage(pages.map((p) => p.text).join("\n"));
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

  // Per-line furniture threshold. Unit-specific running headers each cover a
  // fraction of the book, so keep this modest; series detection uses page leads.
  const threshold = Math.max(3, Math.ceil(content.length * 0.08));
  const furnitureEntries = [...firstLastCounts.entries()].filter(
    ([, row]) => row.count >= threshold,
  );
  const furnitureLines = furnitureEntries.map(([, row]) => row.sample);

  // Series label = short first token that leads many content pages (not only
  // furniture lines that already passed the per-line threshold). Handles books
  // where the series token is constant but the unit label after it changes.
  const leadTokenPages = new Map<string, { count: number; sample: string }>();
  for (const page of content) {
    const lead = normalizeLines(page.text)[0] ?? "";
    const token = lead.trim().split(/\s+/)[0] ?? "";
    if (token.length < 2 || token.length > 12) continue;
    if (!/^[A-ZÇĞİÖŞÜ0-9]{2,12}$/u.test(token) && !/^[A-Za-zÇĞİÖŞÜçğıöşü0-9]{2,12}$/u.test(token)) {
      continue;
    }
    // Prefer brand-like tokens (mostly letters, often shouting / short).
    if (/\d{3,}/.test(token)) continue;
    const key = foldOutlineKey(token);
    if (!key) continue;
    const row = leadTokenPages.get(key) ?? { count: 0, sample: token };
    row.count += 1;
    leadTokenPages.set(key, row);
  }
  const seriesLabels: string[] = [];
  const seriesThreshold = Math.max(4, Math.ceil(content.length * 0.25));
  for (const [, row] of leadTokenPages) {
    if (row.count >= seriesThreshold) seriesLabels.push(row.sample);
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
      key;
    const stripped = stripSeriesLabel(sample, seriesLabels) || sample;
    unitRuns.push({
      label: titleCaseForLanguage(stripped, lang),
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

function endsWithLowercaseLetter(text: string): boolean {
  const last = text.trim().match(/\p{L}$/u)?.[0];
  if (!last) return false;
  return last === last.toLocaleLowerCase("tr") && last !== last.toLocaleUpperCase("tr");
}

function needsModelReviewTitle(title: string): boolean {
  const text = title.trim();
  const folded = foldOutlineKey(text);
  if (/[-–—,]\s*$/.test(text)) return true;
  if (unbalancedQuotesOrParens(text)) return true;

  const words = letterWordCount(text);
  if (MORPHOLOGICAL_TAIL.test(folded) && (words >= 3 || text.length >= 25)) {
    return true;
  }

  if (
    text.length >= 18 &&
    text.length <= 70 &&
    !/[.!?]$/.test(text) &&
    endsWithLowercaseLetter(text) &&
    words >= 4
  ) {
    const endsPostposition = TRAILING_CONJ.test(text);
    if (startsLowercase(text) || endsPostposition) return true;
  }

  return false;
}

/**
 * Deterministic cleaner over a flat title list (+ page numbers).
 */
function isShoutingTitle(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.7;
}

/**
 * Infer unit runs from a flat title list when TOC / furniture is absent.
 * Prefers series-prefixed short labels and shouting section headers.
 */
export function inferUnitRunsFromTitles(
  titles: { title: string; pageNumbers: number[] }[],
  seriesLabels: string[],
): FurnitureDetection["unitRuns"] {
  const runs = new Map<string, { label: string; pages: number[] }>();
  for (const row of titles) {
    const original = row.title.trim();
    if (!original || looksLikeQuestionStem(original)) continue;
    const hasSeries = seriesLabels.some((s) =>
      new RegExp(`^${escapeRegExp(s)}\\s+\\S`, "i").test(original),
    );
    const stripped = stripSeriesLabel(original, seriesLabels).trim();
    if (!stripped || looksLikeQuestionStem(stripped)) continue;
    if (seriesLabels.some((s) => foldOutlineKey(s) === foldOutlineKey(stripped))) {
      continue;
    }
    const tokens = stripped.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    // Unit labels: short series-prefixed lines, or shouting headers ≤5 tokens.
    const shouting = isShoutingTitle(stripped) || isShoutingTitle(original);
    const maxTokens = hasSeries || shouting ? 5 : 3;
    if (tokens.length > maxTokens) continue;
    if (!hasSeries && !shouting) continue;
    const key = foldOutlineKey(stripped);
    if (!key || key.length < 3) continue;
    const rowRun = runs.get(key) ?? {
      label: titleCaseForLanguage(stripped, detectTextLanguage(stripped)),
      pages: [],
    };
    rowRun.pages.push(...row.pageNumbers);
    runs.set(key, rowRun);
  }
  return [...runs.values()]
    .map((r) => ({
      label: r.label,
      pageNumbers: [...new Set(r.pages)].sort((a, b) => a - b),
    }))
    .filter((r) => r.pageNumbers.length >= 1)
    .sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));
}

export function cleanOutlineDeterministic(input: {
  titles: { title: string; pageNumbers: number[] }[];
  seriesLabels?: string[];
  unitRuns?: FurnitureDetection["unitRuns"];
  tocUnits?: { title: string; startPage: number }[];
  contentPageCount?: number;
  language?: "tr" | "en" | "unknown";
}): CleanOutlineResult {
  const seriesLabels = input.seriesLabels ?? [];
  const inferred =
    input.unitRuns?.length || input.tocUnits?.length
      ? []
      : inferUnitRunsFromTitles(input.titles, seriesLabels);
  const unitRuns = input.unitRuns?.length ? input.unitRuns : inferred;
  const furniture = {
    seriesLabels,
    unitRuns,
    furnitureLines: [],
  };
  const lang =
    input.language ??
    detectTextLanguage(
      input.titles.map((t) => t.title).join("\n"),
    );
  const unitLabelKeys = new Set(
    unitRuns.map((u) => foldOutlineKey(stripSeriesLabel(u.label, seriesLabels))),
  );
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
      unitLabelKeys.has(foldOutlineKey(stripSeriesLabel(original, seriesLabels)))
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
    title = titleCaseForLanguage(title, lang);
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
  let finalKept = merged;
  if ((input.contentPageCount ?? 0) > 40 && merged.length > bounds.topicsMax) {
    const ranked = [...merged].sort((a, b) => {
      const score = (c: CleanCandidate) => {
        const wordLen = c.title.split(/\s+/).length;
        return (c.needsModelReview ? 0 : 10) + wordLen;
      };
      return score(b) - score(a);
    });
    const keptKeys = new Set(ranked.slice(0, bounds.topicsMax).map((c) => c.sourceTitle));
    finalKept = merged.filter((c) => keptKeys.has(c.sourceTitle));
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

  const units = groupIntoUnits(finalKept, unitRuns, input.tocUnits, seriesLabels, lang);

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
  tocUnits: { title: string; startPage: number }[] | undefined,
  seriesLabels: string[],
  lang: "tr" | "en" | "unknown",
): CleanOutlineResult["units"] {
  if (!topics.length) return [];

  const buildUnit = (title: string, indexes: number[]): CleanOutlineResult["units"][number] => ({
    title: titleCaseForLanguage(stripSeriesLabel(title, seriesLabels), lang),
    topicIndexes: indexes,
    pageNumbers: [...new Set(indexes.flatMap((i) => topics[i]!.pageNumbers))].sort(
      (a, b) => a - b,
    ),
  });

  if (tocUnits?.length) {
    const skeleton = [...tocUnits].sort((a, b) => a.startPage - b.startPage);
    const bucketCount = skeleton.length;
    const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
    for (let ti = 0; ti < topics.length; ti += 1) {
      const page = minPageNumber(topics[ti]!);
      let unitIdx = skeleton.length - 1;
      if (page < skeleton[0]!.startPage) {
        unitIdx = 0;
      } else {
        for (let u = 0; u < skeleton.length; u += 1) {
          const nextStart = skeleton[u + 1]?.startPage ?? Number.MAX_SAFE_INTEGER;
          if (page >= skeleton[u]!.startPage && page < nextStart) {
            unitIdx = u;
            break;
          }
        }
      }
      buckets[unitIdx]!.push(ti);
    }
    return skeleton
      .map((unit, i) => buildUnit(unit.title, buckets[i]!))
      .filter((u) => u.topicIndexes.length > 0);
  }

  if (unitRuns.length >= 1) {
    const sorted = [...unitRuns].sort(
      (a, b) => Math.min(...a.pageNumbers) - Math.min(...b.pageNumbers),
    );
    const ranges = sorted.map((run, i) => ({
      label: run.label,
      start: Math.min(...run.pageNumbers),
      end: i + 1 < sorted.length ? Math.min(...sorted[i + 1]!.pageNumbers) : Number.MAX_SAFE_INTEGER,
    }));
    const buckets: number[][] = ranges.map(() => []);
    for (let ti = 0; ti < topics.length; ti += 1) {
      const page = minPageNumber(topics[ti]!);
      let idx = 0;
      if (page < ranges[0]!.start) {
        idx = 0;
      } else {
        for (let r = 0; r < ranges.length; r += 1) {
          if (page >= ranges[r]!.start && page < ranges[r]!.end) {
            idx = r;
            break;
          }
          if (r === ranges.length - 1) idx = r;
        }
      }
      buckets[idx]!.push(ti);
    }
    return ranges
      .map((range, i) => buildUnit(range.label, buckets[i]!))
      .filter((u) => u.topicIndexes.length > 0);
  }

  return [
    buildUnit(
      topics[0]!.title,
      topics.map((_, i) => i),
    ),
  ];
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
export function flattenOutlineUnits(
  draft: OutlineUnitDraft[],
  language?: "tr" | "en" | "unknown",
): {
  units: { title: string; topics: { title: string; pageNumbers: number[]; sourceTitles: string[] }[] }[];
  leafTopics: { title: string; pageNumbers: number[]; unitTitle: string }[];
} {
  const lang =
    language ??
    detectTextLanguage(
      draft.flatMap((u) => [u.title, ...u.topics.map((t) => t.title)]).join("\n"),
    );
  const units = draft.map((unit) => ({
    title: titleCaseForLanguage(unit.title, lang),
    topics: unit.topics.map((topic) => ({
      title: titleCaseForLanguage(topic.title, lang),
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
