/**
 * Fotoğrafı yüklemeden önce cihazda küçültür (31 Ekim 2026).
 *
 * Telefon fotoğrafı 4080×3060 ve ~3,5 MB geliyordu; mobil ağda yüklemesi uzun, sunucuda okuması tam boyla
 * 17-24 sn idi. Okuma modeli görüntüyü zaten en çok 2048 piksele indiriyor: aynı fotoğraf 2048 piksel ve JPEG
 * %85 ile ~0,5 MB, okunan metin aynı (ölçüm: 3.132 → 3.175 ve 3.942 → 3.939 karakter), okuma 13-16 sn.
 *
 * Tarayıcı çözemezse (HEIC'i çözemeyen tarayıcı, bozuk dosya) ya da küçültme kazandırmazsa dosya olduğu gibi
 * gider: sunucu HEIC'i kendisi çevirir. Saydam PNG beyaz zemine çizilir (JPEG'de saydamlık siyaha döner).
 */

export const UPLOAD_IMAGE_MAX_SIDE = 2048;
export const UPLOAD_IMAGE_QUALITY = 0.85;
/** Bundan küçük ve zaten 2048 pikseli aşmayan görüntüye dokunulmaz. */
const COMPRESS_MIN_BYTES = 900 * 1024;

const COMPRESSIBLE = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

/** Uzun kenarı `max`'ı aşan görüntünün yeni boyu; aşmıyorsa aynı boy. */
export function scaledSize(width: number, height: number, max = UPLOAD_IMAGE_MAX_SIDE): { width: number; height: number } {
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

function isImage(file: File): boolean {
  return COMPRESSIBLE.test(file.type) || /\.(png|webp|jpe?g|heic|heif)$/i.test(file.name);
}

/** Yüklemeye hazır dosya: küçültülmüş JPEG ya da (kazanç yoksa / çözülemezse) aynı dosya. */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!isImage(file) || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = scaledSize(bitmap.width, bitmap.height);
    const shrinks = target.width !== bitmap.width || target.height !== bitmap.height;
    // Küçük ve zaten küçük boyutlu görüntü: yeniden kodlamak kazandırmaz, kaliteyi düşürür.
    if (!shrinks && file.size < COMPRESS_MIN_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", UPLOAD_IMAGE_QUALITY));
    if (!blob || blob.size === 0 || (blob.size >= file.size && /jpe?g/i.test(file.type))) return file;
    return new File([blob], compressedName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
