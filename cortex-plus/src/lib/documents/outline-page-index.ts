import { headingOfLine } from "@/lib/learning/lesson-backbone";

/**
 * Büyük belgenin sayfa dizini (28 Ekim 2026).
 *
 * 150–300 sayfalık bir kitabın bütün sayfa metni tek istemde modele gidiyordu: ~600 bin karakter,
 * harita 2 dakikayı geçiyordu. Haritayı kuran model metni öğretmez; yalnız konuların sınırını ve
 * sayfasını bulur. Bunun için her sayfanın başlıkları, ilk ve son cümlesi ve ne kadar dolu olduğu
 * yeter. Temellendirme (başlık sayfada geçiyor mu) yine sayfaların tam metnine bakar; dizin yalnız
 * modelin okuduğu metindir.
 */

/** Bu kadar ve daha çok sayfada model ham metin yerine dizini okur. */
export const OUTLINE_INDEX_MIN_PAGES = 100;
const HEAD_CHARS = 180;
const TAIL_CHARS = 110;
const MAX_HEADINGS = 4;

export type IndexedPage = { pageNumber: number; text: string; headings?: string[] };

/** Bir sayfanın başlık satırları: kayıtlı liste, yoksa metindeki başlık satırları. */
export function indexHeadings(page: IndexedPage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const source = page.headings?.length
    ? page.headings
    : (page.text ?? "").split(/\n+/).map((line) => headingOfLine(line)).filter((h): h is string => Boolean(h));
  for (const raw of source) {
    const heading = raw.replace(/\s+/g, " ").trim();
    const key = heading.toLocaleLowerCase("tr");
    if (!heading || seen.has(key)) continue;
    seen.add(key);
    out.push(heading);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function clip(text: string, max: number, fromEnd = false): string {
  if (text.length <= max) return text;
  if (fromEnd) {
    const cut = text.slice(text.length - max);
    const space = cut.indexOf(" ");
    return `…${space > 0 && space < 30 ? cut.slice(space + 1) : cut}`;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max - 30 ? cut.slice(0, space) : cut}…`;
}

/** Sayfanın yoğunluğu: metin hacmi, kabaca. Model geniş bölümü buradan görür. */
export function densityLabel(chars: number): string {
  if (chars < 300) return "seyrek";
  if (chars < 1_200) return "orta";
  if (chars < 2_500) return "dolu";
  return "çok dolu";
}

/** Tek sayfanın dizin satırı; boş sayfa satır vermez. */
export function pageIndexLine(label: string, page: IndexedPage): string | null {
  const body = (page.text ?? "").replace(/\s+/g, " ").trim();
  if (!body) return null;
  const headings = indexHeadings(page);
  const parts = [`[${label} s.${page.pageNumber}] ${densityLabel(body.length)} (${body.length} krk)`];
  if (headings.length) parts.push(`başlık: ${headings.join(" · ")}`);
  if (body.length <= HEAD_CHARS + TAIL_CHARS + 20) {
    parts.push(`metin: ${body}`);
  } else {
    parts.push(`baş: ${clip(body, HEAD_CHARS)}`);
    parts.push(`son: ${clip(body, TAIL_CHARS, true)}`);
  }
  return parts.join(" | ");
}

export const PAGE_INDEX_HEADER =
  "SAYFA DİZİNİ: belge büyük olduğu için her satır bir sayfayı özetler — yoğunluk (karakter sayısı), " +
  "sayfadaki başlıklar, sayfanın ilk ve son cümlesi. Konu başlığını sayfalardaki başlıklardan al; " +
  "bir başlığın konusu bir sonraki başlığa kadar süren sayfalardır. Yoğun ardışık sayfalar geniş bir " +
  "bölümdür, birden çok konuya bölünür.";

export function buildPageIndexCorpus(
  files: { fileName: string; fileIndex?: number; pages: IndexedPage[] }[],
): string {
  const parts: string[] = [PAGE_INDEX_HEADER];
  files.forEach((file, position) => {
    const label = `d${(file.fileIndex ?? position) + 1}`;
    parts.push(`=== Dosya ${label}: ${file.fileName} (${file.pages.length} sayfa) ===`);
    for (const page of file.pages) {
      const line = pageIndexLine(label, page);
      if (line) parts.push(line);
    }
  });
  return parts.join("\n");
}

export function usesPageIndex(pageCount: number): boolean {
  return pageCount >= OUTLINE_INDEX_MIN_PAGES;
}
