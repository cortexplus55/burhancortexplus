/**
 * Short Turkish copy for reason codes — shown as "Bunu neden çalışıyorum?"
 */

import type { ReasonCode } from "@/lib/adaptive/types";

const COPY: Record<ReasonCode, string> = {
  REPEATED_MISCONCEPTION:
    "Bu konuyu tekrar ekledik çünkü son iki denemede aynı noktada zorlandın.",
  LOW_MASTERY:
    "Bu konuda henüz yeterli kanıt yok; sağlamlaştırmak için çalışıyoruz.",
  REVIEW_DUE:
    "Bu konu tamamlandı. Kısa bir tekrar zamanı geldi — aralıklı tekrar programındasın.",
  PREREQUISITE_GAP:
    "Hedef konuya geçmeden önce gerekli temeli kısa tutuyoruz.",
  PLAN_BEHIND:
    "Bugünkü planın, kaçırdığın çalışma günlerine göre yeniden dengelendi.",
  EXAM_HIGH_WEIGHT_TOPIC:
    "Sınavda ağırlığı yüksek bir konu; öncelik verildi.",
  DIAGNOSTIC_WEAK:
    "Başlangıç ölçümünde zayıf görünen bir noktayı kapatıyoruz.",
  SESSION_TIME_SHORT:
    "Kalan süren kısa; hızlı ve yüksek getiri bir adım seçildi.",
  PLAN_OBJECTIVE:
    "Bugünkü programındaki sıradaki hedef bu.",
  MANUAL_OVERRIDE:
    "Senin tercihinle bu adıma geçildi.",
  FALLBACK_DEFAULT:
    "Bugünkü planına uygun bir sonraki adım.",
};

export function reasonCopy(code: ReasonCode): string {
  return COPY[code] ?? COPY.FALLBACK_DEFAULT;
}
