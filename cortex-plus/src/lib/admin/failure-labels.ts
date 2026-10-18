/**
 * Ders üretim hatası sebep kodlarının Türkçe adları — tek kaynak.
 *
 * `/admin/ders-hatalari` süzgeci ve tablosu ile günlük özet e-postası aynı listeyi
 * okur; kod yeni bir sebep yazmaya başladığında buraya eklenir, yoksa ham kod görünür.
 */
export const FAILURE_REASON_LABEL: Record<string, string> = {
  source_unavailable: "Kaynak yok",
  content_verification_failed: "Kalite kapısı",
  generation_failed: "Üretim hatası",
  no_prep_documents: "Belge yok",
  documents_processing: "Belge işleniyor",
  no_topic_mapping: "Konu eşleşmedi",
  pages_unusable: "Sayfa okunamadı",
  search_no_match: "Arama eşleşmedi",
  search_error: "Arama hatası",
  // Hata değil: ders çıktı ama düzeltme turu açtı (yavaş). Neden ret cümlelerinde.
  slow_generation: "Yavaş üretim (düzeltme turu)",
  // 18 Ekim 2026: akışlı motor. Taslak okunamadı (yeniden yazıldı) ya da düzelmeyen kavram atıldı.
  draft_unreadable: "Taslak okunamadı (yeniden yazıldı)",
  concept_dropped: "Kavram atıldı (düzelmedi)",
};

/**
 * Öğrenciye içerik yine de ulaşan kayıtlar: ders çıktı, yalnız yavaş ya da yeniden yazıldı.
 * Özet bunları "yavaş" sütununda ayrı sayar; "başarısız" sayısına girmezler.
 */
export const SOFT_FAILURE_REASONS: ReadonlySet<string> = new Set(["slow_generation", "draft_unreadable"]);
