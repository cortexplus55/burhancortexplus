/**
 * Belge işleme hatalarının öğrenciye söylenen hâli.
 *
 * Veritabanındaki `error_message` bir makine kodu (`embed_failed`) ya da
 * eski kayıtlarda serbest metin olabilir. Kod ise Türkçe karşılığı, tanınmayan
 * kod ise genel bir "tekrar dene"; ham teknik metin hiçbir sayfada görünmez.
 * Liste ve detay sayfası aynı eşlemeyi kullanır.
 */
import { DOCUMENT_TYPE_REJECTED } from "@/lib/documents/upload-labels";

const topicMapErrorLabels: Record<string, string> = {
  topic_map_unavailable: "Konular çıkarılamadı — belgeyi tekrar yüklemeyi dene",
  document_status_update_failed: "Kaydedilemedi — tekrar dene",
};

const processErrorLabels: Record<string, string> = {
  download_failed: "Dosya depodan okunamadı — tekrar dene",
  processing_failed: "Belge işlenemedi — tekrar dene",
  encrypted_pdf: "Bu PDF şifreli olduğu için okunamıyor.",
  password_protected: "Bu PDF şifreli olduğu için okunamıyor.",
  too_large: "Bu dosya izin verilen maksimum boyuttan büyük.",
  unsupported_type: DOCUMENT_TYPE_REJECTED,
  unreadable_document: "Belgenin bazı sayfalarında okunabilir metin bulunamadı.",
  no_text: "Belgenin bazı sayfalarında okunabilir metin bulunamadı.",
  openai_missing: "Metin hazırlama servisi şu an kapalı — biraz sonra dene",
  embed_failed: "İçerik hazırlanamadı — tekrar dene",
};

const GENERIC = "Belge işlenemedi — tekrar dene";

export function topicMapErrorLabel(code: string): string {
  return topicMapErrorLabels[code] ?? GENERIC;
}

/**
 * Serbest metin yalnızca Türkçe cümle gibi görünüyorsa (boşluk içeriyor,
 * kod değil) aynen geçer; `Error: ECONNRESET` gibi teknik ifadeler geçmez.
 */
export function processErrorLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (processErrorLabels[trimmed]) return processErrorLabels[trimmed];
  if (/^[a-z_]+$/i.test(trimmed)) return GENERIC;
  if (/(error|exception|econn|timeout|stack|undefined|null)/i.test(trimmed)) {
    return GENERIC;
  }
  return trimmed;
}
