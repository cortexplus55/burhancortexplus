import { buildDocumentSkeleton, type SkeletonHeading } from "@/lib/documents/outline-skeleton";
import { lessonKeyFacts, sourceEquations } from "@/lib/learning/lesson-key-facts";
import { extractSourceRules } from "@/lib/learning/source-rules";
import { detectPastQuestions } from "@/lib/learning/mock-exam/past-questions";

/*
  Belge haritası (PROMPT-V2 §4, PR-3), 15 Kasım 2026. Modelsiz ve saf: belgenin kendi sayfalarından bölüm başlıkları ve
  sayfa aralıkları (`buildDocumentSkeleton`), tahmini ağırlık (uzunluk, başlık teriminin tekrarı, çıkmış soru
  örtüşmesi), formüller (`sourceEquations`), notun özel sayısal kuralları (`extractSourceRules`; SOURCE_NUMBER_PRIORITY:
  "g = 10 alınız" gibi) ve uzlaşımlar ("pozitif yön", "kabul edilir" …). Planlama ve öğretmen yalnız bu haritayı okur;
  vektör araması yapılmaz. Bir kez hesaplanır, belgenin kaydına yazılır (göç uygulanınca; o güne kadar bellekte).
  Kod metin uydurmaz: her öğe belgede birebir geçen bir satırdan ya da sayımdan gelir.
*/

export const DOCUMENT_MAP_VERSION = 1;
const MAX_SECTIONS = 12;
const MAX_FORMULAS = 8;
const MAX_CONVENTIONS = 4;

export type DocumentMapSection = {
  title: string;
  /** İlk ve son sayfa (belgenin kendi numarasıyla). */
  from: number;
  to: number;
  /** Tahmini ağırlık, bölümler arasında toplam 100. */
  weight: number;
  /** Bu bölümün sayfalarında görülen çıkmış soru sayısı. */
  pastQuestions: number;
};

export type DocumentMap = {
  version: number;
  builtAt: string;
  pageCount: number;
  sections: DocumentMapSection[];
  formulas: string[];
  rules: string[];
  conventions: string[];
  pastQuestionCount: number;
};

export type MapPage = { pageNumber: number; text: string };

/** Uzlaşım satırı: işaret/yön seçimi ya da "kabul edilir/alınır" kalıbı (sayı şartı yok; kurallardan ayrı). */
const CONVENTION =
  /(?:pozitif|negatif|artı|eksi)\s+(?:yön|işaret)|işaret\s+(?:kuralı|uzlaşımı)|yönü\s+(?:pozitif|negatif)|(?:kabul\s+edilir|kabul\s+edilecek|alınacaktır|alınır|varsayılır|varsayılacak)\b/iu;

const STOP = new Set(["ve", "ile", "bir", "bu", "için", "olan", "de", "da", "the", "of"]);

function words(text: string): string[] {
  return text
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

function stem(word: string): string {
  return word.slice(0, 5);
}

function conventionLines(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\s+/g, " ").replace(/^[\s\-–•*>#]+/, "").trim();
    // Yalnız uzlaşımı söyleyen cümle (paragrafın tamamı değil).
    for (const sentence of line.split(/(?<=[.!?;])\s+(?=\p{Lu}|\d)/u)) {
      const item = sentence.trim();
      if (item.length < 8 || item.length > 220 || !CONVENTION.test(item)) continue;
      const key = item.toLocaleLowerCase("tr");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= MAX_CONVENTIONS) return out;
    }
  }
  return out;
}

/** Üst düzey bölümler: en sığ derinlikteki başlıklar (belge adı hariç); hiç yoksa belgenin tamamı tek bölüm. */
function topSections(headings: readonly SkeletonHeading[]): SkeletonHeading[] {
  const usable = headings.filter((heading) => !heading.documentTitle && heading.pages.length);
  if (!usable.length) return [];
  const top = Math.min(...usable.map((heading) => heading.depth));
  return usable.filter((heading) => heading.depth === top);
}

export function buildDocumentMap(pages: readonly MapPage[], now = new Date()): DocumentMap {
  const ordered = [...pages].filter((page) => page.text?.trim()).sort((a, b) => a.pageNumber - b.pageNumber);
  const fullText = ordered.map((page) => page.text).join("\n");
  const pageCount = pages.length;
  const charsByPage = new Map(ordered.map((page) => [page.pageNumber, page.text.length]));
  const past = detectPastQuestions(fullText);
  const pastByPage = new Map<number, number>();
  for (const page of ordered) {
    const count = detectPastQuestions(page.text).length;
    if (count) pastByPage.set(page.pageNumber, count);
  }

  const skeleton = buildDocumentSkeleton([{ pages: ordered.map((page) => ({ pageNumber: page.pageNumber, text: page.text })) }]);
  const tops = topSections(skeleton.headings).slice(0, MAX_SECTIONS);
  const lastPage = ordered.at(-1)?.pageNumber ?? pageCount;
  const raw = tops.length
    ? tops.map((heading, index) => {
        const from = Math.min(...heading.pages);
        const nextFrom = tops[index + 1] ? Math.min(...tops[index + 1]!.pages) : lastPage + 1;
        const to = Math.max(from, Math.max(...heading.pages), nextFrom - 1);
        return { title: heading.title, from, to };
      })
    : ordered.length
      ? [{ title: "Belgenin tamamı", from: ordered[0]!.pageNumber, to: lastPage }]
      : [];

  // Ağırlık: uzunluk payı (0,6), başlık teriminin belgedeki tekrarı (0,2), çıkmış soru payı (0,2). Sinyali olmayan
  // bileşen düşer, kalanlar yeniden ölçeklenir.
  const docStems = words(fullText).map(stem);
  const stemCount = new Map<string, number>();
  for (const value of docStems) stemCount.set(value, (stemCount.get(value) ?? 0) + 1);
  const parts = raw.map((section) => {
    let chars = 0;
    let pastHits = 0;
    for (let page = section.from; page <= section.to; page += 1) {
      chars += charsByPage.get(page) ?? 0;
      pastHits += pastByPage.get(page) ?? 0;
    }
    const titleStems = [...new Set(words(section.title).map(stem))];
    const terms = titleStems.reduce((sum, value) => sum + (stemCount.get(value) ?? 0), 0);
    return { section, chars, pastHits, terms };
  });
  const total = (key: "chars" | "pastHits" | "terms") => parts.reduce((sum, part) => sum + part[key], 0);
  const totals = { chars: total("chars"), pastHits: total("pastHits"), terms: total("terms") };
  const weights = { chars: totals.chars ? 0.6 : 0, terms: totals.terms ? 0.2 : 0, pastHits: totals.pastHits ? 0.2 : 0 };
  const weightSum = weights.chars + weights.terms + weights.pastHits || 1;
  const scores = parts.map(
    (part) =>
      ((totals.chars ? (part.chars / totals.chars) * weights.chars : 0) +
        (totals.terms ? (part.terms / totals.terms) * weights.terms : 0) +
        (totals.pastHits ? (part.pastHits / totals.pastHits) * weights.pastHits : 0)) /
      weightSum,
  );
  const rounded = scores.map((score) => Math.round(score * 100));
  // Yuvarlama farkı en büyük bölüme: toplam tam 100.
  if (rounded.length) {
    const diff = 100 - rounded.reduce((sum, value) => sum + value, 0);
    const biggest = rounded.indexOf(Math.max(...rounded));
    rounded[biggest] = (rounded[biggest] ?? 0) + diff;
  }

  const facts = lessonKeyFacts(ordered.map((page) => ({ text: page.text })));
  return {
    version: DOCUMENT_MAP_VERSION,
    builtAt: now.toISOString(),
    pageCount,
    sections: parts.map((part, index) => ({
      title: part.section.title,
      from: part.section.from,
      to: part.section.to,
      weight: rounded[index] ?? 0,
      pastQuestions: part.pastHits,
    })),
    formulas: sourceEquations(facts)
      .map((fact) => fact.text)
      .slice(0, MAX_FORMULAS),
    rules: extractSourceRules(fullText),
    conventions: conventionLines(fullText),
    pastQuestionCount: past.length,
  };
}

/** Kayıttaki haritayı okur; bozuk ya da eski sürümse null (yeniden hesaplanır). */
export function readDocumentMap(value: unknown): DocumentMap | null {
  if (!value || typeof value !== "object") return null;
  const map = value as Partial<DocumentMap>;
  if (map.version !== DOCUMENT_MAP_VERSION || !Array.isArray(map.sections)) return null;
  return map as DocumentMap;
}

/** Haritanın en ağırlıklı bölümü (eşitlikte belge sırası). */
export function heaviestSection(map: DocumentMap): DocumentMapSection | null {
  if (!map.sections.length) return null;
  return map.sections.reduce((best, section) => (section.weight > best.weight ? section : best));
}
