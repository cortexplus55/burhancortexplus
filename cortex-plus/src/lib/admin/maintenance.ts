/*
  Elle bakım (6 Kasım 2026, /admin/sistem · yalnız kurucu). Yeni silme mantığı YOK: günlük bakım turunun
  (`/api/cron/subscription-renewal`) çağırdığı iki işlevin aynısı, aynı sınırlarla elle tetiklenir:
  - `cleanupExpiredUploads(service)`: 3 saatten eski, tamamlanmamış imzalı yüklemeler (en çok 100).
  - `evictColdEmbeddings(service, { limit: 20, budgetMs: 60_000 })`: sınavı 45+ gün geçmiş, 30 gündür açılmayan
    hazırlıkların belgelerinin YALNIZ gömme satırları (sayfa, parça, ders kalır; açılınca yeniden indekslenir).
  Bu dosya saf: onay sözcüğü, sonuç cümlesi ve denetim kaydının ayrıntısı. Eylem `src/app/admin/sistem/actions.ts`.
*/

export const MAINTENANCE_CONFIRM = "temizle";
export const MAINTENANCE_AUDIT_ACTION = "system.maintenance_run";
/** Günlük turla aynı sınırlar (bekçi bunu tutar). */
export const MAINTENANCE_EVICTION_LIMIT = 20;
export const MAINTENANCE_EVICTION_BUDGET_MS = 60_000;

export type EvictionSummary = {
  scannedPreps: number;
  coldPreps: number;
  evictedDocuments: number;
  evictedRows: number;
  skipped: string | null;
};

export type MaintenanceOutcome = {
  /** Silinen yetim yükleme; null = adım düştü. */
  expiredUploads: number | null;
  eviction: EvictionSummary | null;
};

const SKIP_REASONS: Record<string, string> = {
  flag_off: "\"Soğuk belge vektörlerini boşaltma\" anahtarı kapalı olduğu için atlandı",
  schema: "veritabanında gerekli sütun yok (göç uygulanmamış), atlandı",
  prep_query_failed: "hazırlıklar okunamadı, atlandı",
  doc_query_failed: "belgeler okunamadı, yarıda kaldı",
};

export function maintenanceMessage(outcome: MaintenanceOutcome): string {
  const uploads =
    outcome.expiredUploads === null
      ? "Yetim yüklemeler: temizlenemedi (ayrıntı sunucu günlüğünde)."
      : outcome.expiredUploads === 0
        ? "Yetim yüklemeler: temizlenecek dosya yoktu."
        : `Yetim yüklemeler: ${outcome.expiredUploads.toLocaleString("tr-TR")} yarım kalmış yükleme silindi.`;
  const eviction = outcome.eviction;
  let vectors: string;
  if (!eviction) vectors = "Soğuk vektörler: temizlenemedi (ayrıntı sunucu günlüğünde).";
  else if (eviction.skipped) vectors = `Soğuk vektörler: ${SKIP_REASONS[eviction.skipped] ?? "atlandı"}.`;
  else if (eviction.evictedDocuments === 0)
    vectors = `Soğuk vektörler: ${eviction.scannedPreps.toLocaleString("tr-TR")} eski hazırlığa bakıldı, boşaltılacak belge yoktu.`;
  else
    vectors = `Soğuk vektörler: ${eviction.coldPreps.toLocaleString("tr-TR")} soğuk hazırlıktan ${eviction.evictedDocuments.toLocaleString("tr-TR")} belgenin ${eviction.evictedRows.toLocaleString("tr-TR")} vektör satırı boşaltıldı (belge ve dersler duruyor).`;
  return `${uploads} ${vectors}`;
}

export function maintenanceAuditMetadata(outcome: MaintenanceOutcome): Record<string, unknown> {
  return {
    expired_uploads: outcome.expiredUploads,
    evicted_documents: outcome.eviction?.evictedDocuments ?? null,
    evicted_rows: outcome.eviction?.evictedRows ?? null,
    cold_preps: outcome.eviction?.coldPreps ?? null,
    skipped: outcome.eviction?.skipped ?? null,
  };
}
