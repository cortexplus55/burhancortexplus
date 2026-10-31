/**
 * Belge iskeleti ve başlık düzeyinde kapsam (Paket I, 30 Ekim 2026) — ders bağımsız, modelsiz.
 *
 * Canlı stres testinde konu haritası belgenin kendi başlıklarını yuttu: muhasebe notunda "Mizan",
 * "Tekdüzen Hesap Planı", "Azalan Bakiyeler Yöntemi" ayrı konu olmadı; veri yapıları notunda aynı
 * belgelerden bir kurulumda 14, ötekinde 22 konu çıktı, "Kuyruk" yığınla birleşti, "Hash" hiç yoktu.
 * Harita tek model çağrısından geliyordu ve kod yalnız sayfa düzeyine bakıyordu: güçlü modelin
 * haritasında sayfa kapsamı hiç ölçülmüyordu (`MIN_MINI_COVERAGE` yalnız artık kullanılmayan
 * ucuz modelin yolundaydı), içindekiler yalnız istemde bir ipucuydu.
 *
 * Burada kod belgenin iskeletini çıkarır: içindekiler satırları, numaralı/Markdown/kalın/büyük harf
 * başlıklar, slayt başlıkları ve her başlığın sayfa aralığı. Kapsam başlık düzeyinde ölçülür: iskelette
 * kendi öğretimi (tanım, kural, formül, örnek; `carriesOwnTeaching`) olan bir başlık haritada ayrı konu,
 * bir konunun ya da ünitenin adı ya da kodun kaydettiği bir birleştirme (`sourceTitles`) değilse
 * "yutulmuş" sayılır. Kod konu bölmez, başlık uydurmaz: yutulan başlıklar için modelden yalnız o
 * bölümlere bakan bir onarım (`outline-oneshot.ts`, "patch") ister ve dönen konuları haritaya ekler.
 *
 * Belge "finalde yok", "kapsam dışı" diyorsa (`exclusionPhrases`) o başlık yutulmuş sayılmaz.
 *
 * Kullanılan parçalar: başlık satırı `headingOfLine` (ders omurgası), gövde ölçüsü `sectionBodyDetails` +
 * `carriesOwnTeaching` (geniş konu kapısı), içindekiler `extractTocEntries`, glif çözümü
 * `decodeGlyphIdText`, kapsam dışı `exclusionPhrases` + `matchExclusion`.
 */

import { decodeGlyphIdText } from "@/lib/documents/glyph-id-text";
import { extractTocEntries, isPracticePage, type OutlineUnitDraft } from "@/lib/documents/outline-clean";
import {
  SWALLOWED_BODY_MIN,
  carriesOwnTeaching,
  foldHeadingKey,
  isTocPage,
  sectionBodyDetails,
  type HeadingBody,
} from "@/lib/documents/outline-oversize";
import { foldTr } from "@/lib/documents/page-analysis";
import {
  continuationBase,
  isCalloutLabel,
  isJunkTopicTitle,
  isRunningHeader,
  isSatelliteSection,
  normalizeTopicTitle,
} from "@/lib/documents/topic-title";
import { exclusionPhrases, isNonContentSection, matchExclusion } from "@/lib/learning/cross-material-topics";
import { headingOfLine } from "@/lib/learning/lesson-backbone";

export type SkeletonSource = "numbered" | "markdown" | "bold" | "caps" | "slide" | "toc";

export type SkeletonPage = { pageNumber: number; text: string; headings?: string[] };
export type SkeletonFile = { fileName?: string; fileIndex?: number; pages: SkeletonPage[] };

export type SkeletonHeading = {
  /** Temiz başlık (numarasız). */
  title: string;
  /** Belgedeki satır ("3.2 Mizan"). */
  label: string;
  /** Katlanmış, numarasız anahtar. */
  key: string;
  fileIndex: number;
  /** Başlığın ilk göründüğü sayfa. */
  page: number;
  /** Bölümün sayfaları: başlık + gövde (sonraki başlığa kadar). */
  pages: number[];
  /** 1 bölüm, 2 alt bölüm … (numara, Markdown düzeyi ya da içindekiler satırı). */
  depth: number;
  number: string | null;
  sources: SkeletonSource[];
  bodyChars: number;
  /** Kendi öğretimi var (gövde + tanım/kural/formül/örnek işareti ya da tam sayfa). */
  teaching: boolean;
  /** Altında daha derin başlık var: kapsamı alt başlıkları üzerinden ölçülür. */
  parent: boolean;
  /** Dosyanın kendi adı (kapak satırı, ilk slayt): bölüm değil, ölçülmez. */
  documentTitle: boolean;
};

export type DocumentSkeleton = { headings: SkeletonHeading[] };

/** Bir haritada en çok bu kadar yutulan başlık için onarım istenir (onarım istemi kısa kalsın). */
export const MAX_PATCH_HEADINGS = 12;
/** Neredeyse her sayfada duran numarasız satır sayfa başlığıdır (koşan başlık). */
const RUNNING_SHARE = 0.5;
const RUNNING_MIN_PAGES = 3;
const SLIDE_TITLE_MAX = 80;
/** Bölümün sonraki sayfaya taşması: o sayfada en az bu kadar gövde metni (devam satırı, sayfa kenarı sayılmaz). */
const SECTION_PAGE_MIN_CHARS = 80;

const NUMBER_PREFIX = /^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(?=\p{Lu})/u;
const MARKDOWN_PREFIX = /^(#{1,4})\s+/;
const BOLD_LINE = /^\*\*[^*]+\*\*:?$/;
/** Ön ve arka madde: belgenin yapısı, konu değil (ders terimi değil). */
const FRONT_BACK_MATTER =
  /^(onsoz|sunus|giris|kaynakca|kaynaklar|dizin|sozluk|ekler?|cevap anahtari|cozumler|icindekiler|ozet|sonuc|degerlendirme|preface|introduction|references|bibliography|index|appendix|glossary|summary|conclusion|contents)$/;

function lineKey(line: string): string {
  return line.trim();
}

function slideDeck(file: SkeletonFile): boolean {
  if (/\.(pptx?|odp|key)$/i.test(file.fileName ?? "")) return true;
  const pages = file.pages.filter((page) => (page.text ?? "").trim());
  if (pages.length < 5) return false;
  const sizes = pages.map((page) => page.text.trim().length).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  if (median > 700) return false;
  const titled = pages.filter((page) => plainTitle(firstLine(page.text)) !== null).length;
  return titled / pages.length >= 0.7;
}

function firstLine(text: string): string {
  return (text ?? "").split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "";
}

/** Slayt başlığı: kısa, cümle sonu yok, kutu etiketi ya da koşan başlık değil. */
function plainTitle(line: string): string | null {
  const text = line.trim().replace(/\s+/g, " ");
  if (!text || text.length > SLIDE_TITLE_MAX || text.startsWith("|")) return null;
  if (/[.!?;,:]$/.test(text) || /[=<>≤≥]/.test(text)) return null;
  const title = normalizeTopicTitle(text.replace(MARKDOWN_PREFIX, "").replace(/\*\*/g, ""));
  const words = title.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 9) return null;
  if (title.replace(/[^\p{L}]/gu, "").length < 3) return null;
  if (!/^\p{Lu}|^\d/u.test(title)) return null;
  if (isRunningHeader(text) || isCalloutLabel(title) || isSatelliteSection(title)) return null;
  return title;
}

type LineHeading = { title: string; label: string; key: string; depth: number; number: string | null; source: SkeletonSource };

/** Numaralı öğe etiketi ("Soru 5", "Şekil 2", "Örnek 3"): belgenin biçimi, bölüm değil. */
const ITEM_LABEL =
  /^(?:soru|örnek|ornek|alıştırma|alistirma|test|etkinlik|uygulama|problem|şekil|sekil|tablo|resim|grafik|ek|example|exercise|question|figure|table)\s*\d+\b/iu;

function classifyLine(raw: string, slideTitle: boolean): LineHeading | null {
  // Devam sayfasının başlığı ("Hücre Zarı (devam 2)") aynı başlıktır: anahtar ana başlığınki (31 Ekim 2026).
  const spaced = raw.trim().replace(/\s+/g, " ");
  const text = continuationBase(spaced) ?? spaced;
  if (!text || text.length > 90) return null;
  const bare = text.replace(MARKDOWN_PREFIX, "").replace(/\*\*/g, "").replace(NUMBER_PREFIX, "").trim();
  if (ITEM_LABEL.test(bare) || isJunkTopicTitle(normalizeTopicTitle(bare))) return null;
  const markdown = MARKDOWN_PREFIX.exec(text);
  const numbered = NUMBER_PREFIX.exec(text.replace(MARKDOWN_PREFIX, ""));
  const title = headingOfLine(text, { allowShort: true });
  const label = text.replace(MARKDOWN_PREFIX, "").replace(/\*\*/g, "").replace(/:\s*$/, "").trim();
  if (title) {
    const source: SkeletonSource = markdown ? "markdown" : numbered ? "numbered" : BOLD_LINE.test(text) ? "bold" : "caps";
    const depth = markdown ? markdown[1]!.length : numbered ? numbered[1]!.split(".").length : 1;
    return { title, label, key: foldHeadingKey(label), depth, number: numbered?.[1] ?? null, source };
  }
  if (slideTitle) {
    const plain = plainTitle(text);
    if (plain) return { title: plain, label, key: foldHeadingKey(label), depth: 1, number: null, source: "slide" };
  }
  return null;
}

/**
 * Belgenin iskeleti: her dosyanın başlıkları belge sırasıyla, bölüm sayfaları ve gövde ölçüsüyle.
 * İçindekiler satırı gövdede bir başlıkla eşleşirse ("toc" kaynağı) başlık güçlenir; eşleşmeyen satır
 * iskelete girmez (sayfasını kod uydurmaz).
 */
export function buildDocumentSkeleton(files: SkeletonFile[]): DocumentSkeleton {
  const headings: SkeletonHeading[] = [];
  files.forEach((file, position) => {
    const fileIndex = file.fileIndex ?? position;
    const pages = [...file.pages]
      .map((page) => ({ ...page, text: decodeGlyphIdText(page.text ?? "") }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
    const body = pages.filter((page) => !isTocPage(page) && (page.text ?? "").trim());
    if (!body.length) return;
    const slides = slideDeck({ ...file, pages: body });

    // 1) Satır satır aday başlıklar.
    const accepted = new Map<number, Map<string, LineHeading>>();
    const order: { page: number; line: number; heading: LineHeading }[] = [];
    const pagesOfKey = new Map<string, Set<number>>();
    for (const page of body) {
      if (isPracticePage(page.text)) continue;
      const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      lines.forEach((line, index) => {
        const heading = classifyLine(line, slides && index === 0);
        if (!heading || !heading.key) return;
        const onPage = accepted.get(page.pageNumber) ?? new Map<string, LineHeading>();
        onPage.set(lineKey(line), heading);
        accepted.set(page.pageNumber, onPage);
        order.push({ page: page.pageNumber, line: index, heading });
        const seen = pagesOfKey.get(heading.key) ?? new Set<number>();
        seen.add(page.pageNumber);
        pagesOfKey.set(heading.key, seen);
      });
    }
    // 2) Koşan başlık (numarasız, sayfaların yarısında): ne başlık ne sınır.
    const runningMin = Math.max(RUNNING_MIN_PAGES, Math.ceil(body.length * RUNNING_SHARE));
    const running = new Set(
      [...pagesOfKey].filter(([, set]) => set.size >= runningMin).map(([key]) => key),
    );
    for (const [pageNumber, onPage] of accepted) {
      for (const [line, heading] of onPage) {
        if (running.has(heading.key) && heading.source !== "numbered") onPage.delete(line);
      }
      if (!onPage.size) accepted.delete(pageNumber);
    }
    // 3) İçindekiler satırları gövdedeki başlıkla eşlenir; eşleşmeyen satır gövdede aranır.
    const tocKeys = new Map<string, { depth: number; number: string | null }>();
    for (const entry of extractTocEntries(pages)) {
      const key = foldHeadingKey(entry.title);
      if (key) tocKeys.set(key, { depth: entry.depth, number: entry.number });
    }
    const known = new Set(order.filter((row) => !running.has(row.heading.key)).map((row) => row.heading.key));
    for (const [key, entry] of tocKeys) {
      if (known.has(key) || running.has(key)) continue;
      for (const page of body) {
        const lines = page.text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
        const lineIndex = lines.findIndex((item) => item.length <= 90 && foldHeadingKey(item) === key);
        const line = lineIndex >= 0 ? lines[lineIndex] : undefined;
        if (!line) continue;
        const heading: LineHeading = {
          title: normalizeTopicTitle(line.replace(MARKDOWN_PREFIX, "").replace(/\*\*/g, "")),
          label: line,
          key,
          depth: entry.depth,
          number: entry.number,
          source: "toc",
        };
        const onPage = accepted.get(page.pageNumber) ?? new Map<string, LineHeading>();
        onPage.set(lineKey(line), heading);
        accepted.set(page.pageNumber, onPage);
        order.push({ page: page.pageNumber, line: lineIndex, heading });
        known.add(key);
        break;
      }
    }

    // 4) Gövde: sonraki iskelet başlığına kadar (geniş konu kapısıyla aynı ölçü). Koşan başlık ve sayfa
    //    numarası satırı gövde değildir; bölümü sonraki sayfaya taşımasın.
    const furniture = (line: string) =>
      isRunningHeader(line) || (running.has(foldHeadingKey(line)) && !NUMBER_PREFIX.test(line));
    const bodyText = body.map((page) => ({
      ...page,
      text: page.text
        .split(/\n+/)
        .filter((line) => !furniture(line.trim()))
        .join("\n"),
    }));
    const bodies: Map<string, HeadingBody> = sectionBodyDetails(
      bodyText,
      (line, page) => {
        const heading = accepted.get(page.pageNumber)?.get(lineKey(line));
        return heading ? heading.key : null;
      },
      SECTION_PAGE_MIN_CHARS,
    );

    // 5) Belge sırası, anahtar başına bir başlık.
    const sorted = order
      .filter((row) => !(running.has(row.heading.key) && row.heading.source !== "numbered"))
      .sort((a, b) => a.page - b.page || a.line - b.line);
    const seenKeys = new Set<string>();
    const fileHeadings: SkeletonHeading[] = [];
    for (const { page, heading } of sorted) {
      if (seenKeys.has(heading.key)) continue;
      seenKeys.add(heading.key);
      const detail = bodies.get(heading.key);
      const toc = tocKeys.get(heading.key);
      const sources: SkeletonSource[] = [heading.source];
      if (toc && heading.source !== "toc") sources.push("toc");
      fileHeadings.push({
        title: heading.title,
        label: heading.label,
        key: heading.key,
        fileIndex,
        page,
        pages: detail?.pages.length ? detail.pages : [page],
        depth: toc?.number && !heading.number ? toc.depth : heading.depth,
        number: heading.number ?? toc?.number ?? null,
        sources,
        bodyChars: detail?.body.length ?? 0,
        teaching: carriesOwnTeaching(detail),
        parent: false,
        documentTitle: false,
      });
    }
    // Dosyanın ilk numarasız satırı, belge numaralıysa ya da dosyanın adıysa belgenin kendi adıdır.
    const lead = fileHeadings[0];
    const baseName = foldHeadingKey((file.fileName ?? "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " "));
    if (
      lead &&
      !lead.number &&
      !lead.sources.includes("toc") &&
      (fileHeadings.some((heading) => heading.number) || (baseName && baseName === lead.key))
    ) {
      lead.documentTitle = true;
    }
    // Altında daha derin başlık olan başlık (3. → 3.1): kapsamı alt başlıklarından ölçülür.
    fileHeadings.forEach((heading, index) => {
      for (const next of fileHeadings.slice(index + 1)) {
        if (next.depth <= heading.depth) break;
        heading.parent = true;
        break;
      }
    });
    headings.push(...fileHeadings);
  });
  return { headings };
}

const MATCH_STOP = new Set([
  "ve", "ile", "veya", "icin", "bir", "bu", "su", "olan", "gibi", "the", "and", "of", "to", "in", "for", "with",
  "giris", "temel", "genel", "bolum", "unite", "konu", "konular", "kisim",
]);

function matchWords(text: string): string[] {
  return foldTr(normalizeTopicTitle(text))
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !MATCH_STOP.has(word));
}

/** Türkçe ek almış aynı sözcük: "ağaçlar" ~ "ağacı", "bakiye" ~ "bakiyeler"; "seçmeli" ≁ "seçimli". */
export function sameWordStem(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  let prefix = 0;
  while (prefix < min && a[prefix] === b[prefix]) prefix += 1;
  return prefix >= Math.max(4, min - 2);
}

/** Başlık bir konunun ya da ünitenin adında temsil ediliyor mu (kelimelerin %60'ı ve en ayırt edici kelime). */
export function headingNamedIn(heading: string, titles: Iterable<string>): boolean {
  const words = matchWords(heading);
  if (!words.length) return true;
  const distinctive = [...words].sort((a, b) => b.length - a.length)[0]!;
  for (const title of titles) {
    const own = matchWords(title);
    if (!own.length) continue;
    const hits = words.filter((word) => own.some((item) => sameWordStem(word, item))).length;
    if (hits / words.length >= 0.6 && own.some((item) => sameWordStem(distinctive, item))) return true;
  }
  return false;
}

export type SkeletonGap = {
  heading: string;
  label: string;
  fileIndex: number;
  pageStart: number;
  pageEnd: number;
  /** Başlığın sayfası haritada hangi konunun içinde (yoksa hiçbir konuya bağlanmamış). */
  inTopic: string | null;
};

export type SkeletonCoverage = {
  /** Başlık düzeyinde ölçülebilen (kendi öğretimi olan, kapsam içi) başlıklar. */
  measured: number;
  represented: number;
  gaps: SkeletonGap[];
  /** Belge "kapsam dışı" dediği için sayılmayan başlıklar. */
  excludedHeadings: string[];
  /** Haritada duran ama belgenin kapsam dışı dediği konular (haritada kalır; hazırlık listesine girmez). */
  excludedTopics: { title: string; phrase: string }[];
};

type MapTopic = OutlineUnitDraft["topics"][number];

function topicPages(topic: MapTopic): number[] {
  return [...new Set(topic.pageNumbers)].sort((a, b) => a - b);
}

/** Kapsam dışı ifadesiyle aynı konu ("drop"). */
export function excludedBy(title: string, phrases: readonly string[]): string | null {
  return phrases.find((phrase) => matchExclusion(phrase, title) === "drop") ?? null;
}

/** Bütün dosyaların metnindeki kapsam dışı ifadeleri. */
export function skeletonExclusions(files: SkeletonFile[]): string[] {
  const text = files
    .flatMap((file) => file.pages.map((page) => decodeGlyphIdText(page.text ?? "")))
    .join("\n");
  return exclusionPhrases(text);
}

/**
 * Kapsamı ölçülen başlıklar: kendi öğretimi olan, kapsam içi, alt başlığı olmayan bölümler. Ön/arka madde, özet/tekrar
 * ve belgenin kapsam dışı dediği başlık (`excluded`) sayılmaz.
 */
export function measuredSkeletonHeadings(
  skeleton: DocumentSkeleton,
  exclusions: readonly string[] = [],
): { measured: SkeletonHeading[]; excluded: string[] } {
  const excluded: string[] = [];
  const measured: SkeletonHeading[] = [];
  for (const heading of skeleton.headings) {
    const substantive =
      heading.teaching || (heading.sources.includes("toc") && heading.bodyChars >= SWALLOWED_BODY_MIN);
    if (!substantive || heading.parent || heading.documentTitle) continue;
    const folded = foldTr(heading.title).replace(/[^a-z0-9 ]+/g, " ").trim();
    if (FRONT_BACK_MATTER.test(folded) || isNonContentSection(heading.title) || isSatelliteSection(heading.title)) continue;
    if (excludedBy(heading.title, exclusions)) {
      excluded.push(heading.title);
      continue;
    }
    measured.push(heading);
  }
  return { measured, excluded };
}

/** İlk istemde en çok bu kadar başlık listelenir (istem kısa kalsın). */
export const SKELETON_PROMPT_MAX_HEADINGS = 70;

/**
 * İlk harita isteminde belgenin kendi başlıkları (31 Ekim 2026). Kapsam haritadan SONRA ölçülüyordu; yutulan her başlık
 * ikinci bir model çağrısı ("patch") açıyordu: 30 fotoğraflık notta harita 22 konuda tek hata vermedi ama 11 başlık
 * yutuldu, öğrenci ikinci çağrıyı da bekledi. Liste baştan verilince model aynı çağrıda kapsar; ölçü değişmedi.
 * Konu sınırı (`maxTopics`) başlık sayısından azsa model komşu başlıkları birleştirir ve ikisini de konu adında geçirir
 * (`headingNamedIn` ikisini de temsil edilmiş sayar).
 */
export function skeletonPromptBlock(
  skeleton: DocumentSkeleton,
  options: { exclusions?: readonly string[]; maxTopics: number },
): string {
  const { measured } = measuredSkeletonHeadings(skeleton, options.exclusions ?? []);
  if (measured.length < 2) return "";
  const lines = measured.slice(0, SKELETON_PROMPT_MAX_HEADINGS).map((heading) => {
    const start = Math.min(...heading.pages);
    const end = Math.max(...heading.pages);
    return `- ${heading.label} [d${heading.fileIndex + 1} s.${start === end ? start : `${start}-${end}`}]`;
  });
  const fits = measured.length <= options.maxTopics;
  const rule = fits
    ? "Her biri ayrı bir konu olsun (kendi sayfa aralığıyla); bir başlığı başka konunun içinde eritme."
    : `Başlık sayısı konu sınırından (${options.maxTopics}) fazla: aynı ünitedeki komşu başlıkları tek konuda birleştir. Konu adı kısa ve doğal olsun (en çok 8 kelime, noktalı virgül yok, başlıkları uç uca ekleme) ama birleştirdiğin başlıkların ana kelimelerini taşısın.`;
  return `\n\nBELGENİN KENDİ BAŞLIKLARI (kod belgeden çıkardı; kendi öğretimi olan bölümler, belge sırasıyla):\n${lines.join("\n")}\n${rule} Sayfa aralıklarını bu listeyle ve [d? s.N] işaretleriyle doğrula. Listede olmayan başlık da konu olabilir.`;
}

/**
 * Başlık düzeyinde kapsam. Bir iskelet başlığı şu üç durumda temsil edilir:
 *   1. haritada ayrı konu: aynı dosyada sayfaları bu bölümde başlayan ve çoğu bu bölümde olan bir konu
 *      (model başlığı başka adla yazmış olabilir);
 *   2. bir konunun ya da ünitenin adı (`headingNamedIn`);
 *   3. kayıtlı birleştirme: bir konunun `sourceTitles` listesinde.
 * Kendi öğretimi olmayan başlık (etiket, kısa liste), ön/arka madde, özet/tekrar bölümü ve alt başlıkları
 * olan üst başlık ölçülmez; belgenin kapsam dışı dediği başlık sayılmaz.
 */
export function skeletonCoverage(
  skeleton: DocumentSkeleton,
  units: OutlineUnitDraft[],
  options: { exclusions?: readonly string[]; singleFile?: boolean } = {},
): SkeletonCoverage {
  const exclusions = options.exclusions ?? [];
  const topics = units.flatMap((unit) => unit.topics.map((topic) => ({ unit: unit.title, topic })));
  const names = [
    ...units.map((unit) => unit.title),
    ...topics.flatMap(({ topic }) => [topic.title, ...(topic.sourceTitles ?? [])]),
  ];
  const fileOf = (topic: MapTopic) => (options.singleFile ? 0 : (topic.fileIndex ?? 0));

  const excludedTopics: SkeletonCoverage["excludedTopics"] = [];
  for (const { topic } of topics) {
    const phrase = excludedBy(topic.title, exclusions);
    if (phrase) excludedTopics.push({ title: topic.title, phrase });
  }

  const { measured: measuredHeadings, excluded: excludedHeadings } = measuredSkeletonHeadings(skeleton, exclusions);

  // 1. Ayrı konu: konunun ilk sayfası bölümün içinde ve sayfalarının yarısı bu bölümde. Her konu bir
  //    bölümün yerini tutar (adı uyan bölüm, yoksa o sayfada başlayan ilk bölüm).
  const owned = new Set<SkeletonHeading>();
  for (const { topic } of topics) {
    const pages = topicPages(topic);
    if (!pages.length) continue;
    const first = pages[0]!;
    const candidates = measuredHeadings.filter((heading) => {
      if ((options.singleFile ? 0 : heading.fileIndex) !== fileOf(topic)) return false;
      if (!heading.pages.includes(first)) return false;
      const own = new Set(heading.pages);
      return pages.filter((page) => own.has(page)).length * 2 >= pages.length;
    });
    const pick =
      candidates.find((heading) => !owned.has(heading) && headingNamedIn(heading.title, [topic.title])) ??
      candidates.find((heading) => !owned.has(heading) && heading.page === first) ??
      candidates.find((heading) => !owned.has(heading));
    if (pick) owned.add(pick);
  }

  const gaps: SkeletonGap[] = [];
  let represented = 0;
  for (const heading of measuredHeadings) {
    const fileIndex = options.singleFile ? 0 : heading.fileIndex;
    // 2. Konunun ya da ünitenin adı; 3. kayıtlı birleştirme (`sourceTitles`, `names` içinde).
    if (owned.has(heading) || headingNamedIn(heading.title, names)) {
      represented += 1;
      continue;
    }
    const host = topics.find(({ topic }) => fileOf(topic) === fileIndex && topic.pageNumbers.includes(heading.page));
    gaps.push({
      heading: heading.title,
      label: heading.label,
      fileIndex: heading.fileIndex,
      pageStart: Math.min(...heading.pages),
      pageEnd: Math.max(...heading.pages),
      inTopic: host?.topic.title ?? null,
    });
  }
  return {
    measured: measuredHeadings.length,
    represented,
    gaps: gaps.slice(0, MAX_PATCH_HEADINGS),
    excludedHeadings,
    excludedTopics,
  };
}

/** Onarım istemine giden satırlar: yalnız yutulan bölümler, nerede kaldıklarıyla. */
export function skeletonRepairLines(gaps: readonly SkeletonGap[]): string {
  return gaps
    .map((gap) => {
      const where = gap.inTopic
        ? `şu an "${gap.inTopic}" konusunun içinde kalmış`
        : "hiçbir konuya bağlanmamış";
      return `- "${gap.label}" (d${gap.fileIndex + 1} s.${gap.pageStart}-${gap.pageEnd}): ${where}.`;
    })
    .join("\n");
}

type Position = [number, number, number];

function positionOf(topic: MapTopic): Position {
  const pages = topic.pageNumbers.length ? topic.pageNumbers : [Number.MAX_SAFE_INTEGER];
  return [topic.fileIndex ?? 0, Math.min(...pages), Math.max(...pages)];
}

function comparePosition(a: Position, b: Position): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Önkoşula saygılı, belge sırasıyla kararlı sıra (Kahn): sırası gelen düğümler arasından belgede en önce
 * duran alınır; önkoşulu henüz yazılmamış düğüm bekler. Döngüde belgede en önce duran seçilir.
 */
function stableOrder<T>(items: T[], position: (item: T) => Position, dependsOn: (item: T, other: T) => boolean): T[] {
  const remaining = items.map((item, index) => ({ item, index, position: position(item) }));
  const out: T[] = [];
  const done = new Set<number>();
  while (remaining.length) {
    const ready = remaining.filter(
      (row) => !remaining.some((other) => other !== row && !done.has(other.index) && dependsOn(row.item, other.item)),
    );
    const pool = ready.length ? ready : remaining;
    pool.sort((a, b) => comparePosition(a.position, b.position) || a.index - b.index);
    const next = pool[0]!;
    out.push(next.item);
    done.add(next.index);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return out;
}

/**
 * Aynı dosyanın öğeleri kendi yerlerinde belge sırasına girer; dosyalar arası dizilişi (hangi sırada hangi
 * dosyanın öğesi geldiği) haritanın kendisi verir. Tek dosyalı kursta bu düz belge sırasıdır.
 */
function orderWithinFiles<T>(
  items: T[],
  fileOf: (item: T) => number,
  position: (item: T) => Position,
  dependsOn: (item: T, other: T) => boolean,
): T[] {
  const slots = new Map<number, number[]>();
  items.forEach((item, index) => {
    const file = fileOf(item);
    slots.set(file, [...(slots.get(file) ?? []), index]);
  });
  const out = [...items];
  for (const indexes of slots.values()) {
    const sorted = stableOrder(indexes.map((index) => items[index]!), position, dependsOn);
    indexes.forEach((slot, i) => {
      out[slot] = sorted[i]!;
    });
  }
  return out;
}

/**
 * Kurs sırası koddan (Paket I): bir dosyanın konuları ve üniteleri belgedeki yerlerine göre (ilk sayfa),
 * önkoşul önce. Model aynı belgeye her kurulumda başka sıra verebiliyordu; aynı harita her seferinde aynı
 * sırayla yazılır. Çok dosyalı kursta dosyalar arası diziliş haritanınkidir (ders notu ile slaytın aynı
 * bölümü yan yana kalır); her dosyanın kendi konuları kendi aralarında belge sırasına girer.
 */
export function orderOutlineByPosition(units: OutlineUnitDraft[]): OutlineUnitDraft[] {
  const fold = (title: string) => title.trim().toLocaleLowerCase("tr");
  const requires = (topic: MapTopic, other: MapTopic) =>
    (topic.prerequisiteTitles ?? []).some((title) => fold(title) === fold(other.title));
  const ordered = units.map((unit) => ({
    ...unit,
    topics: orderWithinFiles(unit.topics, (topic) => topic.fileIndex ?? 0, positionOf, requires),
  }));
  const unitPosition = (unit: OutlineUnitDraft): Position =>
    unit.topics.map(positionOf).sort(comparePosition)[0] ?? [Number.MAX_SAFE_INTEGER, 0, 0];
  const unitRequires = (unit: OutlineUnitDraft, other: OutlineUnitDraft) =>
    unit !== other && unit.topics.some((topic) => other.topics.some((item) => requires(topic, item)));
  return orderWithinFiles(ordered, (unit) => unitPosition(unit)[0], unitPosition, unitRequires);
}

/**
 * Onarımın yazdığı konuları haritaya ekler; haritanın geri kalanına dokunmaz. Aynı adlı konu eklenmez.
 * Konu, onarımın verdiği ünite adı haritada varsa oraya; yoksa yuttuğu konunun ünitesine; o da yoksa
 * belgede önünde duran konunun ünitesine; hiçbiri yoksa yeni üniteye girer. Sayfa çakışmasını kayıt
 * (`exclusivePageRanges`) çözer: bölüm başlığından sonraki sayfalar o bölümündür.
 */
export function mergeOutlinePatch(
  units: OutlineUnitDraft[],
  patch: OutlineUnitDraft[],
  gaps: readonly SkeletonGap[],
  maxTopics: number,
): { units: OutlineUnitDraft[]; added: string[] } {
  const next = units.map((unit) => ({ ...unit, topics: [...unit.topics] }));
  const keys = new Set(next.flatMap((unit) => unit.topics.map((topic) => foldHeadingKey(topic.title))));
  let total = next.reduce((sum, unit) => sum + unit.topics.length, 0);
  const added: string[] = [];
  const unitOfTopic = (title: string) => next.find((unit) => unit.topics.some((topic) => topic.title === title));
  for (const patchUnit of patch) {
    for (const topic of patchUnit.topics) {
      if (total >= maxTopics) break;
      const key = foldHeadingKey(topic.title);
      if (!key || keys.has(key)) continue;
      const position = positionOf(topic);
      const gap = gaps.find(
        (item) =>
          item.fileIndex === (topic.fileIndex ?? 0) &&
          topic.pageNumbers.some((page) => page >= item.pageStart && page <= item.pageEnd),
      );
      const before = next
        .flatMap((unit) => unit.topics.map((item) => ({ unit, position: positionOf(item) })))
        .filter((row) => row.position[0] === position[0] && comparePosition(row.position, position) <= 0)
        .sort((a, b) => comparePosition(b.position, a.position))[0]?.unit;
      let target =
        next.find((unit) => foldHeadingKey(unit.title) === foldHeadingKey(patchUnit.title)) ??
        (gap?.inTopic ? unitOfTopic(gap.inTopic) : undefined) ??
        before;
      if (!target) {
        target = { title: patchUnit.title, examWeight: patchUnit.examWeight, topics: [] };
        next.push(target);
      }
      const at = target.topics.filter((item) => comparePosition(positionOf(item), position) <= 0).length;
      target.topics.splice(at, 0, { ...topic, origin: topic.origin ?? "document" });
      keys.add(key);
      total += 1;
      added.push(topic.title);
    }
  }
  return { units: next, added };
}
