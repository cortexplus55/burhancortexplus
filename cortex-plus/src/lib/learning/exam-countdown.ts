/**
 * Sınav geri sayımı — dashboard ve NBA için tek kaynak.
 *
 * Öncelik: gelecekteki hazırlık (en yakın gün, aynı günde en son kurulan).
 * Bugünkü sınav yalnız gelecekte hazırlık yoksa. Hedef kaydı hazırlık yoksa.
 */

export type CountdownCandidate = {
  examDate: string;
  title?: string | null;
  createdAt?: string | null;
};

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

/**
 * Gelecek sınav (`daysRemaining > 0`) bugünkü sınavı ezer. Aynı günde en son
 * kurulan hazırlık kazanır. Gelecek yoksa ve bugün bir sınav varsa o seçilir.
 */
export function pickCountdownCandidate(
  candidates: readonly CountdownCandidate[],
  from = new Date(),
): CountdownCandidate | null {
  const scored = candidates
    .filter((candidate) => typeof candidate.examDate === "string" && candidate.examDate.length >= 10)
    .map((candidate) => ({ candidate, days: daysUntilDate(candidate.examDate, from) }))
    .filter((row) => row.days >= 0);
  const future = scored.filter((row) => row.days > 0);
  const pool = future.length ? future : scored.filter((row) => row.days === 0);
  if (!pool.length) return null;
  pool.sort((a, b) => {
    if (a.days !== b.days) return a.days - b.days;
    return (b.candidate.createdAt ?? "").localeCompare(a.candidate.createdAt ?? "");
  });
  return pool[0]!.candidate;
}

export function resolveExamCountdown(input: {
  prepExamDate?: string | null;
  prepTitle?: string | null;
  goalTargetDate?: string | null;
  /** Öğrencinin hazırlıkları. Doluysa seçim `pickCountdownCandidate` ile yapılır. */
  candidates?: readonly CountdownCandidate[];
  addHref?: string;
  from?: Date;
}): ExamCountdown {
  const addHref = input.addHref ?? "/deneme-sinavlari/olustur";
  const picked = input.candidates ? pickCountdownCandidate(input.candidates, input.from) : null;
  const prepExamDate = input.candidates ? (picked?.examDate ?? null) : (input.prepExamDate ?? null);
  const prepTitle = input.candidates ? (picked?.title ?? null) : input.prepTitle;
  const goalTargetDate = input.candidates && input.candidates.length > 0 ? null : input.goalTargetDate;
  const examDate = prepExamDate ?? goalTargetDate ?? null;
  const examTitle = prepExamDate
    ? (prepTitle ?? null)
    : goalTargetDate
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

  const daysLeft = daysUntilDate(examDate, input.from);
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

/** Ana ekran / sınav listesi üst barı. Yalnız yaklaşan sınavda. */
export function examCountdownHeadline(countdown: ExamCountdown): string | null {
  if (countdown.state !== "countdown") return null;
  if (countdown.daysLeft === 0) return "⏳ Sınavın Bugün — Bugünkü Hedefin Hazır";
  return `⏳ Sınavına ${countdown.daysLeft} Gün Kaldı — Bugünkü Hedefin Hazır`;
}
