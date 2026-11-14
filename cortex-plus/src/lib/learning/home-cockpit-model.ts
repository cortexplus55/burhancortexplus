/**
 * Ana ekran göstergesi (13 Kasım 2026, ürün sahibinin kararı: "/ogretmen beş parça"): sınav şeridi, konu
 * halkası ve sağdaki metin bloğu aynı listeyi okur. Yaprak modül: istemci de sunucu da okur (yükleyici
 * `home-cockpit.ts`). Veriler devam kartının kaynağından (hazırlık, yol adımları, konular); yeni alan yok.
 */

export type CockpitStep = {
  heading: string;
  kindLabel: string;
  href: string;
  /** Ücretsiz hesapta adım 1. konunun dışında (sunucunun `freeTopicLocks` kararı; Faz 3B kapısı okur). */
  locked?: boolean;
};

export type CockpitTopic = {
  id: string;
  label: string;
  /** `exam_prep_topics.status === "done"`. */
  done: boolean;
  /** Konunun sıradaki açık adımı; yoksa null (bağlantı hazırlık sayfasına gider). */
  next: CockpitStep | null;
};

export type CockpitPrep = {
  id: string;
  title: string;
  subject: string | null;
  examDate: string | null;
  /** İstanbul günüyle sınava kalan gün; tarih yoksa null, geçmişte negatif. */
  daysLeft: number | null;
  /** Yolda günü geçmiş ama bitmemiş adım var (yol bunu bugün "Bugün" diye gösteriyor). */
  behind: boolean;
  /** Yolun tamamlaması (devam kartı ve İlerleme'deki "Tamamlama" ile aynı hesap). */
  progress: { done: number; total: number; pct: number };
  next: CockpitStep | null;
  topics: CockpitTopic[];
  /** Açılışta seçili konu: sıradaki adımın konusu, yoksa ilk bitmemiş konu. */
  currentTopic: number;
  href: string;
  createdAt: string | null;
};

/** Yayları tek tek çizme sınırı: üstünde halka kesintisiz ilerleme, seçim yalnız kaydırıcıyla. */
export const RING_ARC_LIMIT = 12;

/**
 * Şerit sırası: tarihliler tarihe göre artan (geçmiş en üstte), sonra tarihsizler (en yeni önce).
 */
export function orderCockpitPreps<T extends Pick<CockpitPrep, "examDate" | "createdAt">>(preps: readonly T[]): T[] {
  const dated = preps.filter((prep) => Boolean(prep.examDate));
  const undated = preps.filter((prep) => !prep.examDate);
  dated.sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)));
  undated.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return [...dated, ...undated];
}

/**
 * Açılışta seçili hazırlık: en yakın gelecek (ya da bugünkü) sınav; yoksa ilk tarihsiz; o da yoksa en son
 * geçmiş sınav. Liste `orderCockpitPreps` sırasında olmalı.
 */
export function initialCockpitIndex(preps: readonly Pick<CockpitPrep, "daysLeft" | "examDate">[]): number {
  const upcoming = preps.findIndex((prep) => typeof prep.daysLeft === "number" && prep.daysLeft >= 0);
  if (upcoming >= 0) return upcoming;
  const undated = preps.findIndex((prep) => !prep.examDate);
  if (undated >= 0) return undated;
  return Math.max(0, preps.length - 1);
}

/** Halkada konu yayları: [başlangıç, bitiş] derece (saat 12'den, saat yönünde), aralarında küçük boşluk. */
export function ringArcs(count: number, gapDegrees = 3): [number, number][] {
  if (count <= 0) return [];
  if (count === 1) return [[0, 359.99]];
  const slice = 360 / count;
  return Array.from({ length: count }, (_, index) => [index * slice + gapDegrees / 2, (index + 1) * slice - gapDegrees / 2]);
}

/** Kutupsal koordinat (derece saat 12'den). */
export function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

/** SVG yay yolu. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}

/**
 * Halka dilimi (iç ve dış yarıçap arasında kapalı yol). Seçili konunun çerçevesi bununla çizilir: yayın kendi
 * kenarlarına yapışık ince beyaz çizgi (13 Kasım 2026); halkanın dışında ayrı çizgi yok.
 */
export function sectorPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const [ox1, oy1] = polar(cx, cy, outer, start);
  const [ox2, oy2] = polar(cx, cy, outer, end);
  const [ix2, iy2] = polar(cx, cy, inner, end);
  const [ix1, iy1] = polar(cx, cy, inner, start);
  const large = end - start > 180 ? 1 : 0;
  const n = (value: number) => value.toFixed(3);
  return `M ${n(ox1)} ${n(oy1)} A ${outer} ${outer} 0 ${large} 1 ${n(ox2)} ${n(oy2)} L ${n(ix2)} ${n(iy2)} A ${inner} ${inner} 0 ${large} 0 ${n(ix1)} ${n(iy1)} Z`;
}
