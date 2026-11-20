/**
 * Faz 2 (madde 5): belgenin işlenen kapsamı. Büyük PDF'in yalnız bir kısmı işlendiyse (ücretsiz sayfa hakkı, kredi ya
 * da öğrencinin seçtiği aralık) bu SESSİZCE geçilmez: kaynak kartında ve belge listesinde rozet görünür.
 *
 * Saf ve bağımlılıksız: sunucu (sayfa) ve tarayıcı (yükleme penceresi) aynı kuralı kullanır.
 */

export type ProcessedCoverage = {
  /** İşlenen ilk sayfa. */
  start: number;
  /** İşlenen son sayfa (dahil). */
  end: number;
  /** Dosyanın toplam sayfası. */
  total: number;
  /** İşlenen sayfa sayısı. */
  processed: number;
};

const positiveInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
};

/** İşlenen kapsam dosyanın tamamı DEĞİLSE kapsam; tamamsa ya da bilinmiyorsa `null`. */
export function processedCoverage(input: {
  pageCount: unknown;
  sourcePageCount: unknown;
  rangeStart?: unknown;
}): ProcessedCoverage | null {
  const processed = positiveInt(input.pageCount);
  const total = positiveInt(input.sourcePageCount);
  if (!processed || !total) return null;
  const start = positiveInt(input.rangeStart) ?? 1;
  const end = Math.min(total, start + processed - 1);
  if (start === 1 && end >= total) return null;
  return { start, end, total, processed: end - start + 1 };
}

/** Kaynak kartı rozeti (madde 5 metni birebir; aralık 1'den başlamıyorsa başlangıç sayfası da yazılır). */
export function coverageBadgeText(coverage: ProcessedCoverage): string {
  return (
    `İşlenen kapsam: Sayfa ${coverage.start}–${coverage.end} / Toplam ${coverage.total} sayfa. ` +
    "Kalan bölümler için yeni sayfa aralığı ekleyebilirsin."
  );
}

export type PageRange = { start: number; end: number };

/**
 * Bu sayfa sayısını aşan PDF'te aralık penceresi her durumda açılır (hak yetse de öğrenci isterse bölüm seçer).
 */
export const DEFAULT_RANGE_SPAN = 100;

/**
 * Yükleme penceresinin varsayılan aralığı: 1. sayfadan hakkın yettiği yere kadar; hak sınırı yoksa dosyanın sonuna
 * kadar (eskiden olduğu gibi bütün dosya işlenir; öğrenci daraltabilir).
 */
export function defaultPageRange(total: number, affordable?: number | null): PageRange {
  const safeTotal = Math.max(1, Math.floor(total));
  const cap = affordable != null && affordable >= 1 ? Math.floor(affordable) : safeTotal;
  return { start: 1, end: Math.min(safeTotal, cap) };
}

/** Girilen aralığı dosyanın sınırlarına çeker (başlangıç ≤ bitiş, ikisi de 1..total). */
export function clampPageRange(start: unknown, end: unknown, total: number): PageRange {
  const safeTotal = Math.max(1, Math.floor(total));
  const s = Math.min(safeTotal, positiveInt(start) ?? 1);
  const e = Math.min(safeTotal, Math.max(s, positiveInt(end) ?? safeTotal));
  return { start: s, end: e };
}

/** Aralık penceresi açılsın mı: dosya hakka sığmıyorsa ya da büyükse (öğrenci neyin işleneceğini bilsin). */
export function shouldAskPageRange(total: number | null | undefined, affordable?: number | null): boolean {
  if (!total || total < 2) return false;
  if (total > DEFAULT_RANGE_SPAN) return true;
  return defaultPageRange(total, affordable).end < total;
}
