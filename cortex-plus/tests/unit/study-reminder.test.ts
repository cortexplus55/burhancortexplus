import { describe, expect, it } from "vitest";
import { moreUrgent, pickReminder, type ReminderInput } from "@/lib/learning/study-reminder";

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

  it("covers the last three days, not only the third", () => {
    // Kural `=== 3` iken tek bir kaçan çalıştırma uyarıyı yok ediyordu.
    // Canlıda sınavına iki gün kalmış bir hazırlık bulundu; penceresi
    // kapanmıştı ve uyarıyı hiç alamayacaktı.
    expect(pickReminder({ ...base, daysUntilExam: 3 })?.kind).toBe("exam_soon");
    expect(pickReminder({ ...base, daysUntilExam: 2 })?.kind).toBe("exam_soon");
    expect(pickReminder({ ...base, daysUntilExam: 1 })?.kind).toBe("exam_soon");
  });

  it("says the number of days it actually is", () => {
    // "Sınava 3 gün kaldı" yazıp bir gün kalmış olması öğrenciyi yanıltır.
    expect(pickReminder({ ...base, daysUntilExam: 1 })?.title).toBe("Sınava 1 gün kaldı");
    expect(pickReminder({ ...base, daysUntilExam: 2 })?.title).toBe("Sınava 2 gün kaldı");
  });

  it("stays quiet before the window and on exam day itself", () => {
    // Dördüncü gün erken. Sınav günü çalışma hatırlatması artık geç.
    expect(pickReminder({ ...base, daysUntilExam: 4 })).toBeNull();
    expect(pickReminder({ ...base, daysUntilExam: 0 })).toBeNull();
  });

  it("lets the nearest exam speak when a student has several preps", () => {
    // Öğrenci başına tek bildirim kuralı hazırlıklar ARASINDA da bir seçim
    // gerektiriyor; orada seçim yoktu, sorgudan ilk dönen kazanıyordu.
    const idle = {
      reminder: pickReminder({ ...base, hoursSinceActivity: 30 })!,
      daysUntilExam: 19,
    };
    const examSoon = {
      reminder: pickReminder({ ...base, daysUntilExam: 2 })!,
      daysUntilExam: 2,
    };
    expect(moreUrgent(examSoon, idle)).toBeLessThan(0);
    expect(moreUrgent(idle, examSoon)).toBeGreaterThan(0);
  });

  it("picks the closer exam when two are both close", () => {
    const twoDays = {
      reminder: pickReminder({ ...base, daysUntilExam: 2 })!,
      daysUntilExam: 2,
    };
    const threeDays = {
      reminder: pickReminder({ ...base, daysUntilExam: 3 })!,
      daysUntilExam: 3,
    };
    expect(moreUrgent(twoDays, threeDays)).toBeLessThan(0);
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
