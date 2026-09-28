import { DOCUMENT_TYPE_REJECTED } from "@/lib/documents/upload-labels";
import { userFacingIngestionMessage } from "@/lib/documents/ingestion-errors";

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
  scan_render_failed:
    "Bu taranmış PDF'in bazı sayfaları görüntüye çevrilemedi. Tekrar dene; sorun sürerse dosyayı yeniden kaydedip yükle.",
  image_blocked: "Bu PDF sayfası işlenemedi.",
  empty_content: "PDF sayfalarında okunabilir metin bulunamadı.",
  page_text_too_large:
    "PDF'nin bir sayfasındaki metin güvenli işleme sınırını aşıyor. Dosyayı bölerek yeniden yükle.",
  file_too_large: "PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir.",
  unsupported_type: DOCUMENT_TYPE_REJECTED,
  topic_map_failed: "Konu haritası çıkarılamadı. Yeniden dene ile tekrar başlat.",
  topic_map_unavailable:
    "Konu haritası bu belgeden çıkarılamadı. Daha net bir tarama yükle veya yeniden dene.",
  topic_map_no_readable_pages:
    "Okunabilir sayfa bulunamadı; konular çıkarılamadı. Daha net taranmış bir PDF dene.",
  processing_timeout:
    "Belge işleme zaman aşımına uğradı. Devam et ile kaldığı yerden sürdürebilirsin.",
  admin_check_failed: "Hesap yetkisi doğrulanamadı. Tekrar dene.",
  scan_pages_truncated:
    "Belgenin tamamı okunamadı; yalnızca ilk sayfalar işlendi. Eksik konular olabilir.",
};

const INGESTION_DELEGATE = new Set([
  "scan_render_failed",
  "topic_map_failed",
  "topic_map_unavailable",
  "topic_map_no_readable_pages",
  "processing_timeout",
  "admin_check_failed",
]);

export function userMessageForProcessError(code: string | null | undefined): string {
  if (!code) return "Belge işlenemedi. Tekrar yüklemeyi dene.";
  const base = code.split(":")[0] ?? code;
  if (INGESTION_DELEGATE.has(base)) {
    return userFacingIngestionMessage(base);
  }
  if (MESSAGES[base]) return MESSAGES[base];
  if (MESSAGES[code]) return MESSAGES[code];
  return userFacingIngestionMessage(code);
}

export function mapExtractFailure(reason: string): string {
  if (/password|encrypted|PasswordException/i.test(reason)) return MESSAGES.encrypted_pdf;
  return MESSAGES.text_extraction_unsupported;
}

/** API gövdesinden öğrenci cümlesi — kod, error metni veya notice. */
export function messageFromProcessBody(body: Record<string, unknown>): string {
  const code =
    (typeof body.code === "string" && body.code) ||
    (typeof body.error_message === "string" && body.error_message) ||
    null;
  if (code && /^[a-z][a-z0-9_]+$/i.test(code.split(":")[0] ?? code)) {
    return userMessageForProcessError(code);
  }
  if (typeof body.error === "string" && body.error.trim()) {
    const trimmed = body.error.trim();
    if (/^[a-z][a-z0-9_]+$/i.test(trimmed)) return userMessageForProcessError(trimmed);
    return trimmed;
  }
  if (typeof body.notice === "string" && body.notice.trim()) {
    return body.notice.trim();
  }
  return userMessageForProcessError(null);
}
