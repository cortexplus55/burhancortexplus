import { FAILURE_REASON_LABEL } from "@/lib/admin/failure-labels";
import { FAMILIARITY_OPTIONS } from "@/lib/learning/session-signals";
import { STUDY_TOOLS } from "@/lib/learning/study-tools";

/**
 * Destek görünümlerinde ham kod yerine Türkçe ad (19 Ekim 2026). Kullanıcı ve hazırlık sayfaları
 * canlıda "inactive", "basics", "lesson", "slow_generation" gösteriyordu. Adlar öğrencinin
 * gördüğü kaynaklardan gelir (çalışma araçları, aşinalık seçenekleri, hata sebepleri); listede
 * olmayan kod olduğu gibi kalır.
 */
const KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(STUDY_TOOLS.map((tool) => [tool.kind, tool.title])),
  final_check: "Son kontrol",
  readiness: "Hazırlık ölçümü",
  diagnostic: "Seviye tespiti",
};

const FAMILIARITY_LABEL: Record<string, string> = Object.fromEntries(
  FAMILIARITY_OPTIONS.map((option) => [option.id, option.title]),
);

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "etkin",
  inactive: "bitti",
  cancelled: "iptal edildi",
  past_due: "ödeme gecikti",
};

export const NODE_STATUS_LABEL: Record<string, string> = {
  locked: "Kilitli",
  ready: "Açık",
  done: "Bitti",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Ödendi",
  failed: "Başarısız",
  refunded: "İade edildi",
};

const label = (map: Record<string, string>, code: string | null | undefined) => (code ? (map[code] ?? code) : "—");

export const nodeKindLabel = (kind: string | null | undefined) => label(KIND_LABEL, kind);
export const familiarityLabel = (value: string | null | undefined) => label(FAMILIARITY_LABEL, value);
export const subscriptionStatusLabel = (status: string | null | undefined) => label(SUBSCRIPTION_STATUS_LABEL, status);
export const nodeStatusLabel = (status: string | null | undefined) => label(NODE_STATUS_LABEL, status);
export const failureReasonLabel = (reason: string | null | undefined) => label(FAILURE_REASON_LABEL, reason);
export const paymentStatusLabel = (status: string | null | undefined) => label(PAYMENT_STATUS_LABEL, status);
