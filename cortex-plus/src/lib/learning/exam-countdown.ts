/**
 * Sınav geri sayımı — dashboard ve NBA için tek kaynak.
 *
 * Öncelik: en yakın gelecekteki exam_preps.exam_date → learning_goals.target_date.
 */

export type ExamCountdown =
  | {
      state: "countdown";
      daysLeft: number;
      examDate: string;
      label: string;
      examTitle: string | null;
    }
  | {
      state: "missing";
      daysLeft: null;
      examDate: null;
      label: string;
      examTitle: null;
      addHref: string;
    }
  | {
      state: "past";
      daysLeft: number;
      examDate: string;
      label: string;
      examTitle: string | null;
      addHref: string;
    };

function istanbulToday(from = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
}

export function daysUntilDate(examDate: string, from = new Date()): number {
  const today = istanbulToday(from);
  const a = new Date(`${today}T12:00:00`);
  const b = new Date(`${examDate}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function resolveExamCountdown(input: {
  prepExamDate: string | null;
  prepTitle?: string | null;
  goalTargetDate?: string | null;
  addHref?: string;
}): ExamCountdown {
  const addHref = input.addHref ?? "/deneme-sinavlari/olustur";
  const examDate = input.prepExamDate ?? input.goalTargetDate ?? null;
  const examTitle = input.prepExamDate
    ? (input.prepTitle ?? null)
    : input.goalTargetDate
      ? "Hedef sınav"
      : null;

  if (!examDate) {
    return {
      state: "missing",
      daysLeft: null,
      examDate: null,
      label: "Sınav tarihini ekle",
      examTitle: null,
      addHref,
    };
  }

  const daysLeft = daysUntilDate(examDate);
  if (daysLeft < 0) {
    return {
      state: "past",
      daysLeft,
      examDate,
      label: "Sınav tarihi geçti — güncelle",
      examTitle,
      addHref,
    };
  }

  const name = examTitle?.trim() || "Sınav";
  return {
    state: "countdown",
    daysLeft,
    examDate,
    label:
      daysLeft === 0
        ? `${name} bugün`
        : `${name} · ${daysLeft} gün kaldı`,
    examTitle,
  };
}
