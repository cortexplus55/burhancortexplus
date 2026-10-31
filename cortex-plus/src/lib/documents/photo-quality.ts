import { isPhotoFile } from "@/lib/documents/photo-set-client";
import { scaledSize } from "@/lib/documents/image-compress";

/**
 * Bulanık / karanlık fotoğraf uyarısı (31 Ekim 2026, Paket J3 #13, ürün sahibinin kararı). Yüklemeden önce cihazda,
 * küçültülmüş görüntüde: ortalama parlaklık, kontrast (standart sapma) ve netlik (Laplace varyansı + en güçlü
 * kenarlar). Yalnız AÇIKÇA okunamayacak fotoğraf işaretlenir: el yazısı notun fotoğrafı çoğu zaman soluk ve seyrektir,
 * yanlış alarm kaçırılan uyarıdan kötüdür. Uyarı yüklemeyi durdurmaz; öğrenci "Yine de kullan" diyebilir.
 *
 * Tarayıcı çözemezse (HEIC'i çözemeyen tarayıcı, bozuk dosya) ölçü yok: `null`, fotoğraf olduğu gibi gider.
 */

export const PHOTO_QUALITY_SIDE = 512;
/** Bütün seçim için ölçü bütçesi: dolunca ölçülmeyen fotoğraf uyarısız gider. */
export const PHOTO_QUALITY_BUDGET_MS = 1_800;
/** Aynı anda çözülen fotoğraf: telefonun belleğini taşırmasın. */
const PHOTO_QUALITY_LANES = 4;
/** Bundan fazla fotoğraf ölçülmez (100 fotoğraflık seçimde ilk 40'ı). */
const PHOTO_QUALITY_MAX = 40;

/*
  Eşikler 512 piksellik görüntüde. Keskin yazıda en güçlü kenarların Laplace değeri 40-200; ağır bulanıklıkta 10'un
  altına iner. Seyrek yazılı sayfada (beyaz zemin çok) Laplace varyansı küçük kalabilir, bu yüzden "bulanık" için iki
  ölçü birlikte düşük olmalı. Karanlık: ortalama düşük VE en parlak bölgeler de soluk (tebeşirli kara tahta değil).
*/
const BLUR_EDGE_MAX = 12;
const BLUR_VARIANCE_MAX = 25;
const DARK_MEAN_MAX = 60;
const DARK_BRIGHT_MAX = 130;

export type PhotoQualityScore = {
  /** Ortalama parlaklık, 0-255. */
  brightness: number;
  /** Parlaklığın standart sapması. */
  contrast: number;
  /** Laplace varyansı (klasik netlik ölçüsü). */
  sharpness: number;
  /** En güçlü kenarlar: |Laplace|'ın 99,9. yüzdeliği. */
  edge: number;
  /** En parlak bölge: parlaklığın 99. yüzdeliği. */
  highlight: number;
};

export type PhotoQuality = { blurry: boolean; dark: boolean; score: PhotoQualityScore };

function percentile(values: ArrayLike<number>, ratio: number, max: number): number {
  // Değerler 0..max tam sayıya yuvarlanır: sıralama yerine sayım (512×512'de hızlı).
  const counts = new Uint32Array(max + 1);
  for (let index = 0; index < values.length; index += 1) {
    counts[Math.min(max, Math.max(0, Math.round(values[index]!)))] += 1;
  }
  const target = Math.ceil(values.length * ratio);
  let seen = 0;
  for (let value = 0; value <= max; value += 1) {
    seen += counts[value]!;
    if (seen >= target) return value;
  }
  return max;
}

/** Gri tonlu görüntüden (0-255, satır satır) ölçü. Saf işlev: tarayıcı gerekmez. */
export function qualityFromGray(gray: ArrayLike<number>, width: number, height: number): PhotoQuality {
  const total = width * height;
  let sum = 0;
  for (let index = 0; index < total; index += 1) sum += gray[index]!;
  const brightness = total ? sum / total : 0;
  let spread = 0;
  for (let index = 0; index < total; index += 1) spread += (gray[index]! - brightness) ** 2;
  const contrast = total ? Math.sqrt(spread / total) : 0;

  const inner = Math.max(0, (width - 2) * (height - 2));
  const laplace = new Float32Array(inner);
  let at = 0;
  let lapSum = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = y * width + x;
      const value =
        4 * gray[center]! - gray[center - 1]! - gray[center + 1]! - gray[center - width]! - gray[center + width]!;
      laplace[at] = value;
      lapSum += value;
      at += 1;
    }
  }
  const lapMean = inner ? lapSum / inner : 0;
  let lapSpread = 0;
  const magnitude = new Float32Array(inner);
  for (let index = 0; index < inner; index += 1) {
    lapSpread += (laplace[index]! - lapMean) ** 2;
    magnitude[index] = Math.abs(laplace[index]!);
  }
  const sharpness = inner ? lapSpread / inner : 0;
  const edge = inner ? percentile(magnitude, 0.999, 1020) : 0;
  const highlight = total ? percentile(gray, 0.99, 255) : 0;

  const score = {
    brightness: Math.round(brightness * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    sharpness: Math.round(sharpness * 10) / 10,
    edge,
    highlight,
  };
  return {
    blurry: edge < BLUR_EDGE_MAX && sharpness < BLUR_VARIANCE_MAX,
    dark: brightness < DARK_MEAN_MAX && highlight < DARK_BRIGHT_MAX,
    score,
  };
}

/** RGBA pikselleri gri tona çevirir (ITU-R BT.601 ağırlıkları). */
export function grayFromRgba(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = 0.299 * rgba[offset]! + 0.587 * rgba[offset + 1]! + 0.114 * rgba[offset + 2]!;
  }
  return gray;
}

/** Bundan büyük dosya (telefon fotoğrafı, 3-4 bin piksel) küçültülerek çözülür; küçük olan büyütülmesin diye tam boy. */
const RESIZED_DECODE_MIN_BYTES = 1_500_000;

async function decode(file: File): Promise<ImageBitmap> {
  if (file.size >= RESIZED_DECODE_MIN_BYTES) {
    try {
      // Destekleyen tarayıcı küçültülmüş çözer (bellek ve süre); desteklemeyen seçeneği reddedebilir.
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: PHOTO_QUALITY_SIDE,
        resizeQuality: "low",
      });
    } catch {
      // Tam boy çözüme düşülür.
    }
  }
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Fotoğrafın netlik ve parlaklık ölçüsü; tarayıcı çözemezse null (uyarı yok, yükleme sürer). */
export async function assessPhotoQuality(file: File): Promise<PhotoQuality | null> {
  if (!isPhotoFile(file) || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decode(file);
    const target = scaledSize(bitmap.width, bitmap.height, PHOTO_QUALITY_SIDE);
    if (target.width < 8 || target.height < 8) return null;
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    return qualityFromGray(grayFromRgba(pixels, target.width, target.height), target.width, target.height);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export type PhotoQualityChoice = "retake" | "use";

/**
 * Seçimdeki bulanık ya da karanlık fotoğraflar. Ölçüler aynı anda (`PHOTO_QUALITY_LANES`) ve bir bütçe içinde koşar;
 * bütçe dolunca ölçülemeyenler uyarısız sayılır — kontrol yüklemeyi hissedilir biçimde geciktirmez.
 */
export async function flagLowQualityPhotos(
  files: readonly File[],
  options: {
    assess?: (file: File) => Promise<PhotoQuality | null>;
    budgetMs?: number;
    lanes?: number;
    max?: number;
  } = {},
): Promise<File[]> {
  const assess = options.assess ?? assessPhotoQuality;
  const photos = files.filter(isPhotoFile).slice(0, options.max ?? PHOTO_QUALITY_MAX);
  if (!photos.length) return [];
  const flagged = new Set<File>();
  let cursor = 0;
  let expired = false;
  const lane = async () => {
    while (!expired && cursor < photos.length) {
      const file = photos[cursor]!;
      cursor += 1;
      try {
        const quality = await assess(file);
        if (!expired && quality && (quality.blurry || quality.dark)) flagged.add(file);
      } catch {
        // Ölçü düştü: uyarı yok.
      }
    }
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, options.budgetMs ?? PHOTO_QUALITY_BUDGET_MS);
  });
  try {
    const lanes = Array.from({ length: Math.min(options.lanes ?? PHOTO_QUALITY_LANES, photos.length) }, () => lane());
    await Promise.race([Promise.all(lanes), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // Seçim sırası korunur.
  return files.filter((file) => flagged.has(file));
}

/** Uyarı cümlesi (ürün sahibinin metni); birden çok fotoğrafta aynı cümle sayıyla. */
export function photoQualityPrompt(count: number): string {
  const subject = count > 1 ? `Bu ${count} fotoğraf` : "Bu fotoğraf";
  return `🔍 ${subject} çok bulanık/karanlık görünüyor, sayılar yanlış okunabilir — daha net çekmek ister misin?`;
}

export const PHOTO_QUALITY_RETAKE = "Yeniden çek";
export const PHOTO_QUALITY_USE = "Yine de kullan";

/** "Yeniden çek" seçilince ne olacağı: işaretlenenler çıkar, kalanlar yüklenir. */
export function photoQualityRetakeHint(flagged: number, total: number): string {
  const rest = total - flagged;
  if (rest <= 0) return "Yeniden çek dersen bu seçim yüklenmez; fotoğrafı yeniden çekip ekleyebilirsin.";
  return `Yeniden çek dersen ${flagged > 1 ? "bu fotoğraflar" : "bu fotoğraf"} çıkarılır, öbür ${rest} dosya yüklenir.`;
}
