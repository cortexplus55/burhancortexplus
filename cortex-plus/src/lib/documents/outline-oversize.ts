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

/**
 * Yutulan alt başlık (29 Ekim 2026, Paket G). 15 sayfalık 10. sınıf matematik notunda
 * "Parçalı Fonksiyon" iki sayfalık kendi bölümüyle duruyordu; harita onu "Fonksiyonlar"ın içinde
 * eritti ("Düşey Atış", "Taban Fiyat" aynı). Yukarıdaki kapılar 8+ sayfa ya da 4+ alt bölüm arıyordu;
 * 1-3 sayfalık bağımsız alt bölüm hiçbir kurala takılmıyordu. Ölçü yine ders bağımsız: aralıktaki
 * başlığın kendi gövdesi var (`SWALLOWED_BODY_MIN`) ve gövde ya tam sayfalık metin taşıyor ya da
 * tanım/kural/formül/örnek/soru gibi öğretim işareti içeriyor; başlık haritada hiçbir konunun adı
 * değil; konunun o başlık dışında da içeriği var. Kod bölmez; modelden alt bölümü ayrı konu yazmasını ister.
 */
export const SWALLOWED_BODY_MIN = 450;
/** Bu kadar metin taşıyan alt başlık öğretim işareti aranmadan bağımsız sayılır (~tam sayfa). */
export const SWALLOWED_PAGE_BODY = 1_200;
/** Tek sayfalık konu alt başlık yutmuş sayılmaz. */
export const SWALLOWED_MIN_SPAN = 2;
/** Belge yapısı sözcükleri (katlanmış metinde aranır); ders terimi değil. */
const TEACHING_MARK_WORDS =
  /\b(tanim|tanimi|kural|kurali|ozellik|ozellikleri|teorem|formul|formulu|baginti|denklem|ornek|ornegin|soru|alistirma|cozum|ispat|yontem|uyari)\b/;
const TEACHING_MARK_SYMBOLS = /[=⇒→≤≥]|\d\s*[+\-*/×·:]\s*\d/;

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
  reason: "share" | "chapters" | "sections" | "density" | "headings" | "subsection";
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

type HeadingBody = { body: string; onOwnPage: number };

/**
 * Başlığın altındaki gövde: sonraki numaralı başlığa kadar biriken metin; `onOwnPage` başlığın
 * kendi sayfasında kalan kısmı (adım listesinin son maddesi sonraki sayfanın metnini üstlenmesin).
 */
function headingBodyDetails(pages: OversizePage[]): Map<string, HeadingBody> {
  const map = new Map<string, HeadingBody>();
  let current: { key: string; body: string; page: number; onOwnPage: number } | null = null;
  const flush = () => {
    if (!current) return;
    const prior = map.get(current.key);
    map.set(current.key, {
      body: `${prior?.body ?? ""} ${current.body}`.trim(),
      onOwnPage: (prior?.onOwnPage ?? 0) + current.onOwnPage,
    });
    current = null;
  };
  for (const page of pages) {
    for (const line of (page.text ?? "").split(/\n+/)) {
      const text = line.trim();
      if (!text) continue;
      if (TEXT_HEADING.test(text) && text.length <= 90) {
        flush();
        current = { key: fold(text), body: "", page: page.pageNumber, onOwnPage: 0 };
        continue;
      }
      if (current) {
        current.body += ` ${text}`;
        if (page.pageNumber === current.page) current.onOwnPage += text.length;
      }
    }
  }
  flush();
  return map;
}

function headingBodies(pages: OversizePage[]): Map<string, string> {
  return new Map([...headingBodyDetails(pages)].map(([key, detail]) => [key, detail.body]));
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

/** Başlığın kendi sayfasında en az bu kadar gövdesi olmalı; yoksa sayfa sonuna düşmüş etiket ya da liste maddesidir. */
const SWALLOWED_OWN_PAGE_MIN = 120;

function carriesOwnTeaching(detail: HeadingBody | undefined): boolean {
  if (!detail || detail.body.length < SWALLOWED_BODY_MIN || detail.onOwnPage < SWALLOWED_OWN_PAGE_MIN) return false;
  if (detail.body.length >= SWALLOWED_PAGE_BODY) return true;
  return TEACHING_MARK_WORDS.test(fold(detail.body)) || TEACHING_MARK_SYMBOLS.test(detail.body);
}

/** Başlığın ilk geçtiği sayfa (katlanmış anahtarla). */
function headingPages(pages: OversizePage[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const page of pages) {
    for (const heading of pageHeadings(page)) {
      const key = fold(heading);
      if (key && !map.has(key)) map.set(key, page.pageNumber);
    }
  }
  return map;
}

/**
 * Konunun aralığında kendi başlığı ve içeriği olan, haritada adı geçmeyen alt bölümler.
 * Üst konunun kendi adı (ya da ünitesi) yutulmuş sayılmaz; tek kelimelik üst ad alt başlığı
 * kapsamaz ("Fonksiyon" ⊄ "Parçalı Fonksiyon"). Aralığın son sayfasındaki BÖLÜM başlığı modelin
 * sınır sayfası taşmasıdır, sayılmaz; alt bölüm (2.3) son sayfada da sayılır. Yutulan bölümler
 * dışında konunun kendi metni yoksa model başlığı başka adla yazmıştır, yutma yok.
 */
export function swallowedSubsections(
  file: OversizeFile,
  topic: OversizeTopic,
  options: { own: Iterable<string>; siblingTitles: Iterable<string> },
): string[] {
  if (topic.pageNumbers.length < SWALLOWED_MIN_SPAN) return [];
  const wanted = new Set(topic.pageNumbers);
  const pages = file.pages.filter((page) => wanted.has(page.pageNumber) && !isTocPage(page));
  if (!pages.length) return [];
  const lastPage = Math.max(...topic.pageNumbers);
  const titles = pageTitleKeys(pages);
  const bodies = headingBodyDetails(pages);
  const firstPageOf = headingPages(pages);
  const { chapters, sections } = headingsInRange(file, topic.pageNumbers);
  const chapterKeys = new Set(chapters.map(fold));
  const ownKeys = [...options.own].map(fold).filter(Boolean);
  const siblingKeys = [...options.siblingTitles].map(fold).filter(Boolean);
  const coveredByOwn = (key: string) =>
    ownKeys.some((own) => own === key || own.includes(key) || (own.includes(" ") && key.includes(own)));
  const coveredBySibling = (key: string) => siblingKeys.some((title) => title === key || title.includes(key));
  const stems = (key: string) => key.split(" ").filter((word) => word.length >= 4);
  const sharesStem = (key: string) =>
    ownKeys.some((own) => stems(own).some((a) => stems(key).some((b) => a.startsWith(b) || b.startsWith(a))));

  const candidates = preferSpecific([...chapters, ...sections]).filter((heading) => {
    if (isSatelliteSection(heading) || isRunningHeader(heading)) return false;
    const key = fold(heading);
    if (!key || titles.has(key)) return false;
    return carriesOwnTeaching(bodies.get(key));
  });
  // Aralığın ilk içerik başlığı üst adla kök paylaşıyorsa ("Fonksiyon" ~ "Fonksiyonlar ve Grafikleri")
  // konunun kendi bölümüdür; sonraki "Parçalı Fonksiyon" aynı kökü taşısa da ayrı alt bölümdür.
  const firstKey = [...candidates]
    .map((heading) => fold(heading))
    .sort((a, b) => (firstPageOf.get(a) ?? Infinity) - (firstPageOf.get(b) ?? Infinity))[0];
  const foreign = candidates.filter((heading) => {
    const key = fold(heading);
    if (coveredByOwn(key) || coveredBySibling(key)) return false;
    if (key === firstKey && sharesStem(key)) return false;
    return !(chapterKeys.has(key) && firstPageOf.get(key) === lastPage);
  });
  if (!foreign.length) return [];
  const rangeChars = pages.reduce((sum, page) => sum + (page.text ?? "").length, 0);
  const swallowedChars = foreign.reduce((sum, heading) => sum + (bodies.get(fold(heading))?.body.length ?? 0), 0);
  return rangeChars - swallowedChars >= SWALLOWED_BODY_MIN ? foreign : [];
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
    const siblingTitles = all.filter((row) => row.topic !== topic).map((row) => row.topic.title);
    const pushSwallowed = () => {
      const swallowed = swallowedSubsections(file, topic, { own, siblingTitles });
      if (swallowed.length) out.push({ ...base, reason: "subsection", headings: swallowed.slice(0, 8) });
    };

    if (filePages < OVERSIZE_MIN_FILE_PAGES) {
      const heads = shortFileContentHeadings(file, topic.pageNumbers).filter((heading) => fold(heading) !== fold(topic.title));
      if (heads.length >= OVERSIZE_SHORT_MIN_HEADINGS) {
        out.push({ ...base, reason: "headings", headings: heads.slice(0, 8) });
        continue;
      }
      pushSwallowed();
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
      continue;
    }
    pushSwallowed();
  }
  return out;
}

const REASON_TR: Record<OversizedTopic["reason"], string> = {
  share: "dosyanın %15'inden fazlasını tek konuda topluyor",
  chapters: "aralığında birden çok bağımsız bölüm var",
  sections: "aralığında dörtten çok alt bölüm var",
  density: "kardeş konuların iki katından fazla sayfa tutuyor",
  headings: "kısa belgede en az üç bağımsız, içerik taşıyan alt başlık var",
  subsection: "aralığında kendi başlığı ve içeriği olan bağımsız alt bölüm var",
};

/** Onarım turuna giden talimat: konuyu 2–4 ayrı, ayrık aralıklı konuya böl; yutulan alt bölüm ayrı konu olur. */
export function oversizeRepairLines(topics: OversizedTopic[]): string {
  return topics
    .map((topic) => {
      if (topic.reason === "subsection") {
        return (
          `- "${topic.title}" (d${topic.fileIndex + 1} s.${topic.pageStart}-${topic.pageEnd}) ${REASON_TR.subsection}: ${topic.headings.join(" · ")}. ` +
          "Bu alt bölümlerin her birini AYRI konu olarak yaz (1-2 sayfa bile olsa): başlığı belgedeki başlığa dayansın, " +
          "sayfa aralığı yalnız o alt bölümün sayfaları olsun; üst konunun kalan sayfaları üst konuda kalır. Şemsiye başlık kullanma."
        );
      }
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
