/**
 * Geniş konu kapısı (25 Ekim 2026) — ders bağımsız.
 *
 * Canlı karşılaştırmada belgenin dörtte birini tutan üniteler tek bir
 * "… Temel Kavramları" konusuna sıkıştı; alt dalları hiç ayrı ders olarak
 * açılmadı. Güçlü modelin tek geniş konusu `goodEnough`'tan geçiyordu.
 *
 * Kapı yalnız ölçüyle karar verir: konunun dosyadaki sayfa payı, belgenin
 * kendi bölüm başlıklarının o aralıkta kaç tane olduğu ve kardeş konulara
 * göre yoğunluk. Ders adı, terim ya da kalıp listesi yok. Kod konuyu
 * bölmez; modele aralığı 2–4 konuya ayırmasını söyleyen onarım ister.
 */

import { chapterHeadings, sectionHeadings } from "@/lib/documents/topic-title";

/** Bu kadar ya da daha kısa dosya tek konulu olabilir; kapı bakmaz. */
export const OVERSIZE_MIN_FILE_PAGES = 9;
/** Konu dosyanın bu payından fazlasını tutuyorsa (ve en az `OVERSIZE_MIN_SPAN` sayfaysa) geniştir. */
export const OVERSIZE_MAX_SHARE = 0.15;
export const OVERSIZE_MIN_SPAN = 8;
/** Kardeş konuların ortancasının bu katından fazla ve en az bu kadar sayfa. */
export const OVERSIZE_MEDIAN_FACTOR = 2;
export const OVERSIZE_MEDIAN_MIN_SPAN = 6;
/** Aralıkta başlığa uymayan bu kadar bağımsız bölüm varsa konu tek kalamaz. */
export const OVERSIZE_MIN_CHAPTERS = 2;
/** Alt bölüm (3.1, 3.2 …) sayısı ve en az sayfa: dersin bölümlerinden fazlası birden çok konudur. */
export const OVERSIZE_MIN_SECTIONS = 4;
export const OVERSIZE_SECTIONS_MIN_SPAN = 6;

export type OversizePage = { pageNumber: number; text: string; headings?: string[] };
export type OversizeFile = { fileIndex?: number; pages: OversizePage[] };

export type OversizeTopic = {
  title: string;
  /** Yoksa ilk dosya (tek dosyalı kurs). */
  fileIndex?: number;
  pageNumbers: number[];
};

export type OversizedTopic = {
  title: string;
  unitTitle: string;
  fileIndex: number;
  pageStart: number;
  pageEnd: number;
  reason: "share" | "chapters" | "sections" | "density";
  headings: string[];
};

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/^\s*(\d{1,3}([.)]\d+)*[.)]?|[ivxlc]+[.)])\s+/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TEXT_HEADING = /^\s*(\d{1,2}(\.\d{1,2})*\.?)\s+\p{Lu}/u;

/** Sayfanın başlıkları: kayıtlı liste, yoksa metindeki kısa numaralı satırlar. */
export function pageHeadings(page: OversizePage): string[] {
  if (page.headings?.length) return page.headings;
  const out: string[] = [];
  for (const line of (page.text ?? "").split(/\n+/)) {
    const text = line.trim();
    if (!text || text.length > 90) continue;
    if (TEXT_HEADING.test(text)) out.push(text);
  }
  return out;
}

function isTocPage(page: OversizePage): boolean {
  return /^\s*(içindekiler|İçindekiler|İÇİNDEKİLER)/.test(page.text ?? "");
}

/** Bir sayfa aralığındaki bağımsız bölümler ve alt bölümler (içindekiler sayfası hariç). */
export function headingsInRange(
  file: OversizeFile,
  pageNumbers: number[],
): { chapters: string[]; sections: string[] } {
  const wanted = new Set(pageNumbers);
  const pages = file.pages
    .filter((page) => wanted.has(page.pageNumber) && !isTocPage(page))
    .map((page) => ({ headings: pageHeadings(page) }));
  return {
    chapters: chapterHeadings(pages),
    sections: sectionHeadings(pages, Number.POSITIVE_INFINITY),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Aralık dosyanın tek konusu olamayacak kadar geniş mi (yalnız sayfa payı). */
export function spanTooWide(span: number, filePages: number): boolean {
  if (filePages < OVERSIZE_MIN_FILE_PAGES) return false;
  return span >= OVERSIZE_MIN_SPAN && span / filePages > OVERSIZE_MAX_SHARE;
}

/**
 * Tek konu olarak kalamayacak konular. Boş liste = harita kabul edilebilir.
 * `files` konuların `fileIndex`'iyle eşleşir (dosyanın kendi `fileIndex`'i ya da sırası).
 */
export function outlineOversizedTopics(
  units: { title: string; topics: OversizeTopic[] }[],
  files: OversizeFile[],
): OversizedTopic[] {
  const byIndex = new Map<number, OversizeFile>();
  files.forEach((file, position) => byIndex.set(file.fileIndex ?? position, file));
  const all = units.flatMap((unit) =>
    unit.topics.map((raw) => ({ unit: unit.title, topic: { ...raw, fileIndex: raw.fileIndex ?? 0 } })),
  );
  const out: OversizedTopic[] = [];

  for (const { unit, topic } of all) {
    const file = byIndex.get(topic.fileIndex) ?? (files.length === 1 ? files[0] : undefined);
    if (!file || !topic.pageNumbers.length) continue;
    const filePages = file.pages.length;
    if (filePages < OVERSIZE_MIN_FILE_PAGES) continue;
    const span = topic.pageNumbers.length;
    const pageStart = Math.min(...topic.pageNumbers);
    const pageEnd = Math.max(...topic.pageNumbers);
    const own = new Set([fold(topic.title), fold(unit)]);
    const { chapters, sections } = headingsInRange(file, topic.pageNumbers);
    const foreignChapters = chapters.filter((heading) => {
      const key = fold(heading);
      return key && ![...own].some((title) => title && (title === key || title.includes(key) || key.includes(title)));
    });
    const base = { title: topic.title, unitTitle: unit, fileIndex: topic.fileIndex, pageStart, pageEnd };

    if (span >= 2 && foreignChapters.length >= OVERSIZE_MIN_CHAPTERS) {
      out.push({ ...base, reason: "chapters", headings: foreignChapters.slice(0, 8) });
      continue;
    }
    if (span >= OVERSIZE_SECTIONS_MIN_SPAN && sections.length >= OVERSIZE_MIN_SECTIONS) {
      out.push({ ...base, reason: "sections", headings: sections.slice(0, 8) });
      continue;
    }
    if (spanTooWide(span, filePages)) {
      out.push({ ...base, reason: "share", headings: [...foreignChapters, ...sections].slice(0, 8) });
      continue;
    }
    const siblings = all
      .filter((row) => row.topic !== topic && row.topic.fileIndex === topic.fileIndex)
      .map((row) => row.topic.pageNumbers.length);
    if (
      siblings.length >= 2 &&
      span >= OVERSIZE_MEDIAN_MIN_SPAN &&
      span > OVERSIZE_MEDIAN_FACTOR * median(siblings)
    ) {
      out.push({ ...base, reason: "density", headings: [...foreignChapters, ...sections].slice(0, 8) });
    }
  }
  return out;
}

const REASON_TR: Record<OversizedTopic["reason"], string> = {
  share: "dosyanın %15'inden fazlasını tek konuda topluyor",
  chapters: "aralığında birden çok bağımsız bölüm var",
  sections: "aralığında dörtten çok alt bölüm var",
  density: "kardeş konuların iki katından fazla sayfa tutuyor",
};

/** Onarım turuna giden talimat: konuyu 2–4 ayrı, ayrık aralıklı konuya böl. */
export function oversizeRepairLines(topics: OversizedTopic[]): string {
  return topics
    .map((topic) => {
      const heads = topic.headings.length ? ` Aralıktaki başlıklar: ${topic.headings.join(" · ")}.` : "";
      return (
        `- "${topic.title}" (d${topic.fileIndex + 1} s.${topic.pageStart}-${topic.pageEnd}) ${REASON_TR[topic.reason]}.${heads} ` +
        "Bu konuyu 2-4 ayrı konuya böl: her alt başlık, kural/formül ailesi, dönem, sınıflandırma ya da problem/vaka tipi kendi konusu olsun; " +
        "sayfa aralıkları ayrık olsun, başlıklar o sayfalardaki metne dayansın, şemsiye başlık kullanma."
      );
    })
    .join("\n");
}
