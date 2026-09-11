import { describe, expect, it } from "vitest";
import { pickReminder, type ReminderInput } from "@/lib/learning/study-reminder";

/**
 * Hatırlatma kuralı.
 *
 * Takvim kalktıktan sonra öğrenciyi yola geri çağıran tek şey bu. Kuralın
 * iki yüzü var: geri çağırmak ve kovalamamak. Buradaki testler ikincisini
 * de tutuyor — günde bir bildirim, en aciline göre.
 */
const base: ReminderInput = {
  hasUnfinishedPath: true,
  hoursSinceActivity: 2,
  daysUntilExam: 10,
  streakDays: 0,
  streakBreaksToday: false,
  alreadyNotifiedToday: false,
};

describe("pickReminder", () => {
  it("stays quiet while the student is studying", () => {
    expect(pickReminder(base)).toBeNull();
  });

  it("says nothing when the path is finished", () => {
    // Bitmiş yolu olan öğrenciye hatırlatacak bir şey yok.
    expect(
      pickReminder({ ...base, hasUnfinishedPath: false, hoursSinceActivity: 100 }),
    ).toBeNull();
  });

  it("calls back a student who has been away a day", () => {
    const reminder = pickReminder({ ...base, hoursSinceActivity: 26 });
    expect(reminder?.kind).toBe("idle");
    // Azar değil, hatırlatma: "yapmadın" demiyoruz.
    expect(reminder?.title).toBe("Kaldığın yer seni bekliyor");
  });

  it("treats a student who never started as away", () => {
    expect(pickReminder({ ...base, hoursSinceActivity: null })?.kind).toBe("idle");
  });

  it("warns before a streak breaks", () => {
    const reminder = pickReminder({
      ...base,
      hoursSinceActivity: 26,
      streakDays: 5,
      streakBreaksToday: true,
    });
    expect(reminder?.kind).toBe("streak");
    expect(reminder?.title).toContain("5 günlük");
  });

  it("does not invent a streak worth saving", () => {
    // Tek günlük seri seri değildir; onu korumaya çağırmak zorlamadır.
    expect(
      pickReminder({
        ...base,
        hoursSinceActivity: 26,
        streakDays: 1,
        streakBreaksToday: true,
      })?.kind,
    ).toBe("idle");
  });

  it("lets the exam outrank everything else", () => {
    // Üç kural da aynı gün tutabiliyor; sınav yaklaşması en acili.
    expect(
      pickReminder({
        ...base,
        daysUntilExam: 3,
        hoursSinceActivity: 26,
        streakDays: 9,
        streakBreaksToday: true,
      })?.kind,
    ).toBe("exam_soon");
  });

  it("mentions the exam only on the third day out", () => {
    expect(pickReminder({ ...base, daysUntilExam: 4 })).toBeNull();
    expect(pickReminder({ ...base, daysUntilExam: 2 })).toBeNull();
  });

  it("never sends a second reminder the same day", () => {
    expect(
      pickReminder({
        ...base,
        alreadyNotifiedToday: true,
        daysUntilExam: 3,
        hoursSinceActivity: 200,
      }),
    ).toBeNull();
  });
});
