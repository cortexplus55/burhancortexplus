/*
  Fotoğrafı göndermeden önce cihazda küçültür (23 Ekim 2026). Vercel gövde sınırı 4,5 MB; telefon fotoğrafı çoğu
  zaman 3-8 MB ve eski çözücü bunu küçültmüyordu, büyük fotoğraf sunucuya hiç ulaşmıyordu. Uzun kenar 1600 px,
  JPEG %85: soru metni okunur kalır, dosya ~200-600 KB olur. Tarayıcı küçültemezse dosya olduğu gibi gider.
*/
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function downscaleImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1_500_000 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
