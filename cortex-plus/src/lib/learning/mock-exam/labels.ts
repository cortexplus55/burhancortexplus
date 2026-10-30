import type { MockQuestionType } from "@/lib/learning/mock-exam/types";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { studentSafeText } from "@/lib/learning/student-safe-text";

export const QUESTION_TYPE_LABEL: Record<MockQuestionType, string> = {
  mcq: "Tek seçim",
  multi_mcq: "Birden fazla doğru olabilir",
  true_false: "Doğru / yanlış",
  numeric: "Sayısal cevap",
  short_answer: "Kısa cevap",
  open: "Klasik",
};

/**
 * Açık uçlu sorunun altındaki yönerge (30 Ekim 2026, canlı tur): "Adım adım yaz; ara sonuçlarını göster" tanım ve
 * açıklama sorularının altında da yazıyordu. Hesap sorusu (kökte sayı ya da hesap fiili) adım ister; öbürü düzenli
 * bir açıklama.
 */
export function openAnswerHint(stem: string): string {
  const computational = /d/.test(stem) || /(?:hesapla|hesaplay|kaç|bulunuz|bulun|çözünüz|çöz|türet|ispatla|gösteriniz)/iu.test(stem);
  return computational ? "Adım adım yaz; ara sonuçlarını göster." : "Kendi cümlelerinle, ana noktaları sırayla yaz.";
}

export function questionTypeChip(type: MockQuestionType, points?: number): string {
  if (type === "open" && points != null) return `Klasik · ${points} puan`;
  return QUESTION_TYPE_LABEL[type];
}

export function polishMockCopy(text: string): string {
  const repaired = repairTurkishSurface(text.trim());
  return studentSafeText(repaired);
}

export function scoreBandLabel(
  score: number,
  target: number | null,
): { tone: "success" | "warning" | "danger" | "neutral"; text: string } {
  if (target == null) {
    return { tone: "neutral", text: "Hedef puan belirle" };
  }
  if (score >= target) {
    return { tone: "success", text: "Hedefinin üstündesin" };
  }
  const gap = target - score;
  if (gap <= 15) {
    return { tone: "warning", text: `Hedefe ${gap} puan kaldı` };
  }
  return { tone: "danger", text: "Temel konulara dönmen iyi olur" };
}

export function multiMcqScoringNote(): string {
  return polishMockCopy(
    "Birden fazla doğrulu sorularda doğru seçimler puan kazandırır, yanlış seçimler düşürür.",
  );
}
