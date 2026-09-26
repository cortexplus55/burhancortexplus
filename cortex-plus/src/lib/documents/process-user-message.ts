import { DOCUMENT_TYPE_REJECTED } from "@/lib/documents/upload-labels";

/** `documents.error_message` / API için Türkçe, öğrenci dostu metinler. */
const MESSAGES: Record<string, string> = {
  download_failed: "Belge sunucudan alınamadı. Yeniden yüklemeyi dene.",
  text_extraction_unsupported:
    "Bu dosyadan okunabilir metin çıkarılamadı. Taranmış PDF ise fotoğraf kotan dahilinde OCR denenir.",
  photo_quota_exhausted: "Bu ayki belge fotoğraf okuma hakkın doldu. Plus ile kotan artar.",
  page_insert_failed: "Sayfalar kaydedilemedi. Dosyayı tekrar yüklemeyi dene.",
  embedding_unavailable: "İçerik indekslenemedi. Biraz sonra tekrar dene.",
  encrypted_pdf: "Bu PDF şifreli olduğu için okunamıyor.",
  file_too_large: "Bu dosya izin verilen maksimum boyuttan büyük (15 MB).",
  unsupported_type: DOCUMENT_TYPE_REJECTED,
};

export function userMessageForProcessError(code: string | null | undefined): string {
  if (!code) return "Belge işlenemedi. Tekrar yüklemeyi dene.";
  if (MESSAGES[code]) return MESSAGES[code];
  const base = code.split(":")[0] ?? code;
  return MESSAGES[base] ?? code;
}

export function mapExtractFailure(reason: string): string {
  if (/password|encrypted|PasswordException/i.test(reason)) return MESSAGES.encrypted_pdf;
  return MESSAGES.text_extraction_unsupported;
}
