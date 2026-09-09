/**
 * Heuristic per-page analysis for PDF learning Stage 2.
 * Pure functions — no AI, no I/O — so unit tests and smoke probes stay free.
 */

export type PageKind =
  | "content"
  | "cover"
  | "toc"
  | "answer_key"
  | "blank"
  | "unreadable"
  | "uncertain";

export type ExtractionMethod = "text_layer" | "ocr" | "visual" | "manual" | "none";

export type PageAnalysis = {
  pageNumber: number;
  textContent: string;
  extractionOk: boolean;
  pageKind: PageKind;
  headings: string[];
  formulas: string[];
  tablesDetected: number;
  imagesDetected: number;
  uncertainRegions: string[];
  extractionMethod: ExtractionMethod;
  charCount: number;
};

const COVER_HINTS =
  /\b(kapak|cover|on\s*soz|yazar|yayinevi|copyright|isbn)\b/i;
const TOC_HINTS =
  /\b(icindekiler|table\s+of\s+contents|\bicerik\b|konu\s*basliklari)\b/i;
const ANSWER_HINTS =
  /\b(cevap\s*anahtari|dogru\s*cevaplar|answer\s*key|solutions?\s*key)\b/i;
const HEADING_LINE =
  /^(?:(?:\d+(?:\.\d+){0,3})|[IVXLC]{1,6})[.)\s-]+.{2,80}$|^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9\s\-–—:]{6,80}$/;
const FORMULA_PATTERNS = [
  /sin\s*[²³ⁿ⁰-⁹(]|\bcos\b|\btan\b|\bcot\b|\bsec\b|\bcsc\b/i,
  /[π∞√∑∫≈≠≤≥±×÷°]/,
  /\b\d+\s*[°º]\b/,
  /[=≠≈≤≥].{0,40}[=≠≈≤≥]/,
  /\^[0-9n]|[₀-₉]/,
];
const TABLE_HINT =
  /(?:\|[^|\n]+){2,}\||(?:\t[^\t\n]+){2,}/;

/** Fold Turkish letters so ASCII-ish regexes match KAPAK / İÇİNDEKİLER. */
export function foldTr(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .toLowerCase();
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function extractHeadings(text: string): string[] {
  const lines = normalizeLines(text);
  const headings: string[] = [];
  for (const [index, line] of lines.slice(0, 24).entries()) {
    if (line.length < 4 || line.length > 90) continue;
    const numbered = /^(?:\d+(?:\.\d+){0,3}|[IVXLC]{1,6})[.)\s-]+.{2,80}$/.test(
      line,
    );
    const markdown = /^#{1,3}\s+/.test(line);
    const allCaps = HEADING_LINE.test(line) && line === line.toLocaleUpperCase("tr");
    // Only treat the first short line as a title candidate — avoids formula noise.
    const leadTitle =
      index === 0 &&
      line.length <= 70 &&
      !/[.!?…=]$/.test(line) &&
      !FORMULA_PATTERNS.some((pattern) => pattern.test(line));
    if (numbered || markdown || allCaps || leadTitle) {
      const cleaned = line.replace(/^#{1,3}\s+/, "").trim();
      if (!headings.includes(cleaned)) headings.push(cleaned);
    }
  }
  return headings.slice(0, 8);
}

export function extractFormulas(text: string): string[] {
  const formulas: string[] = [];
  for (const line of normalizeLines(text)) {
    if (FORMULA_PATTERNS.some((pattern) => pattern.test(line))) {
      formulas.push(line.slice(0, 160));
    }
  }
  return [...new Set(formulas)].slice(0, 20);
}

export function classifyPageKind(text: string, pageNumber: number): PageKind {
  const trimmed = text.trim();
  const charCount = trimmed.length;

  if (charCount === 0) return "blank";

  const sample = foldTr(trimmed.slice(0, 800));
  // Structural kinds win before the thin-text unreadable cutoff — short TOC /
  // answer-key pages are common and must not be reported as OCR gaps.
  if (pageNumber === 1 && COVER_HINTS.test(sample) && charCount < 900) {
    return "cover";
  }
  if (TOC_HINTS.test(sample)) return "toc";
  if (ANSWER_HINTS.test(sample)) return "answer_key";

  if (charCount < 40) return "unreadable";
  if (charCount < 80) return "uncertain";
  return "content";
}

export function analyzePage(
  pageNumber: number,
  text: string,
): PageAnalysis {
  const textContent = text.replace(/\u0000/g, "");
  const charCount = textContent.trim().length;
  const pageKind = classifyPageKind(textContent, pageNumber);
  const headings = extractHeadings(textContent);
  const formulas = extractFormulas(textContent);
  const tablesDetected = TABLE_HINT.test(textContent) ? 1 : 0;

  const uncertainRegions: string[] = [];
  if (pageKind === "unreadable" || pageKind === "blank") {
    uncertainRegions.push("Sayfadan anlamlı metin çıkarılamadı; taranmış veya görsel ağırlıklı olabilir.");
  } else if (formulas.length >= 4 && charCount < 200) {
    // Prefer the visual-gap signal over "too short" when the page is formula-dense.
    uncertainRegions.push("Formül/grafik ağırlıklı görünüyor; görsel analiz henüz yok.");
  } else if (pageKind === "uncertain") {
    uncertainRegions.push("Çıkarılan metin çok kısa; kapsam belirsiz.");
  }

  const extractionOk =
    pageKind !== "blank" &&
    pageKind !== "unreadable" &&
    charCount >= 40;

  return {
    pageNumber,
    textContent,
    extractionOk,
    pageKind,
    headings,
    formulas,
    tablesDetected,
    imagesDetected: 0,
    uncertainRegions,
    extractionMethod: extractionOk ? "text_layer" : "none",
    charCount,
  };
}

export function analyzePages(pages: string[]): PageAnalysis[] {
  return pages.map((text, index) => analyzePage(index + 1, text));
}
