import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examCountdownHeadline, resolveExamCountdown } from "@/lib/learning/exam-countdown";

const FROM = new Date("2026-10-25T09:00:00+03:00");

describe("resolveExamCountdown", () => {
  it("prefers the active prep date over the learning goal", () => {
    const countdown = resolveExamCountdown({
      prepExamDate: "2026-11-08",
      prepTitle: "Pediatri",
      goalTargetDate: "2026-12-01",
      from: FROM,
    });
    expect(countdown).toMatchObject({
      state: "countdown",
      daysLeft: 14,
      examDate: "2026-11-08",
      examTitle: "Pediatri",
    });
    expect(examCountdownHeadline(countdown)).toBe("⏳ Sınavına 14 Gün Kaldı — Bugünkü Hedefin Hazır");
  });

  it("falls back to learning_goals.target_date", () => {
    const countdown = resolveExamCountdown({
      prepExamDate: null,
      goalTargetDate: "2026-10-25",
      from: FROM,
    });
    expect(countdown.state).toBe("countdown");
    expect(countdown.daysLeft).toBe(0);
    expect(countdown.examTitle).toBe("Hedef sınav");
    expect(examCountdownHeadline(countdown)).toBe("⏳ Sınavın Bugün — Bugünkü Hedefin Hazır");
  });

  it("marks a past date and stays silent when both dates are missing", () => {
    const past = resolveExamCountdown({
      prepExamDate: "2026-10-01",
      prepTitle: "Eski",
      from: FROM,
    });
    expect(past.state).toBe("past");
    expect(examCountdownHeadline(past)).toBeNull();
    const missing = resolveExamCountdown({ prepExamDate: null, goalTargetDate: null });
    expect(missing.state).toBe("missing");
    expect(examCountdownHeadline(missing)).toBeNull();
  });

  it("home and exam list load the countdown into the top bar", () => {
    for (const file of [
      "src/app/ogretmen/page.tsx",
      "src/app/deneme-sinavlari/page.tsx",
      "src/components/parity/sor-shell.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toMatch(/countdown/);
    }
    expect(readFileSync("src/lib/learning/exam-countdown-load.ts", "utf8")).toContain(
      "learning_goals",
    );
  });
});
