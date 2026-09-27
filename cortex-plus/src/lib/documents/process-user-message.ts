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
  ingestion_state_unavailable: "Belge işleme durumu şu an açılamıyor. Biraz sonra yeniden dene.",
  photo_quota_unavailable: "Fotoğraf sayfası hakkın şu an doğrulanamıyor. Biraz sonra yeniden dene.",
  cleanup_failed: "Belgenin eski işlem kalıntıları temizlenemedi. Yeniden dene.",
  chunk_insert_failed: "Belge parçaları kaydedilemedi. Yeniden dene.",
  embedding_insert_failed: "Belge arama dizinine kaydedilemedi. Yeniden dene.",
  scan_unreadable: "Taranmış sayfalardaki yazı okunamadı. Daha net bir PDF dene.",
  image_blocked: "Bu PDF sayfası işlenemedi.",
  empty_content: "PDF sayfalarında okunabilir metin bulunamadı.",
  page_text_too_large: "PDF'nin bir sayfasındaki metin güvenli işleme sınırını aşıyor. Dosyayı bölerek yeniden yükle.",
  file_too_large: "PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir.",
  unsupported_type: DOCUMENT_TYPE_REJECTED,
};

export function userMessageForProcessError(code: string | null | undefined): string {
  if (!code) return "Belge işlenemedi. Tekrar yüklemeyi dene.";
  if (MESSAGES[code]) return MESSAGES[code];
  const base = code.split(":")[0] ?? code;
  return MESSAGES[base] ?? (/^[a-z][a-z0-9_]+$/i.test(code)
    ? "Belge işlenemedi. Biraz sonra yeniden dene."
    : code);
}

export function mapExtractFailure(reason: string): string {
  if (/password|encrypted|PasswordException/i.test(reason)) return MESSAGES.encrypted_pdf;
  return MESSAGES.text_extraction_unsupported;
}
