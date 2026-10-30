/**
 * Belge kümesi denetimi (Paket I, 30 Ekim 2026) — modelsiz, ders bağımsız.
 *
 * Canlı stres testinde iki sorun fark edilmedi:
 *   - Aynı belgenin eski kopyası (oranı başka yazan) yüklemede ve haritada işaretlenmedi; öğrenci sorunca
 *     öğretmen iki değeri de verdi, hangisinin güncel olduğunu söylemedi.
 *   - Konu dışı bir belge (başka dersin rehberi) konuya dönüşmedi ama hiçbir uyarı çıkmadı ve haritayı
 *     değiştirdi (14 konudan 22'ye).
 *
 * İki ölçü:
 *   1. Metin parmak izi: kelime 5'li dizileri (shingle), belge düzeyinde Jaccard ve sayfa sayfa en iyi eşleşme.
 *      Benzerlik yüksekse "aynı belgenin iki sürümü". Güncel olan: metindeki dönem/tarih bilgisi (2025-2026,
 *      Güz 2025, 12.09.2025, "güncelleme: 2026"); yoksa yükleme zamanı.
 *   2. Sözcük benzerliği: belgenin kendi (sık geçen) kök sözcüklerinin öbür belgelerde geçme payı. Eşik
 *      altındaysa ve hazırlığın ders adı belgede geçmiyorsa "ilgisiz görünüyor". Tek belgede bakılmaz.
 */

import { foldTr } from "@/lib/documents/page-analysis";

/** 32 bit FNV-1a (shingle özeti). */
function fnv1aNumber(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export type SimilarityPage = { pageNumber: number; text: string };
export type SimilarityDocument = {
  documentId: string;
  fileName: string;
  /** Yükleme zamanı (ISO); dönem bilgisi yoksa güncel olanı bu belirler. */
  createdAt?: string | null;
  pages: SimilarityPage[];
};

/** Bu kadar ya da daha benzer iki belge aynı belgenin iki sürümüdür (belge düzeyinde Jaccard). */
export const VERSION_JACCARD = 0.45;
/** Ya da küçük belgenin sayfalarının bu payı ötekinde neredeyse aynısıyla duruyorsa. */
export const VERSION_PAGE_SHARE = 0.6;
/** Bir sayfanın ötekinde "aynı sayfa" sayıldığı Jaccard. */
export const PAGE_MATCH_JACCARD = 0.5;
/** Neredeyse aynı metin: aynı dosya iki kez yüklenmiş. */
export const IDENTICAL_JACCARD = 0.97;
/** Belgenin içerik sözcüklerinin (geçiş sayısıyla) öbür belgelerde geçme payı bunun altındaysa ilgisiz görünür. */
export const UNRELATED_SHARE = 0.25;
/** Bu kadar içerik sözcüğü olmayan belge (fotoğraf, kısa not) için ilgisizlik kararı verilmez. */
export const UNRELATED_MIN_TOKENS = 60;
const SHINGLE = 5;
const MIN_SHINGLES = 60;
const MAX_CHARS = 400_000;
const MAX_PAGES_COMPARED = 150;

/** Genel dil sözcükleri (katlanmış, ilk 5 harf): her belgede geçer, konu söylemez. Ders terimi yok. */
const GENERAL_STEMS = new Set([
  "olara", "olan", "olur", "olmak", "olmas", "olmay", "oldug", "ancak", "ayric", "bunun", "buna", "bunla", "bunda",
  "daha", "diger", "gibi", "gore", "icin", "ile", "ise", "kadar", "sonra", "once", "sekil", "taraf", "uzere",
  "veya", "yani", "yakla", "ornek", "orneg", "tablo", "bolum", "konu", "konus", "sayfa", "soru", "sorul",
  "cevap", "dogru", "yanli", "asagi", "hangi", "nedir", "genel", "temel", "oneml", "gerek", "bulun", "yapil",
  "kulla", "edili", "eden", "eder", "arasi", "uzeri", "icind", "birli", "farkl", "ayni", "butun", "bazi",
  "birco", "nasil", "neden", "zaman", "ilgil", "sahip", "durum", "sonuc", "halin", "itiba", "ifade", "deni",
  "denir", "veril", "goste", "belir", "tanim", "therefore", "which", "there", "these", "those", "their", "about",
  "from", "with", "that", "this", "have", "also", "into", "such", "used", "using", "when", "where", "other",
  "baska", "kendi", "olarak", "yapar", "yapma", "verir", "almak", "olmaz", "degil", "artik", "fazla",
  "kisa", "uzun", "buyuk", "kucuk", "yeni", "eski", "iyi", "kotu", "simdi", "sadec", "sadece", "hem", "cok",
  "tum", "her", "hic", "biri", "ikisi", "bircok", "ders", "dersi", "notu", "notla", "sinav", "unite", "kisim",
]);

function words(text: string): string[] {
  return foldTr(text)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

/** Sayfa metinleri, sınırlı: büyük kitapta sayfalar eşit aralıkla seçilir. */
function limitedPages(document: SimilarityDocument): SimilarityPage[] {
  const pages = [...document.pages].filter((page) => (page.text ?? "").trim()).sort((a, b) => a.pageNumber - b.pageNumber);
  const total = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (total <= MAX_CHARS && pages.length <= MAX_PAGES_COMPARED) return pages;
  const keep = Math.min(MAX_PAGES_COMPARED, Math.max(1, Math.floor(pages.length * (MAX_CHARS / Math.max(total, 1)))));
  const step = pages.length / keep;
  return Array.from({ length: keep }, (_, index) => pages[Math.floor(index * step)]!);
}

/** Kelime 5'li dizilerinin özetleri (32 bit). */
export function shingles(text: string): Set<number> {
  const list = words(text);
  const out = new Set<number>();
  for (let index = 0; index + SHINGLE <= list.length; index += 1) {
    out.add(fnv1aNumber(list.slice(index, index + SHINGLE).join(" ")));
  }
  return out;
}

export function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of small) if (large.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export type DocumentFingerprint = {
  documentId: string;
  all: Set<number>;
  pages: Set<number>[];
};

export function fingerprint(document: SimilarityDocument): DocumentFingerprint {
  const pages = limitedPages(document).map((page) => shingles(page.text));
  const all = new Set<number>();
  for (const page of pages) for (const item of page) all.add(item);
  return { documentId: document.documentId, all, pages };
}

/** İki belgenin metin benzerliği: belge düzeyinde Jaccard ve küçük belgenin "aynı" sayfa payı. */
export function compareFingerprints(a: DocumentFingerprint, b: DocumentFingerprint): { jaccard: number; pageShare: number } {
  const whole = jaccard(a.all, b.all);
  const [small, large] = a.pages.length <= b.pages.length ? [a, b] : [b, a];
  const measurable = small.pages.filter((page) => page.size >= 20);
  if (!measurable.length) return { jaccard: whole, pageShare: 0 };
  let matched = 0;
  for (const page of measurable) {
    if (large.pages.some((other) => jaccard(page, other) >= PAGE_MATCH_JACCARD)) matched += 1;
  }
  return { jaccard: whole, pageShare: matched / measurable.length };
}

export type PeriodMark = { value: number; label: string };

/**
 * Metindeki dönem/tarih işaretleri: "2025-2026" (öğretim yılı), "Güz 2025", "12.09.2025",
 * "güncelleme: 2026", "2026 baskısı". Yıl 2000 ile `maxYear` arasında olmalı (tarih anlatan metindeki
 * 1923 gibi yıllar dönem değil).
 */
export function periodMarks(text: string, maxYear: number): PeriodMark[] {
  const folded = foldTr(text);
  const out: PeriodMark[] = [];
  const ok = (year: number) => year >= 2000 && year <= maxYear;
  for (const match of folded.matchAll(/\b(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})\b/g)) {
    const start = Number(match[1]);
    const endRaw = match[2]!;
    const end = endRaw.length === 2 ? Math.floor(start / 100) * 100 + Number(endRaw) : Number(endRaw);
    if (end === start + 1 && ok(end)) out.push({ value: end, label: `${start}-${end}` });
  }
  for (const match of folded.matchAll(/\b(guz|bahar|yaz|fall|spring|summer)\s+(?:donemi\s+|yariyili\s+|semester\s+)?(20\d{2})\b/g)) {
    const year = Number(match[2]);
    const part = { guz: 0.75, fall: 0.75, bahar: 0.25, spring: 0.25, yaz: 0.5, summer: 0.5 }[match[1] as "guz"] ?? 0;
    if (ok(year)) out.push({ value: year + part, label: `${match[1]} ${year}` });
  }
  for (const match of folded.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g)) {
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (month >= 1 && month <= 12 && ok(year)) out.push({ value: year + month / 12, label: match[0] });
  }
  for (const match of folded.matchAll(/\b(?:guncelleme|guncellenme|revizyon|revize|surum|versiyon|baski|updated|revised|edition)(?:\s+tarihi)?\s*[:\-]?\s*(20\d{2})\b/g)) {
    const year = Number(match[1]);
    if (ok(year)) out.push({ value: year, label: match[0] });
  }
  for (const match of folded.matchAll(/\b(20\d{2})\s+(?:yili|baskisi|surumu|guncel)/g)) {
    const year = Number(match[1]);
    if (ok(year)) out.push({ value: year, label: match[0] });
  }
  return out;
}

function latestPeriod(document: SimilarityDocument, maxYear: number): PeriodMark | null {
  const marks = document.pages.flatMap((page) => periodMarks(page.text ?? "", maxYear));
  return marks.sort((a, b) => b.value - a.value)[0] ?? null;
}

export type VersionPair = {
  /** Önerilen (güncel) sürüm. */
  currentId: string;
  olderId: string;
  currentName: string;
  olderName: string;
  similarity: number;
  /** Neredeyse aynı metin: aynı dosya iki kez yüklenmiş. */
  identical: boolean;
  /** Güncelliği ne belirledi: metindeki dönem/tarih ya da yükleme zamanı. */
  basis: "period" | "upload";
  currentPeriod: string | null;
  olderPeriod: string | null;
};

/** Belge çiftleri arasında sürüm ilişkisi. Her belge en çok bir çiftte (en benzer olanla). */
export function detectVersionPairs(
  documents: SimilarityDocument[],
  options: { now?: Date } = {},
): VersionPair[] {
  if (documents.length < 2) return [];
  const maxYear = (options.now ?? new Date()).getFullYear() + 1;
  const prints = documents.map(fingerprint);
  const candidates: { a: number; b: number; similarity: number }[] = [];
  for (let a = 0; a < documents.length; a += 1) {
    for (let b = a + 1; b < documents.length; b += 1) {
      if (prints[a]!.all.size < MIN_SHINGLES || prints[b]!.all.size < MIN_SHINGLES) continue;
      const { jaccard: whole, pageShare } = compareFingerprints(prints[a]!, prints[b]!);
      if (whole >= VERSION_JACCARD || pageShare >= VERSION_PAGE_SHARE) {
        candidates.push({ a, b, similarity: Math.max(whole, pageShare) });
      }
    }
  }
  candidates.sort((x, y) => y.similarity - x.similarity);
  const used = new Set<number>();
  const pairs: VersionPair[] = [];
  for (const { a, b, similarity } of candidates) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    const left = documents[a]!;
    const right = documents[b]!;
    const whole = jaccard(prints[a]!.all, prints[b]!.all);
    const leftPeriod = latestPeriod(left, maxYear);
    const rightPeriod = latestPeriod(right, maxYear);
    let current = left;
    let older = right;
    let basis: VersionPair["basis"] = "upload";
    // Dönem ancak iki belgede de yazılı ve farklıysa karar verir; tek tarafta olması bir şey söylemez.
    if (leftPeriod && rightPeriod && leftPeriod.value !== rightPeriod.value) {
      basis = "period";
      if (rightPeriod.value > leftPeriod.value) [current, older] = [right, left];
    } else {
      const leftAt = Date.parse(left.createdAt ?? "") || 0;
      const rightAt = Date.parse(right.createdAt ?? "") || 0;
      if (rightAt > leftAt) [current, older] = [right, left];
    }
    const periodOf = (document: SimilarityDocument) =>
      document === left ? leftPeriod?.label ?? null : rightPeriod?.label ?? null;
    pairs.push({
      currentId: current.documentId,
      olderId: older.documentId,
      currentName: current.fileName,
      olderName: older.fileName,
      similarity: Math.round(similarity * 100) / 100,
      identical: whole >= IDENTICAL_JACCARD,
      basis,
      currentPeriod: periodOf(current),
      olderPeriod: periodOf(older),
    });
  }
  return pairs;
}

function stemsOf(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const word of words(text)) {
    if (word.length < 4 || /^\d+$/.test(word)) continue;
    const stem = word.slice(0, 5);
    if (GENERAL_STEMS.has(stem) || GENERAL_STEMS.has(word)) continue;
    out.set(stem, (out.get(stem) ?? 0) + 1);
  }
  return out;
}

function documentText(document: SimilarityDocument): string {
  return limitedPages(document).map((page) => page.text).join("\n");
}

/** Belgenin içerik sözcüğü sayısı (genel dil dışı, kök başına tekrar dahil). */
export function contentTokenCount(stems: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of stems.values()) total += count;
  return total;
}

/**
 * Belgenin içerik sözcüklerinin öbür metinde geçme payı, geçiş sayısıyla ağırlıklı: sık sözcük (belgenin
 * konusu) belirler, bir kez geçen sözcük az etkiler. Aynı dersin not ve slaydı ~%70-95, başka dersin
 * belgesi ~%5-15 çıkar.
 */
export function termShare(stems: ReadonlyMap<string, number>, other: ReadonlyMap<string, number>): number {
  const total = contentTokenCount(stems);
  if (!total) return 0;
  let shared = 0;
  for (const [stem, count] of stems) if (other.has(stem)) shared += count;
  return shared / total;
}

/**
 * Ders adı belgede geçiyor mu (ders adının her içerik sözcüğü belgede var). Bileşik ders adı da sayılır
 * (30 Ekim 2026, canlı tur): ders "Makroekonomi", belgede yalnız "ekonomi" geçiyordu; iki belgeden hangisinin
 * alakasız olduğuna karar verilemedi ve Hukuk notu uyarısız haritaya girdi.
 */
export function mentionsSubject(subject: string | null | undefined, stems: ReadonlyMap<string, number>): boolean {
  const own = words(subject ?? "")
    .filter((word) => word.length >= 4)
    .filter((word) => !GENERAL_STEMS.has(word.slice(0, 5)));
  if (!own.length) return false;
  return own.every((word) => (stems.get(word.slice(0, 5)) ?? 0) >= 1 || compoundPartInDocument(word, stems));
}

/**
 * Bileşik ders adının ("makroekonomi", "biyokimya", "mikrobiyoloji") baştaki önekten sonraki bir parçası belgede
 * kök olarak en az iki kez geçiyor mu. Yalnız 8+ harfli adda ve 3. harften sonra bakılır: kısa ad ya da adın başı
 * zaten ilk kurala girer.
 */
function compoundPartInDocument(word: string, stems: ReadonlyMap<string, number>): boolean {
  if (word.length < 8) return false;
  for (let at = 3; at + 5 <= word.length; at += 1) {
    if ((stems.get(word.slice(at, at + 5)) ?? 0) >= 2) return true;
  }
  return false;
}

export type UnrelatedDocument = {
  documentId: string;
  fileName: string;
  /** Konu sözcüklerinin öbür belgelerde geçme payı (0–1). */
  share: number;
};

/**
 * Hazırlıktaki öbür belgelere (ve ders adına) sözcük olarak benzemeyen belgeler. Tek belgeli hazırlıkta
 * bakılmaz. İki belgede hangisinin konu dışı olduğunu ancak ders adı söyleyebilir; söylemiyorsa uyarı yok.
 * Aynı belgenin sürümleri tek belge sayılır.
 */
export function detectUnrelatedDocuments(
  documents: SimilarityDocument[],
  options: { subject?: string | null; versions?: readonly VersionPair[] } = {},
): UnrelatedDocument[] {
  const older = new Set((options.versions ?? []).map((pair) => pair.olderId));
  const pool = documents.filter((document) => !older.has(document.documentId));
  if (pool.length < 2) return [];
  const stems = pool.map((document) => stemsOf(documentText(document)));
  const out: UnrelatedDocument[] = [];
  pool.forEach((document, index) => {
    if (contentTokenCount(stems[index]!) < UNRELATED_MIN_TOKENS) return;
    if (mentionsSubject(options.subject, stems[index]!)) return;
    const rest = new Map<string, number>();
    stems.forEach((map, other) => {
      if (other === index) return;
      for (const [stem, count] of map) rest.set(stem, (rest.get(stem) ?? 0) + count);
    });
    const share = termShare(stems[index]!, rest);
    if (share >= UNRELATED_SHARE) return;
    const others = pool.map((_, other) => other).filter((other) => other !== index);
    // Karşılaştırılan öbür belgeler kendi aralarında tutarlı ya da ders adını taşıyor olmalı; yoksa hangisinin
    // konu dışı olduğu bilinemez (iki belge birbirine benzemiyorsa ikisi de "ilgisiz" denmez).
    const coherent =
      others.some((other) => mentionsSubject(options.subject, stems[other]!)) ||
      (others.length >= 2 &&
        others.every((other) =>
          others.some((peer) => peer !== other && termShare(stems[other]!, stems[peer]!) >= UNRELATED_SHARE),
        ));
    if (!coherent) return;
    out.push({ documentId: document.documentId, fileName: document.fileName, share: Math.round(share * 100) / 100 });
  });
  return out;
}

export type MaterialCheck = { versions: VersionPair[]; unrelated: UnrelatedDocument[] };

/** Kurulumdaki belge kümesinin tek seferlik denetimi. */
export function checkMaterialSet(
  documents: SimilarityDocument[],
  options: { subject?: string | null; now?: Date } = {},
): MaterialCheck {
  if (documents.length < 2) return { versions: [], unrelated: [] };
  const versions = detectVersionPairs(documents, { now: options.now });
  const unrelated = detectUnrelatedDocuments(documents, { subject: options.subject, versions });
  return { versions, unrelated };
}

/** Öğrenciye kurulumda bir kez gösterilen cümle. */
export function versionNotice(pair: VersionPair): string {
  if (pair.identical) {
    return `"${pair.currentName}" ile "${pair.olderName}" aynı belge görünüyor (iki kez yüklenmiş). Birini kullanmak yeter.`;
  }
  const why =
    pair.basis === "period" && pair.currentPeriod
      ? `"${pair.currentName}" daha yeni görünüyor (${pair.currentPeriod}${pair.olderPeriod ? `; öteki ${pair.olderPeriod}` : ""}).`
      : `"${pair.currentName}" daha sonra yüklenmiş.`;
  return `"${pair.currentName}" ile "${pair.olderName}" aynı belgenin iki sürümü gibi görünüyor (%${Math.round(pair.similarity * 100)} aynı metin). ${why} Hangisini kullanalım?`;
}

export function unrelatedNotice(document: UnrelatedDocument): string {
  return `"${document.fileName}" öbür belgelerle ilgisiz görünüyor; konu haritasına almadık.`;
}
