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

import {
  chapterHeadings,
  isNumberedChapter,
  isRunningHeader,
  isSatelliteSection,
  sectionHeadings,
} from "@/lib/documents/topic-title";

/**
 * Bu kadar ya da daha kısa dosyada sayfa payı kapısı bakmaz.
 * Üç ya da daha çok içerik taşıyan alt başlık varsa yine bölünür.
 */
export const OVERSIZE_MIN_FILE_PAGES = 9;
/** Kısa dosyada bu kadar bağımsız, içerik taşıyan alt başlık tek konuda kalamaz. */
export const OVERSIZE_SHORT_MIN_HEADINGS = 3;
/** Alt başlığın kendi gövdesi bundan kısaysa başlık sayılmaz (sayfa başlığı, etiket). */
const HEADING_BODY_MIN = 40;
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
  reason: "share" | "chapters" | "sections" | "density" | "headings";
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

/** Başlığın altındaki gövde: sonraki numaralı başlığa kadar biriken metin. */
function headingBodies(pages: OversizePage[]): Map<string, string> {
  const map = new Map<string, string>();
  let current: { key: string; body: string } | null = null;
  const flush = () => {
    if (!current) return;
    map.set(current.key, `${map.get(current.key) ?? ""} ${current.body}`.trim());
    current = null;
  };
  for (const page of pages) {
    for (const line of (page.text ?? "").split(/\n+/)) {
      const text = line.trim();
      if (!text) continue;
      if (TEXT_HEADING.test(text) && text.length <= 90) {
        flush();
        current = { key: fold(text), body: "" };
        continue;
      }
      if (current) current.body += ` ${text}`;
    }
  }
  flush();
  return map;
}

/**
 * Neredeyse her sayfada duran numarasız satır sayfa başlığıdır.
 * Numaralı bölüm sayfa başlığı sayılmaz.
 */
function pageTitleKeys(pages: OversizePage[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const heading of pageHeadings(page)) {
      if (isNumberedChapter(heading) || /^\s*\d+\.\d/.test(heading)) continue;
      const key = fold(heading);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const min = Math.ceil(pages.length * 0.5);
  if (min <= 0) return new Set();
  return new Set([...counts.entries()].filter(([, count]) => count >= min).map(([key]) => key));
}

/** Biri diğerinin içindeyse daha uzun (daha belirli) başlık kalır. */
function preferSpecific(headings: string[]): string[] {
  const folded = headings.map((heading) => ({ heading, key: fold(heading) }));
  return folded
    .filter((item, index) => item.key && folded.findIndex((other) => other.key === item.key) === index)
    .filter((item, _, all) => !all.some((other) => other.key !== item.key && other.key.includes(item.key) && other.key.length > item.key.length))
    .map((item) => item.heading);
}

/**
 * Kısa dosyada içerik taşıyan bağımsız alt başlıklar.
 * Sayfa başlığı, tekrar/hata listesi ve gövdesi olmayan etiket sayılmaz.
 */
export function shortFileContentHeadings(file: OversizeFile, pageNumbers: number[]): string[] {
  const wanted = new Set(pageNumbers);
  const pages = file.pages.filter((page) => wanted.has(page.pageNumber) && !isTocPage(page));
  const titles = pageTitleKeys(pages);
  const bodies = headingBodies(pages);
  const { chapters, sections } = headingsInRange(file, pageNumbers);
  const candidates = preferSpecific([...chapters, ...sections]).filter((heading) => {
    if (isSatelliteSection(heading) || isRunningHeader(heading)) return false;
    const key = fold(heading);
    if (!key || titles.has(key)) return false;
    return (bodies.get(key) ?? "").length >= HEADING_BODY_MIN;
  });
  return candidates;
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

    if (filePages < OVERSIZE_MIN_FILE_PAGES) {
      const heads = shortFileContentHeadings(file, topic.pageNumbers).filter((heading) => fold(heading) !== fold(topic.title));
      if (heads.length >= OVERSIZE_SHORT_MIN_HEADINGS) {
        out.push({ ...base, reason: "headings", headings: heads.slice(0, 8) });
      }
      continue;
    }

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
  headings: "kısa belgede en az üç bağımsız, içerik taşıyan alt başlık var",
};

/** Onarım turuna giden talimat: konuyu 2–4 ayrı, ayrık aralıklı konuya böl. */
export function oversizeRepairLines(topics: OversizedTopic[]): string {
  return topics
    .map((topic) => {
      const heads = topic.headings.length ? ` Aralıktaki başlıklar: ${topic.headings.join(" · ")}.` : "";
      const byShare =
        topic.reason === "headings"
          ? " Kısa belgede bölme sayfa sayısına göre değil, karakter/metin payına göre yapılır: her konu kendi başlığının altındaki metni alır."
          : "";
      return (
        `- "${topic.title}" (d${topic.fileIndex + 1} s.${topic.pageStart}-${topic.pageEnd}) ${REASON_TR[topic.reason]}.${heads} ` +
        "Bu konuyu 2-4 ayrı konuya böl: her alt başlık, kural/formül ailesi, dönem, sınıflandırma ya da problem/vaka tipi kendi konusu olsun; " +
        `sayfa aralıkları ayrık olsun, başlıklar o sayfalardaki metne dayansın, şemsiye başlık kullanma.${byShare}`
      );
    })
    .join("\n");
}
