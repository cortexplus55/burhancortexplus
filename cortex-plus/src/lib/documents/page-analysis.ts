/**
 * Heuristic per-page analysis for PDF learning Stage 2.
 * Pure functions — no AI, no I/O — so unit tests and smoke probes stay free.
 */

import {
  cleanOcrPageText,
  isHeadingCandidate,
  isPracticePage,
} from "@/lib/documents/outline-clean";
import { foldTr } from "@/lib/text/math-normalize";

export { foldTr };

export type PageKind =
  | "content"
  | "cover"
  | "toc"
  | "answer_key"
  | "blank"
  | "unreadable"
  | "uncertain"
  /** Kaynakça / referans listesi (Faz 10, 20 Kasım 2026): öğretilmez, ünite açmaz, etkin sayfaya sayılmaz. */
  | "bibliography"
  /** Yalnız başlık (ya da logo + başlık) taşıyan slayt / ara sayfa: yapı ipucudur, öğretilecek bilgi yoktur. */
  | "title_only";

/** Veritabanının `page_kind` CHECK listesi (20260908152147). Yeni türler yazılırken bu kümeye çevrilir. */
export type StoredPageKind = "content" | "cover" | "toc" | "answer_key" | "blank" | "unreadable" | "uncertain";

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
/**
 * İçindekiler yalnızca başlıkla tanınır.
 *
 * Listede `\bicerik\b` de vardı; "içerik" gündelik bir kelime olduğu için bir
 * tablo hücresindeki "Organik içerik belirgin" satırı, dolu bir öğretim
 * sayfasını içindekiler sanıp müfredat dışına attı. Geçerken anılması değil,
 * sayfanın başında başlık olarak durması aranıyor.
 */
const TOC_HINTS = /\b(icindekiler|table\s+of\s+contents|konu\s*basliklari)\b/i;
/** Başlık sayfanın en başında olmalı — gövdede geçmesi içindekiler yapmaz. */
const TOC_HEAD_WINDOW = 200;
const ANSWER_HINTS =
  /\b(cevap\s*anahtari|dogru\s*cevaplar|answer\s*key|solutions?\s*key)\b/i;
/** Kaynakça başlığı sayfanın başında (gövdede geçmesi kaynakça yapmaz; içindekilerle aynı kural). */
const BIBLIOGRAPHY_HEAD =
  /^[#*\s\d.)-]*(kaynakca|kaynaklar|yararlanilan kaynaklar|basvuru kaynaklari|references|bibliography|works cited|further reading)\b/;
/** Künye satırı: yıl, yayınevi, sayfa aralığı, DOI / ISBN / bağlantı. */
const CITATION_LINE =
  /(\((?:19|20)\d{2}[a-z]?\)|\b(?:19|20)\d{2}[a-z]?[.,)]|\bdoi\b|\bisbn\b|https?:\/\/|\bpp?\.\s*\d|\b(?:yayinlari|yayinevi|press|publisher|publishing|edition|baski|cilt|vol\.))/;
/** Cevap anahtarı ızgarası başlıksız da tanınır: "1-A 2-C 3) B …". */
const ANSWER_GRID_ITEM = /(?:^|\s)\d{1,3}\s*[-.):]\s*[a-e](?=\s|$|[,;])/gi;
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

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function extractHeadings(text: string): string[] {
  const practice = isPracticePage(text);
  const lines = normalizeLines(cleanOcrPageText(text));
  const headings: string[] = [];
  for (const [index, line] of lines.slice(0, 24).entries()) {
    if (line.length < 4 || line.length > 90) continue;
    // Practice pages contribute no headings (questions still usable elsewhere).
    if (practice) continue;
    const numbered = /^(?:\d+(?:\.\d+){0,3}|[IVXLC]{1,6})[.)\s-]+.{2,80}$/.test(
      line,
    );
    const markdown = /^#{1,3}\s+/.test(line);
    const allCaps = HEADING_LINE.test(line) && line === line.toLocaleUpperCase("tr");
    // Early lines: running headers sit on line 0; real section titles often on 1–2.
    // Require no sentence terminator so body prose stays out.
    const earlyTitle =
      index <= 2 &&
      line.length <= 70 &&
      !/[.!?…=]$/.test(line) &&
      !FORMULA_PATTERNS.some((pattern) => pattern.test(line));
    if (numbered || markdown || allCaps || earlyTitle) {
      const cleaned = line.replace(/^#{1,3}\s+/, "").trim();
      if (!isHeadingCandidate(cleaned, { practicePage: practice })) continue;
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

/** Sayfa çoğunlukla künye satırlarından mı oluşuyor (başlıksız kaynakça). */
function citationDense(lines: string[]): boolean {
  if (lines.length < 5) return false;
  const cited = lines.filter((line) => CITATION_LINE.test(foldTr(line))).length;
  return cited >= 5 && cited / lines.length >= 0.6;
}

/** Sayfa yalnız cevap anahtarı ızgarası mı ("1-A 2-C …"): en az 8 madde ve metnin çoğu. */
function answerGridOnly(trimmed: string): boolean {
  const items = trimmed.match(ANSWER_GRID_ITEM) ?? [];
  if (items.length < 8) return false;
  const covered = items.reduce((sum, item) => sum + item.replace(/\s+/g, "").length, 0);
  const letters = trimmed.replace(/\s+/g, "").length;
  return letters > 0 && covered / letters >= 0.6;
}

/**
 * Yalnız başlık taşıyan sayfa: en çok iki kısa satır, cümle yok, rakam ya da formül yok (baştaki bölüm numarası hariç).
 * Bölüm ayıracı slaytı, logo + ders adı. Kısa ama bilgi taşıyan slayt bu sınıfa girmez: iki nokta, eşittir, rakam ya da
 * cümle bitişi varsa içeriktir.
 */
function titleOnly(lines: string[]): boolean {
  if (!lines.length || lines.length > 2) return false;
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  // Birkaç harflik OCR artığı ("ab") başlık değil, okunamayan sayfadır: anlamlı bir sözcük gerekir.
  const letters = lines.join("").match(/\p{L}/gu)?.length ?? 0;
  if (letters < 8 || !words.some((word) => (word.match(/\p{L}/gu)?.length ?? 0) >= 4)) return false;
  return lines.every((line) => {
    const body = line.replace(/^(?:\d{1,2}(?:\.\d{1,2})*[.)]?|[IVXLC]{1,5}[.)])\s+/u, "");
    const last = foldTr(body.split(/\s+/).filter(Boolean).pop() ?? "");
    return (
      line.length <= 70 &&
      !/[.!?…:;=]/.test(body) &&
      !/\d/.test(body) &&
      !FORMULA_PATTERNS.some((pattern) => pattern.test(body)) &&
      // Noktasız kısa cümle başlık değildir ("… seçici geçirgendir"): yüklem eki görülürse içerik sayılır.
      !PREDICATE_END.test(last) &&
      !/\b(is|are|was|were)\b/i.test(body)
    );
  });
}

/** Türkçe yüklem sonu (ek-fiil, geniş/şimdiki/öğrenilmiş geçmiş, olumsuz geniş): bu sözcükle biten satır cümledir. */
const PREDICATE_END = /(?:[dt][iu]r(?:lar|ler)?|m[ae]z|[iu]yor|m[iu]s|(?<!l)[aeiu]r|d[iu]|t[iu])$/;

/**
 * Metinden okunan, öğretilmeyen sayfa türü (Faz 10): kaynakça, başlıksız cevap anahtarı ızgarası, yalnız başlık.
 * `classifyPageKind` ve (kayıtlı türü bu türleri tanımadan yazılmış eski sayfalar için) `pageUsableForLesson` aynı
 * kuralı okur.
 */
export function noisePageKind(text: string): "bibliography" | "answer_key" | "title_only" | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = normalizeLines(trimmed);
  const head = foldTr(lines.slice(0, 2).join(" ")).slice(0, TOC_HEAD_WINDOW);
  if (BIBLIOGRAPHY_HEAD.test(head) || citationDense(lines)) return "bibliography";
  if (answerGridOnly(trimmed)) return "answer_key";
  if (titleOnly(lines)) return "title_only";
  return null;
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
  if (TOC_HINTS.test(sample.slice(0, TOC_HEAD_WINDOW))) return "toc";
  if (ANSWER_HINTS.test(sample)) return "answer_key";
  const noise = noisePageKind(trimmed);
  if (noise) return noise;

  if (charCount < 40) return "unreadable";
  if (charCount < 80) return "uncertain";
  return "content";
}

/**
 * Yeni türler veritabanının CHECK listesinde yok (göç gerektirmesin diye listeye eklenmedi): kaynakça arka maddedir,
 * cevap anahtarı gibi saklanır (öğretilmez); yalnız başlık sayfası kısa sayfa gibi "uncertain" saklanır (konu haritası
 * yapı ipucu olarak görür). Okuyucular türü metinden yeniden çıkarır (`pageUsableForLesson`).
 */
export function storedPageKind(kind: PageKind): StoredPageKind {
  if (kind === "bibliography") return "answer_key";
  if (kind === "title_only") return "uncertain";
  return kind;
}

/**
 * Sayfa derste / konu haritasında kullanılabilir mi — tek kural.
 *
 * Kısa slaytlar (<40 karakter) `page_kind=unreadable` ve
 * `extraction_ok=false` olur ama metin durur; harita bunları alıyorsa
 * ders okuyucusu da almalı. Kapak / içindekiler / cevap anahtarı /
 * boş sayfa hariç; en az birkaç harf gerekir.
 */
export function pageUsableForLesson(page: {
  textContent?: string | null;
  text_content?: string | null;
  pageKind?: PageKind | string | null;
  page_kind?: PageKind | string | null;
  extractionOk?: boolean | null;
  extraction_ok?: boolean | null;
}): boolean {
  const text = String(page.textContent ?? page.text_content ?? "").trim();
  if (!text) return false;
  const kind = String(page.pageKind ?? page.page_kind ?? "");
  if (
    kind === "blank" ||
    kind === "cover" ||
    kind === "toc" ||
    kind === "answer_key" ||
    kind === "bibliography" ||
    kind === "title_only"
  ) {
    return false;
  }
  // Kaynakça, başlıksız cevap ızgarası ve yalnız başlık: kayıtlı tür bunları tanımadan yazılmış olabilir (Faz 10).
  if (noisePageKind(text)) return false;
  if (kind === "content" || kind === "uncertain") return true;
  // unreadable / unknown: kısa slayt veya OCR artığı — harfle doluysa kullan.
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 12;
}

export function analyzePage(
  pageNumber: number,
  text: string,
  storedMethod?: ExtractionMethod | string | null,
): PageAnalysis {
  const textContent = cleanOcrPageText(text.replace(/\u0000/g, ""));
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

  const stored =
    storedMethod === "ocr" ||
    storedMethod === "visual" ||
    storedMethod === "manual" ||
    storedMethod === "text_layer" ||
    storedMethod === "none"
      ? storedMethod
      : null;

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
    // Never overwrite a stored OCR/visual/manual method with text_layer heuristic.
    extractionMethod:
      stored && stored !== "none"
        ? stored
        : extractionOk
          ? "text_layer"
          : "none",
    charCount,
  };
}

export function analyzePages(pages: string[]): PageAnalysis[] {
  return pages.map((text, index) => analyzePage(index + 1, text));
}
