import { describe, expect, it } from "vitest";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { TopicMasteryState } from "@/lib/adaptive/types";
import { buildDailyPlanItems } from "@/lib/adaptive/daily-planner";
import { minimumLessonChecks, ensureThreeChecks } from "@/lib/learning/lesson-repair";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { hasUndelimitedLatex } from "@/lib/learning/teaching-standards";

function graph(topics: { key: string; title: string; importance?: "important" | "normal" | "less" }[]): ExamGraph {
  return {
    topics: topics.map((t, i) => ({
      topicId: `id-${i}`,
      topicKey: t.key,
      title: t.title,
      importance: t.importance ?? "normal",
      weightPercent: t.importance === "important" ? 20 : 10,
      prerequisites: [],
      sourceRefs: [],
    })),
    edges: [],
  };
}

function mastery(key: string, mastery: number): TopicMasteryState {
  return {
    topicId: `id-${key}`,
    topicKey: key,
    mastery,
    masteryConfidence: 0.5,
    evidenceCount: 2,
    recentAccuracy: null,
    independentAccuracy: null,
    examLevelAccuracy: null,
    currentDifficulty: "medium",
    lastStudiedAt: null,
    lastAssessedAt: null,
    reviewDueAt: null,
    streakCorrect: 0,
    repeatedErrorCount: 0,
    misconceptionFlags: [],
    prerequisiteRisk: false,
    status: mastery >= 0.85 ? "mastered" : "learning",
  };
}

describe("planTopicKeys oturum sırası", () => {
  it("planTopicKeys verilen konuları öne alır", () => {
    const g = graph([
      { key: "birim-cember", title: "Birim Çember", importance: "important" },
      { key: "aci-olcusu", title: "Açı Ölçüsü ve Radyan" },
    ]);
    const ranked = prioritizeTopics({
      graph: g,
      topics: [mastery("birim-cember", 0.2), mastery("aci-olcusu", 0.4)],
      planTopicKeys: ["aci-olcusu"],
      daysRemaining: 13,
    });
    expect(ranked[0]?.topicKey).toBe("aci-olcusu");
    expect(ranked[0]?.reason).toBe("plan");
  });

  it("buildDailyPlanItems öğrenme maddesini önce koyar", () => {
    const built = buildDailyPlanItems({
      userId: "u",
      examPrepId: "00000000-0000-4000-8000-000000000001",
      schedule: {
        sessions: [
          {
            calendarDate: "2099-01-01",
            topicTitle: "Açı Ölçüsü ve Radyan",
            topicId: "t1",
            role: "learn",
            durationMinutes: 20,
          },
          {
            calendarDate: "2099-01-01",
            topicTitle: "Birim Çember",
            topicId: "t2",
            role: "learn",
            durationMinutes: 20,
          },
        ],
      } as never,
      reviewItems: [],
      weakTopics: [],
      dailyMinutesCap: 90,
      masterPlanVersion: 1,
      planDate: "2099-01-01",
    });
    expect(built.items[0]?.title).toMatch(/Açı Ölçüsü/);
    expect(built.items[0]?.href).toContain("/oturum");
  });
});

describe("check count refill", () => {
  it("4 bölüm 1 kontrollü taslak ensureThreeChecks sonrası ≥3 kontrol olur", () => {
    const draft: LessonV2 = {
      title: "Trigonometri",
      overview: "Açı ölçüsü radyan ve derece ile yazılır. Dönüşüm π/180 çarpanını kullanır.",
      sections: [
        {
          heading: "Radyan",
          body: "Bir radyan, yarıçap uzunluğundaki yayının merkeze göre gördüğü açıdır. 2π radyan tam turdur.",
        },
        {
          heading: "Derece",
          body: "Tam tur 360 derecedir. 180 derece π radyana eşittir. Dönüşüm α_r = α_d × π ÷ 180 bağıntısıyla yapılır.",
        },
        {
          heading: "Dönüşüm",
          body: "Dereceden radyana geçerken açı π ile çarpılıp 180'e bölünür. Tersi için 180/π kullanılır.",
          check: {
            type: "mcq",
            prompt: "360 derece kaç radyandır?",
            options: ["2π", "π", "π/2", "4π"],
            answerIndex: 0,
            explanation: "Tam tur 2π radyandır.",
          },
        },
        {
          heading: "Birim çember",
          body: "Birim çember yarıçapı 1 olan çemberdir. Koordinatlar (cos θ, sin θ) olarak okunur.",
        },
      ],
      summary: ["2π = 360°", "π = 180°", "Dönüşüm çarpanı"],
    };
    expect(minimumLessonChecks(draft)).toBeGreaterThanOrEqual(3);
    const filled = ensureThreeChecks(draft, draft.sections.map((s) => s.body).join("\n"));
    const checks = filled.sections.filter((s) => s.check).length;
    expect(checks).toBeGreaterThanOrEqual(3);
  });
});

describe("hasUndelimitedLatex", () => {
  it("$…$ içindeki LaTeX'i engellemez", () => {
    expect(hasUndelimitedLatex("$\\alpha_{\\text{rad}}$")).toBe(false);
    expect(hasUndelimitedLatex("\\frac{1}{2}")).toBe(true);
  });
});
