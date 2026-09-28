/**
 * Typed document-ingestion error taxonomy.
 *
 * Client and route map these codes to Turkish copy; transient codes must
 * never mark the document failed or refund credits.
 */

export type IngestionErrorScope = "page" | "batch" | "document";

export type IngestionErrorDef = {
  code: string;
  retryable: boolean;
  scope: IngestionErrorScope;
  /** Short Turkish sentence: what happened. */
  userMessage: string;
  /** Short Turkish sentence: what to do next. */
  action: string;
};

const DEFS: Record<string, IngestionErrorDef> = {
  download_failed: {
    code: "download_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Belge sunucudan alınamadı.",
    action: "Biraz sonra 'Devam et' ile kaldığı yerden sürdür.",
  },
  ingestion_lease_lost: {
    code: "ingestion_lease_lost",
    retryable: true,
    scope: "batch",
    userMessage: "İşlem kilidi kayboldu.",
    action: "Otomatik yeniden denenecek; bekle veya 'Devam et'e bas.",
  },
  ingestion_state_unavailable: {
    code: "ingestion_state_unavailable",
    retryable: true,
    scope: "batch",
    userMessage: "Belge işleme durumu şu an açılamıyor.",
    action: "Birkaç saniye sonra yeniden dene.",
  },
  page_insert_failed: {
    code: "page_insert_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Sayfalar kaydedilemedi.",
    action: "'Devam et' ile kaldığı yerden sürdür.",
  },
  cleanup_failed: {
    code: "cleanup_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Eski işlem kalıntıları temizlenemedi.",
    action: "Yeniden dene.",
  },
  chunk_insert_failed: {
    code: "chunk_insert_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Belge parçaları kaydedilemedi.",
    action: "'Devam et' ile sürdür.",
  },
  embedding_insert_failed: {
    code: "embedding_insert_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Arama dizinine yazılamadı.",
    action: "'Devam et' ile sürdür.",
  },
  embedding_unavailable: {
    code: "embedding_unavailable",
    retryable: true,
    scope: "batch",
    userMessage: "İçerik indekslenemedi.",
    action: "Biraz sonra yeniden dene.",
  },
  credit_commit_failed: {
    code: "credit_commit_failed",
    retryable: true,
    scope: "document",
    userMessage: "Kredi kaydı tamamlanamadı.",
    action: "Belgen hazır; bir sonraki adımda düzelir.",
  },
  completion_update_failed: {
    code: "completion_update_failed",
    retryable: true,
    scope: "batch",
    userMessage: "Belge durumu güncellenemedi.",
    action: "'Devam et' ile sürdür.",
  },
  operation_in_progress: {
    code: "operation_in_progress",
    retryable: true,
    scope: "batch",
    userMessage: "Belge hâlâ işleniyor.",
    action: "Bekle; işlem kaldığı yerden devam edecek.",
  },
  scan_render_failed: {
    code: "scan_render_failed",
    retryable: false,
    scope: "page",
    userMessage:
      "Bu taranmış PDF'in bazı sayfaları görüntüye çevrilemedi.",
    action:
      "Tekrar dene; sorun sürerse dosyayı 'PDF olarak yazdır' ile yeniden kaydedip yükle.",
  },
  image_blocked: {
    code: "image_blocked",
    retryable: false,
    scope: "page",
    userMessage: "Bu sayfa denetimden geçemedi.",
    action: "Ders içeriği olan sayfalarla devam edebilirsin.",
  },
  encrypted_pdf: {
    code: "encrypted_pdf",
    retryable: false,
    scope: "document",
    userMessage: "Bu PDF şifreli olduğu için okunamıyor.",
    action: "Şifreyi kaldırıp yeniden yükle.",
  },
  empty_content: {
    code: "empty_content",
    retryable: false,
    scope: "document",
    userMessage: "PDF sayfalarında okunabilir metin bulunamadı.",
    action: "Daha net taranmış veya metin katmanı olan bir PDF dene.",
  },
  not_found: {
    code: "not_found",
    retryable: false,
    scope: "document",
    userMessage: "Belge bulunamadı.",
    action: "Dosyayı yeniden yükle.",
  },
  photo_quota_exhausted: {
    code: "photo_quota_exhausted",
    retryable: false,
    scope: "document",
    userMessage: "Bu ayki taranmış sayfa hakkın doldu.",
    action: "Plus'a geç veya metin katmanı olan bir PDF yükle.",
  },
  photo_quota_unavailable: {
    code: "photo_quota_unavailable",
    retryable: true,
    scope: "batch",
    userMessage: "Fotoğraf sayfası hakkın şu an doğrulanamıyor.",
    action: "Biraz sonra yeniden dene.",
  },
  admin_check_failed: {
    code: "admin_check_failed",
    retryable: true,
    scope: "document",
    userMessage: "Hesap yetkisi doğrulanamadı.",
    action: "Tekrar dene.",
  },
  topic_map_failed: {
    code: "topic_map_failed",
    // OCR already paid; map LLM blips must not burn the document.
    retryable: true,
    scope: "batch",
    userMessage: "Konu haritası çıkarılamadı.",
    action: "Belgen kaydedildi; 'Devam et' ile kaldığı yerden sürdür.",
  },
  topic_map_unavailable: {
    code: "topic_map_unavailable",
    retryable: true,
    scope: "batch",
    userMessage: "Belgen kaydedildi.",
    action: "Konuları hazırlamak için Tekrar dene.",
  },
  topic_map_no_readable_pages: {
    code: "topic_map_no_readable_pages",
    retryable: false,
    scope: "document",
    userMessage: "Okunabilir sayfa bulunamadı; konular çıkarılamadı.",
    action: "Daha net taranmış bir PDF yükle.",
  },
  page_text_too_large: {
    code: "page_text_too_large",
    retryable: false,
    scope: "page",
    userMessage: "Bir sayfadaki metin güvenli işleme sınırını aşıyor.",
    action: "Dosyayı bölerek yeniden yükle.",
  },
  scan_unreadable: {
    code: "scan_unreadable",
    retryable: false,
    scope: "document",
    userMessage: "Taranmış sayfalardaki yazı okunamadı.",
    action: "Daha net taranmış ya da metin katmanı olan bir PDF dene.",
  },
  processing_timeout: {
    code: "processing_timeout",
    retryable: false,
    scope: "document",
    userMessage: "Belge işleme zaman aşımına uğradı.",
    action: "'Yeniden dene' ile kaldığı yerden sürdür.",
  },
  insufficient_credits: {
    code: "insufficient_credits",
    retryable: false,
    scope: "document",
    userMessage: "Kredin bu işlem için yetmiyor.",
    action: "Kredi al veya Plus'a geç.",
  },
  file_too_large: {
    code: "file_too_large",
    retryable: false,
    scope: "document",
    userMessage: "PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir.",
    action: "Dosyayı küçültüp yeniden yükle.",
  },
};

export function getIngestionError(code: string | null | undefined): IngestionErrorDef {
  if (!code) {
    return {
      code: "processing_failed",
      retryable: false,
      scope: "document",
      userMessage: "Belge işlenemedi.",
      action: "Tekrar yüklemeyi dene.",
    };
  }
  const base = code.split(":")[0] ?? code;
  if (DEFS[base]) return DEFS[base];
  // Unknown OpenAI / network messages: treat 5xx-ish wording as retryable.
  if (/timeout|ECONNRESET|429|5\d\d|rate.?limit|overloaded|fetch failed/i.test(code)) {
    return {
      code: base,
      retryable: true,
      scope: "batch",
      userMessage: "Sunucu şu an yoğun.",
      action: "Belgen kaydedildi; 'Devam et' ile kaldığı yerden sürdür.",
    };
  }
  if (/^[a-z][a-z0-9_]+$/i.test(base)) {
    return {
      code: base,
      retryable: false,
      scope: "document",
      userMessage: "Belge işlenemedi.",
      action: "Biraz sonra yeniden dene.",
    };
  }
  return {
    code: "processing_failed",
    retryable: false,
    scope: "document",
    userMessage: "Belge işlenemedi.",
    action: "Tekrar yüklemeyi dene.",
  };
}

export function isRetryableIngestionCode(code: string | null | undefined): boolean {
  return getIngestionError(code).retryable;
}

export function userFacingIngestionMessage(code: string | null | undefined): string {
  const def = getIngestionError(code);
  return `${def.userMessage} ${def.action}`.trim();
}

/** Codes that fail closed at the document level (no resume without user action). */
export function isTerminalDocumentCode(code: string | null | undefined): boolean {
  const def = getIngestionError(code);
  return !def.retryable && def.scope === "document";
}
