import "server-only";

const HEIC = new Set(["image/heic", "image/heif"]);

export function isHeicMime(mimeType: string | null | undefined): boolean {
  return HEIC.has((mimeType ?? "").toLowerCase());
}

/**
 * Görüntü modeli HEIC okumaz. Fotoğrafı JPEG'e çevirip mevcut okuma yoluna verir.
 * Çevrilemezse null — çağıran kota iadesiyle "okunamadı" der.
 */
export async function visionReadyImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!isHeicMime(mimeType)) return { buffer, mimeType };
  try {
    const imported = await import("heic-convert");
    const convert = imported.default;
    const output = await convert({ buffer, format: "JPEG", quality: 0.82 });
    const jpeg = Buffer.from(output);
    return jpeg.byteLength ? { buffer: jpeg, mimeType: "image/jpeg" } : null;
  } catch {
    return null;
  }
}
