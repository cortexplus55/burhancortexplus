import { isCompressibleImage } from "@/lib/upload/compress-image";

/**
 * Sayfa tepsisi, saf kısım (20 Kasım 2026). Öğrenci defter sayfalarını telefonla tek tek çeker: fotoğraflar yüklenmeden
 * önce tepside bekler, öğrenci sırayı düzeltir, yanlış çekileni siler, "Bir sayfa daha ekle" ile kamerayı yeniden açar;
 * yükleyince tepsideki sırayla ortak yükleme motoruna gider (fotoğraf seti → tek PDF). Bu dosya React'siz: sıra
 * işlemleri ve tepsiye girecek seçimin kararı; durum ve önizleme adresleri `use-photo-tray.ts`'te.
 */

/** Tepsiye yalnız fotoğraflardan oluşan seçim girer; içinde PDF, Word ya da sunu varsa seçim bugünkü gibi hemen yüklenir. */
export function photoOnlySelection(files: readonly { name: string; type: string }[]): boolean {
  return files.length > 0 && files.every(isCompressibleImage);
}

/** Sayfayı bir sıra önceye (-1) ya da sonraya (+1) taşır; uçtaysa liste aynı kalır. */
export function movePage<T extends { id: string }>(pages: readonly T[], id: string, delta: -1 | 1): T[] {
  const from = pages.findIndex((page) => page.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pages.length) return [...pages];
  const next = [...pages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Önizleme küçük resminin uzun kenarı: tepside ~136 piksel genişlik, yoğun ekranda iki katı. */
export const TRAY_THUMB_SIDE = 320;
export const TRAY_THUMB_QUALITY = 0.7;

export const TRAY_COPY = {
  title: "Ders notu sayfaları",
  addPage: "📷 Bir sayfa daha ekle",
  camera: "📷 Fotoğraf çek",
  cancel: "Vazgeç",
  uploading: "Yükleniyor…",
} as const;

export function trayCountLabel(count: number): string {
  return `${count} sayfa`;
}

export function trayUploadLabel(count: number): string {
  return count > 1 ? `Sayfaları yükle (${count})` : "Sayfayı yükle";
}

/** İki ve daha çok fotoğraf tek belgeye toplanır (`photo-set-pdf.ts`); tek fotoğraf kendi başına yüklenir. */
export function trayHint(count: number): string {
  return count > 1
    ? "Sırayı düzenleyebilirsin; yükleyince bu sırayla tek belge olur."
    : "Başka sayfa varsa çekmeye devam et; birden çok sayfa sırayla tek belge olur.";
}

export function trayPageLabels(position: number) {
  return {
    image: `Sayfa ${position}`,
    earlier: `${position}. sayfayı önceye taşı`,
    later: `${position}. sayfayı sonraya taşı`,
    remove: `${position}. sayfayı kaldır`,
  };
}
