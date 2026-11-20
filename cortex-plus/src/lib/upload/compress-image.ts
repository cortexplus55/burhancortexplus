/**
 * Tek istemci tarafı görüntü küçültücü (20 Kasım 2026, ürün sahibi: öğrencilerin çoğu telefonla 5-15 defter sayfası
 * çekiyor; 6-12 MB fotoğraf mobilde yavaş yükleniyor ya da 4,5 MB istek gövdesi sınırına takılıyor).
 *
 * Belge yüklemesi (`image-compress.ts`), fotoğraf seti (`photo-set-client.ts`), soru çözücü (`solve-client.ts`) ve
 * kâğıtta çözülen deneme aynı kod yolundan küçültür: döndürme fotoğrafın kendi bilgisinden düzeltilir, uzun kenar
 * 1600 piksele iner, saydam PNG beyaz zemine çizilir (JPEG'de saydamlık siyaha döner), çıktı JPEG %82. JPEG seçildi:
 * sunucu, okuma modeli ve fotoğraf setinin PDF'i (DCTDecode) her yerde JPEG kabul ediyor.
 *
 * Ölçüm: 1600 piksel fotoğraf seti sayfası 2048 piksellik okumayla aynı metni verdi (31 Ekim 2026, 3.143 / 3.144
 * karakter; gerçek 4080×3060 defter fotoğrafı %80 ile ~285 KB). 20 Kasım 2026, tarayıcıda baştan sona yazılı sentetik
 * 4000×3000 sayfa (e2e `foto-tepsisi.spec.ts`): 4,1 MB → 443 KB, gürültülü 8,1 MB → 487 KB (gerçek sayfa daha seyrek).
 *
 * Tarayıcı çözemezse (HEIC'i çözemeyen tarayıcı, bozuk dosya) dosya olduğu gibi gider: belge sunucusu HEIC'i kendisi
 * çevirir. Küçültme kazandırmıyorsa (küçük ve zaten küçük boyutlu görüntü, yeniden kodlayınca büyüyen dosya) dosyaya
 * dokunulmaz.
 */

export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_QUALITY = 0.82;
export const IMAGE_OUTPUT_TYPE = "image/jpeg";

/** Bundan küçük ve zaten `IMAGE_MAX_SIDE`'ı aşmayan görüntü yeniden kodlanmaz (kazanç yok, kalite düşer). */
const COMPRESS_MIN_BYTES = 900 * 1024;

/** Belge yükleme sunucusunun olduğu gibi aldığı türler (HEIC'i sunucu çevirir). */
export const DOCUMENT_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/** Soru çözücünün aldığı türler (`/api/ai/solve`): HEIC çözülebiliyorsa her zaman JPEG'e çevrilir. */
export const SOLVE_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

const IMAGE_TYPE = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
const IMAGE_NAME = /\.(png|webp|jpe?g|heic|heif)$/i;

export function isCompressibleImage(file: { name: string; type: string }): boolean {
  return IMAGE_TYPE.test(file.type) || IMAGE_NAME.test(file.name);
}

/** Uzun kenarı `max`'ı aşan görüntünün yeni boyu; aşmıyorsa aynı boy. */
export function scaledSize(width: number, height: number, max = IMAGE_MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Küçültülmüş dosyanın adı: uzantı .jpg olur. */
export function compressedName(name: string): string {
  const base = name.replace(/\.(png|webp|jpe?g|heic|heif)$/i, "");
  return `${base || "foto"}.jpg`;
}

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * Görüntüyü döndürmesi düzeltilmiş olarak çözer. Önce `createImageBitmap` (fotoğrafın kendi yön bilgisiyle); seçeneği
 * tanımayan ya da dosyayı açamayan tarayıcıda `<img>` (tarayıcılar yön bilgisini resimde varsayılan olarak uygular).
 * İkisi de açamazsa null.
 */
async function decodeImage(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Seçenek tanınmıyor ya da biçim açılamıyor: resim öğesiyle denenir.
    }
  }
  if (typeof Image === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(url);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    if (typeof image.decode !== "function") {
      release();
      return null;
    }
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      release();
      return null;
    }
    return { image, width: image.naturalWidth, height: image.naturalHeight, release };
  } catch {
    release();
    return null;
  }
}

/** Çözülmüş görüntüyü beyaz zemine, istenen boyda çizip JPEG'e kodlar. */
async function drawJpeg(source: Decoded, target: { width: number; height: number }, quality: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // Yüksek kaliteli küçültme: 2,5 kat küçültmede varsayılan süzgeç pikselleri atlıyor, ince kalem çizgisi kırılıyordu;
  // komşu pikselleri ortalamak yazıyı korur ve gürültüyü azaltır (dosya da küçülür).
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source.image, 0, 0, target.width, target.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, IMAGE_OUTPUT_TYPE, quality));
  return blob && blob.size > 0 ? blob : null;
}

export type EncodedImage = { blob: Blob; width: number; height: number };

/**
 * Görüntüyü her durumda JPEG'e kodlar (fotoğraf setinin sayfası JPEG olmak zorunda). Tarayıcı çözemezse null.
 * `maxSide` / `quality` yalnız kendi bütçesi olan yüzey içindir (kâğıtta çöz: 10 fotoğraf tek gövdede).
 */
export async function encodeImage(
  file: File,
  options: { maxSide?: number; quality?: number } = {},
): Promise<EncodedImage | null> {
  if (typeof document === "undefined") return null;
  const source = await decodeImage(file);
  if (!source) return null;
  try {
    const target = scaledSize(source.width, source.height, options.maxSide ?? IMAGE_MAX_SIDE);
    const blob = await drawJpeg(source, target, options.quality ?? IMAGE_QUALITY);
    return blob ? { blob, width: target.width, height: target.height } : null;
  } catch {
    return null;
  } finally {
    source.release();
  }
}

/**
 * Yüklemeye hazır dosya: küçültülmüş JPEG ya da (kazanç yoksa, çözülemezse) aynı dosya.
 * `accepts`: hedefin olduğu gibi aldığı türler. Listede olmayan tür (ör. soru çözücüye HEIC) çözülebiliyorsa her zaman
 * JPEG'e çevrilir.
 */
export async function compressImageForUpload(
  file: File,
  options: { accepts?: readonly string[] } = {},
): Promise<File> {
  if (!isCompressibleImage(file) || typeof document === "undefined") return file;
  const accepts = options.accepts ?? DOCUMENT_IMAGE_TYPES;
  const keepable = accepts.includes(file.type.toLowerCase());
  const source = await decodeImage(file);
  if (!source) return file;
  try {
    const target = scaledSize(source.width, source.height);
    const shrinks = target.width !== source.width || target.height !== source.height;
    // Küçük ve zaten küçük boyutlu görüntü: yeniden kodlamak kazandırmaz, kaliteyi düşürür.
    if (keepable && !shrinks && file.size < COMPRESS_MIN_BYTES) return file;
    const blob = await drawJpeg(source, target, IMAGE_QUALITY);
    if (!blob) return file;
    // Yeniden kodlanan dosya büyüdüyse ve boyu da küçülmediyse kazanç yok.
    if (keepable && blob.size >= file.size && (!shrinks || /jpe?g/i.test(file.type))) return file;
    return new File([blob], compressedName(file.name), { type: IMAGE_OUTPUT_TYPE, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    source.release();
  }
}
