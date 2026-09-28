/**
 * Does the cited page range really cover this topic? Code-only check, no
 * subject word lists: every rule below is about how words are distributed in
 * the student's own material.
 *
 * - Tokens: Turkish-aware folding, apostrophe suffixes dropped
 *   ("Türkiye'nin" → "turkiye"), light suffix stripping that never cuts a
 *   word below 5 letters, soft final consonants hardened ("termodinamiğ" →
 *   "termodinamik"), a buffer-letter leftover may be the bare word ("yasas"
 *   ~ "yasa"), and prefix matching (≥5 letters; 4 letters with a short
 *   suffix) so "memur" and "memurluğu" are the same word. English text is
 *   never Turkish-stemmed.
 * - Generic words (function words, "you will learn", "konu", "temel"…) are
 *   not evidence.
 * - Title words carry the decision. A word that occurs on a large share of
 *   the file's pages proves nothing; a rare word that is also concentrated
 *   in the cited range proves a lot (IDF-like weighting).
 * - A year in the title must appear on the cited pages.
 * - A title word the whole file never uses was not taken from it.
 * - One- to four-page files (Word notes, a few slides) have no rare words:
 *   there half of the title words must be on the cited page.
 */

import { foldTr } from "@/lib/documents/page-analysis";

export type GroundingLang = "tr" | "en";

/** Share of Turkish-only letters above which a text is treated as Turkish. */
const TURKISH_LETTER_SHARE = 0.01;

export function detectGroundingLang(text: string): GroundingLang {
  let letters = 0;
  let turkish = 0;
  const sample = text.length > 200_000 ? text.slice(0, 200_000) : text;
  for (const ch of sample) {
    if (/\p{L}/u.test(ch)) letters += 1;
    if ("çğıöşüÇĞİÖŞÜ".includes(ch)) turkish += 1;
  }
  return letters && turkish / letters >= TURKISH_LETTER_SHARE ? "tr" : "en";
}

/** Folded (ı→i, ş→s …) function words and generic study/structure words. */
const STOPWORDS = new Set(
  [
    // Turkish function words
    "ve", "veya", "ile", "icin", "bir", "iki", "bu", "su", "olan", "olarak", "gibi", "kadar",
    "ancak", "ise", "ki", "ne", "degil", "daha", "cok", "her", "tum", "butun", "hem", "yani",
    "gore", "uzere", "arasi", "arasinda", "arasindaki", "sonra", "once", "diger", "baska",
    "nasil", "neden", "hangi", "nedir", "olur", "olmak", "olmasi", "eden", "etmek", "edilen",
    "ilgili", "iliskin", "dair", "karsi", "icinde", "uzerine", "uzerinde", "boyunca", "sekilde",
    // Generic Turkish study / structure words (never subject words)
    "ogren", "ogrenme", "ogrenmek", "ogreneceksin", "ogrenirsin", "ogrenecek", "ogrenci",
    "konu", "konusu", "konulari", "konular", "konusunu",
    "tur", "turu", "turler", "turleri", "turlerini", "turlerinin",
    "yil", "yili", "yilin", "yilinda", "yillar", "yapil", "yapilan", "yapilir", "yapilmasi",
    "sistem", "sistemi", "temel", "temelleri", "genel", "kavram", "kavrami", "kavramlar",
    "kavramlari", "ozellik", "ozellikleri", "onem", "onemi", "onemli", "bolum", "bolumu",
    "unite", "kisim", "giris", "ozet", "soru", "sorular", "ornek", "ornekler", "test", "tanim",
    "tanimi", "esas", "esaslar", "esaslari", "ilke", "ilkeler", "ilkeleri", "calis", "calisma",
    "anlama", "anlamak", "sinav", "sinavda", "sorulabilecek", "bilgi", "bilgiler", "uygulama",
    "uygulamalar",
    // English function / generic study words
    "the", "and", "for", "with", "from", "into", "onto", "about", "that", "this", "these",
    "those", "you", "your", "will", "can", "how", "what", "why", "when", "which", "who", "its",
    "their", "they", "them", "our", "are", "was", "were", "has", "have", "had", "also", "more",
    "most", "some", "such", "other", "than", "then", "there", "here", "each", "both", "all",
    "any", "use", "using", "used", "uses", "learn", "learning", "learns", "understand",
    "introduction", "overview", "basic", "basics", "chapter", "section", "part", "lesson",
    "study", "practice", "example", "examples", "exercise", "exercises", "work", "working",
    "way", "ways", "new", "via", "between", "through", "over", "under",
  ].map((w) => w),
);

const TR_SUFFIXES = [
  "lerinden", "larindan", "lerinin", "larinin", "lerine", "larina", "lerini", "larini",
  "lerden", "lardan", "lerin", "larin", "lerde", "larda", "sinin", "sunun", "sini", "sunu",
  "leri", "lari", "ler", "lar", "nin", "nun", "den", "dan", "ten", "tan", "si", "su", "de",
  "da", "te", "ta", "in", "un", "i", "u", "e", "a",
].sort((a, b) => b.length - a.length);

/** A stem is never cut below this many letters. */
export const MIN_STEM_CHARS = 5;
/** Prefix matching ("memur" ~ "memurlugu") only for stems this long. */
const MIN_PREFIX_MATCH = 5;
/** Four-letter stems match only when the other side adds a short suffix. */
const SHORT_PREFIX_MATCH = 4;

/** Soft final consonant back to its dictionary form: termodinamiğ → termodinamik, kitab → kitap. */
const TR_SOFT_TO_HARD: Record<string, string> = { g: "k", b: "p", d: "t" };

function stemTr(token: string): string {
  let out = token;
  for (let round = 0; round < 2; round += 1) {
    let changed = false;
    for (const suffix of TR_SUFFIXES) {
      if (out.length - suffix.length < MIN_STEM_CHARS) continue;
      if (!out.endsWith(suffix)) continue;
      out = out.slice(0, out.length - suffix.length);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  const hard = out.length >= 5 ? TR_SOFT_TO_HARD[out.at(-1)!] : undefined;
  return hard ? out.slice(0, -1) + hard : out;
}

function stemEn(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && /(ss|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

const YEAR = /^(1[0-9]|20)\d\d$/;

/** Grounding tokens for one text. Years are kept; other numbers are not. */
export function groundingTokens(text: string, lang: GroundingLang = detectGroundingLang(text)): string[] {
  const folded = foldTr(text.replace(/['’‘`´][\p{L}]+/gu, " "))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return [];
  const out = new Set<string>();
  for (const raw of folded.split(" ")) {
    if (/^\d+$/.test(raw)) {
      if (YEAR.test(raw)) out.add(raw);
      continue;
    }
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    const stem = lang === "tr" ? stemTr(raw) : stemEn(raw);
    if (STOPWORDS.has(stem)) continue;
    if (lang === "tr" && BUFFER_LEFTOVER.test(stem) && STOPWORDS.has(stem.slice(0, -1))) continue;
    out.add(stem);
  }
  return [...out];
}

type PageEntry = { set: Set<string>; sorted: string[] };

export type GroundingFile = {
  lang: GroundingLang;
  pages: Map<number, PageEntry>;
  pageCount: number;
  /** Pages (anywhere in the file) that contain a query token — cached. */
  dfCache: Map<string, number>;
};

function lowerBound(sorted: string[], q: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Longest suffix a short (4-letter) stem may carry and still be the same word. */
const SHORT_STEM_SUFFIX = 3;

/**
 * A stem left with a buffer letter after a vowel ("yasas" from "yasası",
 * "yasan" from "yasanın") may also be the bare word ("yasa").
 */
const BUFFER_LEFTOVER = /^[a-z]{3,}[aeiou][sny]$/;

function pageHas(page: PageEntry | undefined, q: string): boolean {
  if (!page) return false;
  if (wordOnPage(page, q)) return true;
  return BUFFER_LEFTOVER.test(q) && wordOnPage(page, q.slice(0, -1));
}

function wordOnPage(page: PageEntry, q: string): boolean {
  if (page.set.has(q)) return true;
  if (q.length < SHORT_PREFIX_MATCH || /^\d/.test(q)) return false;
  // The title word is the start of a page word ("memur" ~ "memurluğu").
  for (let i = lowerBound(page.sorted, q); i < page.sorted.length; i += 1) {
    const word = page.sorted[i]!;
    if (!word.startsWith(q)) break;
    if (q.length >= MIN_PREFIX_MATCH || word.length - q.length <= SHORT_STEM_SUFFIX) return true;
  }
  // A page word is the start of the title word ("yasa" ~ "yasas").
  for (let len = SHORT_PREFIX_MATCH; len < q.length; len += 1) {
    if (len < MIN_PREFIX_MATCH && q.length - len > SHORT_STEM_SUFFIX) continue;
    if (page.set.has(q.slice(0, len))) return true;
  }
  return false;
}

export function buildGroundingFile(
  pages: Map<number, string>,
  lang: GroundingLang = detectGroundingLang([...pages.values()].join("\n")),
): GroundingFile {
  const entries = new Map<number, PageEntry>();
  for (const [pageNumber, text] of pages) {
    const tokens = groundingTokens(text ?? "", lang);
    entries.set(pageNumber, { set: new Set(tokens), sorted: [...tokens].sort() });
  }
  return { lang, pages: entries, pageCount: Math.max(1, entries.size), dfCache: new Map() };
}

function documentFrequency(file: GroundingFile, token: string): number {
  const cached = file.dfCache.get(token);
  if (cached !== undefined) return cached;
  let df = 0;
  for (const page of file.pages.values()) if (pageHas(page, token)) df += 1;
  file.dfCache.set(token, df);
  return df;
}

/** Title words on more than this share of the file's pages prove nothing. */
export const COMMON_PAGE_SHARE = 0.3;
/** Beyond this span, a hit must be concentrated in the range, not scattered. */
export const WIDE_RANGE_PAGES = 8;
/** Weighted share of distinctive title words that must be on the cited pages. */
export const TITLE_COVERAGE = 0.75;
/**
 * Files this short (a Word note, a few slides) have no "common" vs "rare"
 * words: every word is on every page. There, half of the title words must be
 * on the cited pages ("Termodinamiğin İkinci Yasası" on a slide about the
 * second law and entropy), and the "absent from the file" rule is off.
 */
export const SHORT_FILE_PAGES = 5;
export const SHORT_FILE_COVERAGE = 0.5;
/** A distinctive hit counts as "concentrated" above this lift over chance. */
export const CONCENTRATION_LIFT = 2;

export type GroundingInput = {
  title: string;
  whyLearn?: string | null;
  likelyAsked?: string[];
  pageStart: number;
  pageEnd: number;
};

export type GroundingVerdict = {
  grounded: boolean;
  reason:
    | "ok"
    | "empty_range"
    | "no_title_tokens"
    | "year_missing"
    | "low_title_coverage"
    | "absent_word"
    | "scattered";
};

export function groundTopic(file: GroundingFile, input: GroundingInput): GroundingVerdict {
  const start = Math.max(1, Math.min(input.pageStart, input.pageEnd));
  const end = Math.max(input.pageStart, input.pageEnd);
  const range: PageEntry[] = [];
  for (let p = start; p <= end; p += 1) {
    const page = file.pages.get(p);
    if (page && page.set.size) range.push(page);
  }
  if (!range.length) return { grounded: false, reason: "empty_range" };

  const title = groundingTokens(input.title, file.lang);
  if (!title.length) return { grounded: false, reason: "no_title_tokens" };

  const inRange = (t: string) => range.filter((page) => pageHas(page, t)).length;

  for (const t of title) {
    if (YEAR.test(t) && inRange(t) === 0) return { grounded: false, reason: "year_missing" };
  }
  const words = title.filter((t) => !YEAR.test(t));
  if (!words.length) return { grounded: true, reason: "ok" };

  const N = file.pageCount;
  const stats = words.map((t) => {
    const df = documentFrequency(file, t);
    const hits = inRange(t);
    return {
      t,
      df,
      hits,
      common: df / N > COMMON_PAGE_SHARE,
      weight: Math.log(1 + N / (1 + df)),
    };
  });
  if (N < SHORT_FILE_PAGES) {
    const hit = stats.filter((s) => s.hits > 0).length;
    return hit / stats.length >= SHORT_FILE_COVERAGE
      ? { grounded: true, reason: "ok" }
      : { grounded: false, reason: "low_title_coverage" };
  }
  // A title word the material never uses anywhere was not taken from it.
  if (stats.some((s) => s.df === 0)) return { grounded: false, reason: "absent_word" };
  const distinctive = stats.filter((s) => !s.common);
  if (!distinctive.length) {
    // Only everyday words of this material: they must all be on the pages.
    return stats.every((s) => s.hits > 0)
      ? { grounded: true, reason: "ok" }
      : { grounded: false, reason: "low_title_coverage" };
  }
  const total = distinctive.reduce((n, s) => n + s.weight, 0);
  const covered = distinctive.filter((s) => s.hits > 0).reduce((n, s) => n + s.weight, 0);
  if (covered / total < TITLE_COVERAGE) return { grounded: false, reason: "low_title_coverage" };

  const span = range.length;
  if (span > WIDE_RANGE_PAGES) {
    // A wide citation must be where these words live, not a place they pass through.
    const concentrated = distinctive.some(
      (s) => s.hits > 0 && s.hits / span >= CONCENTRATION_LIFT * (s.df / N),
    );
    if (!concentrated) return { grounded: false, reason: "scattered" };
  }
  return { grounded: true, reason: "ok" };
}
