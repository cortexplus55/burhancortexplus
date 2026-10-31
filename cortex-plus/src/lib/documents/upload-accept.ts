/**
 * Yüklenebilen dosya türleri — sunucu ve seçiciler için tek kaynak (20 Ekim 2026).
 *
 * Sunucu PDF, Word, PowerPoint, TXT ve fotoğrafın hepsini okuyor (`store-upload.ts`). Seçiciler
 * ayrı ayrı yazılınca biri öbüründen geri kaldı: Araçlar fotoğraf seçtirmiyor, sohbet Word ve
 * PowerPoint seçtirmiyordu. Seçici yazan her yer buradaki dizelerden birini kullanır.
 */

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Belge olarak işlenen her yükleme: sınav kurulumu, materyal ekleme, Araçlar. */
export const DOCUMENT_UPLOAD_ACCEPT = [...Object.keys(MIME_BY_EXTENSION), "image/heic", "image/heif"].join(",");

/**
 * Sohbet: belge (PDF, TXT, Word, PowerPoint) belgeli sohbete, fotoğraf soru olarak görüntü
 * modeline gider. Görüntü modeli HEIC okumadığı için sohbette HEIC seçtirilmez (telefonun galerisi
 * bu listeyle fotoğrafı JPEG'e çevirip verir).
 */
export const CHAT_UPLOAD_ACCEPT = [".pdf", ".txt", ".docx", ".pptx", ".png", ".jpg", ".jpeg", ".webp"].join(",");

/** Depolamanın tek dosya tavanı (Supabase ücretsiz plan, sabit): PDF, Word ve sunu bu kadar olabilir. */
export const LARGE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
/** Fotoğraf ve metin dosyası. */
export const SMALL_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Seçilen dosyanın boyutu uygun değilse öğrenciye söylenecek cümle (31 Ekim 2026). 50 MB'tan büyük PDF buraya
 * gelmeden tarayıcıda bölünür (pdf-split-client.ts); gelirse bölünemeyen (şifreli ya da bozuk) dosyadır.
 */
export function uploadSizeProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  const large = file.type === "application/pdf" || /\.(pdf|docx|pptx)$/.test(name)
    || file.type.includes("wordprocessingml") || file.type.includes("presentationml");
  const max = large ? LARGE_UPLOAD_MAX_BYTES : SMALL_UPLOAD_MAX_BYTES;
  if (file.size <= max) return null;
  if (/\.pdf$/.test(name) || file.type === "application/pdf") {
    return `${file.name} 50 MB'tan büyük ve bölünemedi (şifreli ya da bozuk olabilir). Şifresiz kopyasını yükler misin?`;
  }
  return large
    ? `${file.name} 50 MB'tan büyük. Word ve sunu dosyası en fazla 50 MB olabilir; PDF olarak kaydedip yüklersen bölünerek eklenir.`
    : `${file.name} 15 MB'tan büyük. Fotoğraf ve metin dosyası en fazla 15 MB olabilir.`;
}
