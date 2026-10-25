/**
 * Hedef ustalık yüzdesi → plan sıkılığı.
 *
 * Sihirbaz "Plan bu hedefe göre sıkılaşır" diyor; takvim (`buildExamScheduleV2`)
 * bu üç kipi okur. Varsayılan 75 = mevcut dengeli akış — hedef verilmeyen eski
 * hazırlıklar ve testler değişmez.
 */

export type TargetPlanMode = "peak" | "solid" | "pass";

/** Sihirbaz kaydırıcısının varsayılanı; `buildExamScheduleV2` de bunu solid sayar. */
export const DEFAULT_SCHEDULE_TARGET = 75;

export function clampTargetScore(raw: number | null | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_SCHEDULE_TARGET;
  return Math.max(50, Math.min(100, Math.round(raw)));
}

export function targetPlanMode(score: number | null | undefined): TargetPlanMode {
  const target = clampTargetScore(score);
  if (target >= 85) return "peak";
  if (target < 70) return "pass";
  return "solid";
}

export function masteryBarForTarget(score: number | null | undefined): number {
  const mode = targetPlanMode(score);
  const target = clampTargetScore(score);
  if (mode === "peak") return Math.max(85, target);
  if (mode === "pass") return Math.min(65, target);
  return 75;
}

/** Konu süresi: zirvede biraz daha uzun, barajda daha kompakt. Solid 1. */
export function targetTempoFactor(score: number | null | undefined): number {
  const mode = targetPlanMode(score);
  if (mode === "peak") return 1.15;
  if (mode === "pass") return 0.85;
  return 1;
}

/**
 * Ağır konunun `extraPracticeForTopic` çıktısına eklenen / kısılan pay.
 * Solid: 0 (mevcut kural). Peak: her konuya en az bir ek test. Pass: ek test yok.
 */
export function extraPracticeForTarget(
  extrasFromWeight: number,
  score: number | null | undefined,
): number {
  const mode = targetPlanMode(score);
  if (mode === "peak") return Math.max(extrasFromWeight, 1) + 1;
  if (mode === "pass") return 0;
  return extrasFromWeight;
}

export function reviewPassesForTarget(
  score: number | null | undefined,
  topic: { measuredLevel?: string | null; selfHard?: boolean; examHeavy?: boolean },
): number {
  const mode = targetPlanMode(score);
  if (mode === "peak") return topic.examHeavy || topic.selfHard ? 2 : 1;
  if (mode === "pass") {
    return topic.selfHard || topic.measuredLevel === "weak" ? 1 : 0;
  }
  return 1;
}

export function targetPlanHint(score: number): {
  mode: TargetPlanMode;
  label: string;
  badge: string;
} {
  const mode = targetPlanMode(score);
  if (mode === "peak") {
    return {
      mode,
      label: "Derece / Zirve",
      badge: `🎯 %${score} Hedef: Derinlemesine testler, ekstra tekrar döngüsü ve yüksek ustalık barajı aktif`,
    };
  }
  if (mode === "pass") {
    return {
      mode,
      label: "Hızlı Baraj",
      badge: `🎯 %${score} Hedef: Çekirdek konular ve temel testler — kompakt, boğmayan yol`,
    };
  }
  return {
    mode,
    label: "Sağlam Geçiş",
    badge: `🎯 %${score} Hedef: Dengeli ders, test ve tekrar — mevcut plan akışı`,
  };
}
