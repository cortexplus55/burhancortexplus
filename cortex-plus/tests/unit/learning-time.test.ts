import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  favoriteSubjects,
  formatLearningDuration,
  lastSevenDays,
  savingsTl,
  TUTOR_TL_PER_HOUR,
} from "@/lib/learning/learning-time";

/*
  Astra'nın Aktivitelerim sayfasında dakika cinsinden süre, "tüm zamanların
  tasarrufu" ve en sevilen dersler var. Ürün sahibi üçünü de seçti; tasarruf
  saati 500 ₺ (30 Eylül 2026).
*/
describe("öğrenme süresi", () => {
  it("tasarruf saati 500 ₺ ile hesaplanır", () => {
    expect(TUTOR_TL_PER_HOUR).toBe(500);
    expect(savingsTl(3600)).toBe(500);
    expect(savingsTl(10_020)).toBe(1392);
    expect(savingsTl(-5)).toBe(0);
  });

  it("süre Astra gibi yazılır", () => {
    expect(formatLearningDuration(10_020)).toBe("2 sa 47 dk");
    expect(formatLearningDuration(2100)).toBe("35 dk");
    expect(formatLearningDuration(7200)).toBe("2 sa");
    expect(formatLearningDuration(30)).toBe("0 dk");
  });

  it("son 7 gün bugünle biter, boş gün sıfır", () => {
    const week = lastSevenDays(
      [
        { activity_date: "2026-09-30", subject: "Matematik", seconds: 180 },
        { activity_date: "2026-09-30", subject: "", seconds: 120 },
        { activity_date: "2026-09-24", subject: "Kimya", seconds: 2460 },
        { activity_date: "2026-09-10", subject: "Kimya", seconds: 9999 },
      ],
      "2026-09-30",
    );
    expect(week.map((d) => d.date)).toEqual([
      "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30",
    ]);
    expect(week[0].minutes).toBe(41);
    expect(week[6].minutes).toBe(5);
    expect(week[3].minutes).toBe(0);
  });

  it("en sevilen dersler süreye göre sıralanır, adsız ve bir dakikadan kısa sayılmaz", () => {
    expect(
      favoriteSubjects([
        { activity_date: "2026-09-30", subject: "Fizik", seconds: 600 },
        { activity_date: "2026-09-29", subject: "Matematik", seconds: 900 },
        { activity_date: "2026-09-28", subject: "Fizik", seconds: 600 },
        { activity_date: "2026-09-28", subject: "", seconds: 5000 },
        { activity_date: "2026-09-28", subject: "Kimya", seconds: 30 },
      ]),
    ).toEqual(["Fizik", "Matematik"]);
  });

  it("süre yalnızca çalışırken sayılır ve sunucuda sınırlı", () => {
    const hook = readFileSync("src/components/learning/use-learning-timer.ts", "utf8");
    expect(hook).toContain('document.visibilityState === "visible"');
    expect(hook).toContain("IDLE_MS");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain('stage === "play" || stage === "oral-review"');
    const route = readFileSync("src/app/api/activity/time/route.ts", "utf8");
    expect(route).toContain("max(120)");
    const migration = "supabase/migrations/20260930200000_learning_time.sql";
    expect(existsSync(migration)).toBe(true);
    expect(readFileSync(migration, "utf8")).toContain("least(greatest(p_seconds, 0), 120)");
    expect(readFileSync("src/lib/privacy/account-deletion.ts", "utf8")).toContain('"learning_time"');
  });
});
