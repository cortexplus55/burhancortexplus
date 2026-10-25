import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examCountdownHeadline, pickCountdownCandidate, resolveExamCountdown } from "@/lib/learning/exam-countdown";

const FROM = new Date("2026-10-25T09:00:00+03:00");

describe("geri sayım gelecek sınavı seçer", () => {
  it("bugünkü eski hazırlık 42 gün sonrakini ezmez", () => {
    const countdown = resolveExamCountdown({
      candidates: [
        { examDate: "2026-10-25", title: "Eski deneme", createdAt: "2026-09-01T00:00:00Z" },
        { examDate: "2026-12-06", title: "Yeni hazırlık", createdAt: "2026-10-25T08:00:00Z" },
      ],
      from: FROM,
    });
    expect(countdown).toMatchObject({
      state: "countdown",
      daysLeft: 42,
      examDate: "2026-12-06",
      examTitle: "Yeni hazırlık",
    });
    expect(examCountdownHeadline(countdown)).toBe("⏳ Sınavına 42 Gün Kaldı — Bugünkü Hedefin Hazır");
  });

  it("aynı günde en son kurulanı seçer; gelecek yoksa bugünü gösterir", () => {
    const sameDay = pickCountdownCandidate(
      [
        { examDate: "2026-11-02", title: "Eski", createdAt: "2026-10-01T00:00:00Z" },
        { examDate: "2026-11-02", title: "Yeni", createdAt: "2026-10-20T00:00:00Z" },
      ],
      FROM,
    );
    expect(sameDay?.title).toBe("Yeni");

    const todayOnly = resolveExamCountdown({
      candidates: [{ examDate: "2026-10-25", title: "Bugünkü", createdAt: "2026-10-01T00:00:00Z" }],
      from: FROM,
    });
    expect(todayOnly.daysLeft).toBe(0);
    expect(examCountdownHeadline(todayOnly)).toBe("⏳ Sınavın Bugün — Bugünkü Hedefin Hazır");
  });

  it("hazırlık yoksa hedefe düşer; yükleyici tek satırla kesmez", () => {
    const goal = resolveExamCountdown({
      candidates: [],
      goalTargetDate: "2026-11-20",
      from: FROM,
    });
    expect(goal.examTitle).toBe("Hedef sınav");
    expect(goal.daysLeft).toBe(26);
    const loader = readFileSync("src/lib/learning/exam-countdown-load.ts", "utf8");
    expect(loader).toContain("created_at");
    expect(loader).toContain(".limit(20)");
    expect(loader).toContain("candidates");
  });
});
