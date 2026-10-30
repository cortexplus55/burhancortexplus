import { scaledSize } from "@/lib/documents/image-compress";
import {
  PHOTO_SET_MAX_SIDE,
  PHOTO_SET_MIN_PHOTOS,
  PHOTO_SET_PART_MAX_BYTES,
  PHOTO_SET_QUALITY,
  buildPhotoSetPdf,
  photoSetName,
  splitPhotoSet,
  type PhotoPage,
} from "@/lib/documents/photo-set-pdf";

/**
 * Fotoğraf seti, tarayıcı tarafı (31 Ekim 2026). Tek seçimdeki fotoğraflar seçim sırasıyla küçültülür (1600 piksel,
 * JPEG %80) ve tek bir taranmış PDF'e konur. Hızlı başlatmada ilk sayfalar ayrı küçük bir parça olarak hemen gider:
 * öğrenci onlarla hazırlığı kurar, kalan sayfalar ikinci parça olarak arkada okunur ve hazırlığa eklenir.
 *
 * Tarayıcının çözemediği fotoğraf (HEIC'i çözemeyen tarayıcı, bozuk dosya) sete girmez, tek dosya olarak eskisi gibi
 * yüklenir: sunucu HEIC'i kendisi çevirir.
 */

/** Hızlı başlatmanın ilk parçası: bu kadar sayfa okununca harita çıkar, öğrenci hazırlığa girer. */
export const FAST_START_PAGES = 10;
/** Bundan az fotoğrafta set bölünmez: hepsi zaten birkaç saniyede okunur. */
export const FAST_START_MIN_PHOTOS = 15;
/** Aynı anda küçültülen fotoğraf: telefonun belleğini taşırmadan sırayı hızlandırır. */
const ENCODE_LANES = 3;

const PHOTO_TYPE = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
const PHOTO_NAME = /\.(png|webp|jpe?g|heic|heif)$/i;

export function isPhotoFile(file: { name: string; type: string }): boolean {
  return PHOTO_TYPE.test(file.type) || PHOTO_NAME.test(file.name);
}

/** Seçimi ikiye ayırır: sete girecek fotoğraflar (en az iki) ve tek tek yüklenecek dosyalar. Sıra korunur. */
export function splitSelection<T extends { name: string; type: string }>(files: readonly T[]): { photos: T[]; others: T[] } {
  const photos = files.filter(isPhotoFile);
  if (photos.length < PHOTO_SET_MIN_PHOTOS) return { photos: [], others: [...files] };
  return { photos, others: files.filter((file) => !isPhotoFile(file)) };
}

/** Hızlı başlatmada setin ilk parçasının sayfa sayısı; bölünmüyorsa null. */
export function fastStartCut(photoCount: number, fastStart: boolean): number | null {
  return fastStart && photoCount >= FAST_START_MIN_PHOTOS ? FAST_START_PAGES : null;
}

/** Fotoğrafı sete hazırlar: döndürme düzeltilir, uzun kenar 1600 piksel, beyaz zemin, JPEG. Çözülemezse null. */
export async function encodePhotoPage(file: File): Promise<PhotoPage | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = scaledSize(bitmap.width, bitmap.height, PHOTO_SET_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_SET_QUALITY));
    if (!blob || !blob.size) return null;
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
    return { jpeg, width: target.width, height: target.height };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export type PhotoSetPart = { file: File; pages: number; from: number; to: number };

/**
 * Fotoğrafları sete çevirir ve her parça hazır olur olmaz `onPart` ile verir (hızlı başlatmanın ilk parçası, ötekiler
 * küçültülürken yüklenmeye başlar). Parçalar sırayla gelir; büyük set boyut sınırında ayrıca bölünür.
 * Sete giremeyen fotoğraflar `leftovers` olarak döner (tek tek yüklenir).
 */
export async function buildPhotoSet(
  photos: readonly File[],
  options: {
    fastStart: boolean;
    onEncoded?: (done: number, total: number) => void;
    onPart: (part: PhotoSetPart) => void;
    encode?: (file: File) => Promise<PhotoPage | null>;
  },
): Promise<{ leftovers: File[]; pages: number }> {
  const encode = options.encode ?? encodePhotoPage;
  const results: (PhotoPage | null | undefined)[] = photos.map(() => undefined);
  const cut = fastStartCut(photos.length, options.fastStart);
  let encoded = 0;
  let firstSent = false;
  /** Sırayla kaç sayfa parçaya verildi (sayfa numaraları setin içinde 1'den). */
  let pagesSent = 0;
  let slotsSent = 0;

  const emit = (slots: (PhotoPage | null | undefined)[], finalPart: boolean) => {
    const pages = slots.filter((page): page is PhotoPage => Boolean(page));
    const groups = splitPhotoSet(pages, PHOTO_SET_PART_MAX_BYTES);
    for (const group of groups) {
      const from = pagesSent + 1;
      const to = pagesSent + group.length;
      // Set tek parçada bittiyse adı "(N Sayfa)"; aksi hâlde sayfa aralığı.
      const whole = finalPart && !firstSent && from === 1 && groups.length === 1;
      const name = photoSetName({ from, to, total: whole ? to : Number.MAX_SAFE_INTEGER });
      const bytes = buildPhotoSetPdf(group, name.replace(/\.pdf$/, ""));
      options.onPart({
        file: new File([bytes], name, { type: "application/pdf", lastModified: Date.now() }),
        pages: group.length,
        from,
        to,
      });
      pagesSent = to;
      firstSent = true;
    }
  };

  const tryEmitFirst = () => {
    if (cut == null || slotsSent > 0) return;
    const head = results.slice(0, cut);
    if (head.some((slot) => slot === undefined)) return;
    // İlk parçada en az iki sayfa okunmalı; yoksa set bölünmeden bekler.
    if (head.filter(Boolean).length < 2) return;
    slotsSent = cut;
    emit(head, false);
  };

  let next = 0;
  const lane = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= photos.length) return;
      results[index] = await encode(photos[index]!);
      encoded += 1;
      options.onEncoded?.(encoded, photos.length);
      tryEmitFirst();
    }
  };
  await Promise.all(Array.from({ length: Math.min(ENCODE_LANES, photos.length) }, lane));

  const rest = results.slice(slotsSent);
  const total = results.filter(Boolean).length;
  // Sete en az iki sayfa girmediyse set kurulmaz: hepsi tek tek yüklenir (tek fotoğraf PDF'e çevrilmez).
  if (!firstSent && total < 2) return { leftovers: [...photos], pages: 0 };
  if (rest.some(Boolean)) emit(rest, true);
  const leftovers = photos.filter((_, index) => results[index] === null);
  return { leftovers, pages: total };
}
