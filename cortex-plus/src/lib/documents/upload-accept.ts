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
