/**
 * Next Best Action — sunucu karar verir, UI yalnızca render eder.
 *
 * Mevcut prep helper'larını wrap eder; yeni bir devam motoru icat etmez.
 */

export type NextBestActionKind =
  | "onboarding"
  | "document_processing"
  | "exam_resume"
  | "study_task"
  | "mistake_review"
  | "exam_prep_node"
  | "first_setup"
  | "ai_teacher"
  | "add_exam_date";

export type NextBestAction = {
  kind: NextBestActionKind;
  href: string;
  label: string;
  reason: string;
};

export type NextBestActionInput = {
  onboardingComplete: boolean;
  processingDocumentId: string | null;
  processingDocumentName?: string | null;
  /** In-progress practice exam or exam-prep node attempt. */
  resumeHref: string | null;
  resumeLabel?: string | null;
  /** First incomplete today's (or overdue→today) study task. */
  studyTaskHref: string | null;
  studyTaskTitle?: string | null;
  openMistakeCount: number;
  /** Continue into exam prep (continueHref / nextReadyNode). */
  examPrepContinueHref: string | null;
  examPrepContinueLabel?: string | null;
  hasCompletedDocument: boolean;
  examDateMissing: boolean;
};

/**
 * Sabit öncelik: onboarding → processing → resume → task → mistakes → prep → setup → AI.
 */
export function resolveNextBestAction(
  input: NextBestActionInput,
): NextBestAction {
  if (!input.onboardingComplete) {
    return {
      kind: "onboarding",
      href: "/onboarding",
      label: "Profilini tamamla",
      reason: "Onboarding henüz bitmedi",
    };
  }

  if (input.processingDocumentId) {
    return {
      kind: "document_processing",
      href: `/dokumanlar/${input.processingDocumentId}`,
      label: "Belge işleniyor",
      reason: input.processingDocumentName
        ? `${input.processingDocumentName} hâlâ hazırlanıyor`
        : "Belgen işleniyor",
    };
  }

  if (input.resumeHref) {
    return {
      kind: "exam_resume",
      href: input.resumeHref,
      label: input.resumeLabel ?? "Kaldığın yerden devam et",
      reason: "Yarım kalan bir deneme veya düğüm var",
    };
  }

  if (input.studyTaskHref) {
    return {
      kind: "study_task",
      href: input.studyTaskHref,
      label: "Çalışmaya devam et",
      reason: input.studyTaskTitle
        ? `Sıradaki görev: ${input.studyTaskTitle}`
        : "Bugün bekleyen bir görev var",
    };
  }

  if (input.openMistakeCount > 0) {
    return {
      kind: "mistake_review",
      href: "/gunluk",
      label: "Yanlışlarını tekrar et",
      reason: `${input.openMistakeCount} soru yanlışlar defterinde bekliyor`,
    };
  }

  if (input.examPrepContinueHref) {
    return {
      kind: "exam_prep_node",
      href: input.examPrepContinueHref,
      label: input.examPrepContinueLabel ?? "Çalışmaya devam et",
      reason: "Sınav hazırlığında sıradaki adım hazır",
    };
  }

  if (!input.hasCompletedDocument) {
    return {
      kind: "first_setup",
      href: "/dokumanlar",
      label: "İlk belgeni yükle",
      reason: "Çalışma döngüsü belgeyle başlar",
    };
  }

  if (input.examDateMissing) {
    return {
      kind: "add_exam_date",
      href: "/deneme-sinavlari/olustur",
      label: "Sınav tarihini ekle",
      reason: "Geri sayım ve plan için tarih gerekli",
    };
  }

  return {
    kind: "ai_teacher",
    href: "/ogretmen",
    label: "AI Öğretmen'e sor",
    reason: "Takıldığın yeri sorarak devam et",
  };
}
