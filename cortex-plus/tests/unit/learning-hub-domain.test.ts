import { describe, expect, it } from "vitest";
import { resolveNextBestAction } from "@/lib/learning/next-best-action";
import { resolveExamCountdown, daysUntilDate } from "@/lib/learning/exam-countdown";
import {
  explainReadiness,
  readinessFromComposite,
} from "@/lib/learning/student-readiness";
import { rankWeakTopics, scoreWeakTopic } from "@/lib/learning/weak-topic-rank";
import {
  buildTodaysStudyPlan,
  rescheduleOverdueTasks,
} from "@/lib/learning/todays-plan";

describe("resolveNextBestAction", () => {
  const base = {
    onboardingComplete: true,
    processingDocumentId: null,
    resumeHref: null,
    studyTaskHref: null,
    openMistakeCount: 0,
    examPrepContinueHref: null,
    hasCompletedDocument: true,
    examDateMissing: false,
  };

  it("önce onboarding ister", () => {
    const a = resolveNextBestAction({ ...base, onboardingComplete: false });
    expect(a.kind).toBe("onboarding");
  });

  it("işlenen belgeyi resume'dan önce gösterir", () => {
    const a = resolveNextBestAction({
      ...base,
      processingDocumentId: "d1",
      resumeHref: "/deneme",
    });
    expect(a.kind).toBe("document_processing");
  });

  it("yanlış defterini prep'ten önce seçer", () => {
    const a = resolveNextBestAction({
      ...base,
      openMistakeCount: 3,
      examPrepContinueHref: "/deneme/1",
    });
    expect(a.kind).toBe("mistake_review");
    expect(a.href).toBe("/gunluk");
  });

  it("belge yoksa first setup", () => {
    const a = resolveNextBestAction({
      ...base,
      hasCompletedDocument: false,
    });
    expect(a.kind).toBe("first_setup");
  });
});

describe("exam countdown", () => {
  it("tarih yoksa missing", () => {
    const c = resolveExamCountdown({ prepExamDate: null });
    expect(c.state).toBe("missing");
  });

  it("geçmiş tarihi past sayar", () => {
    const c = resolveExamCountdown({ prepExamDate: "2020-01-01" });
    expect(c.state).toBe("past");
  });

  it("gelecek tarih countdown verir", () => {
    const future = new Date();
    future.setDate(future.getDate() + 47);
    const iso = future.toISOString().slice(0, 10);
    const c = resolveExamCountdown({
      prepExamDate: iso,
      prepTitle: "YKS",
    });
    expect(c.state).toBe("countdown");
    if (c.state === "countdown") {
      expect(c.daysLeft).toBeGreaterThan(40);
      expect(c.label).toContain("gün");
    }
  });

  it("daysUntilDate tutarlı", () => {
    expect(daysUntilDate("2020-01-01")).toBeLessThan(0);
  });
});

describe("readiness", () => {
  it("explainReadiness konu sayılarını yazar", () => {
    const text = explainReadiness({
      pct: 62,
      onTargetTopics: 11,
      totalTopics: 18,
      openMistakes: 4,
      measuredSuccessPct: 70,
    });
    expect(text).toContain("18 konudan 11");
    expect(text).toContain("%62");
  });

  it("composite ölçüm yokken düşük kalır", () => {
    const r = readinessFromComposite({
      openMistakes: 0,
      masteredMistakes: 0,
      weakTopics: [],
    });
    expect(r.pct).toBe(0);
  });
});

describe("weak topic rank", () => {
  it("çok yanlış olanı üste çıkarır", () => {
    const ranked = rankWeakTopics([
      {
        topicLabel: "Paragraf",
        wrongCount: 1,
        correctStreak: 0,
        lastReviewedAt: null,
        severity: 0.2,
        recentMissRate: 0.2,
      },
      {
        topicLabel: "Fonksiyonlar",
        wrongCount: 8,
        correctStreak: 0,
        lastReviewedAt: new Date().toISOString(),
        severity: 0.8,
        recentMissRate: 0.7,
      },
    ]);
    expect(ranked[0]?.topicLabel).toBe("Fonksiyonlar");
    expect(ranked[0]?.studyHref).toContain("Fonksiyonlar");
  });

  it("streak skoru düşürür", () => {
    const cold = scoreWeakTopic({
      topicLabel: "A",
      wrongCount: 5,
      correctStreak: 0,
      lastReviewedAt: null,
      severity: 0.5,
      recentMissRate: 0.5,
    });
    const warm = scoreWeakTopic({
      topicLabel: "A",
      wrongCount: 5,
      correctStreak: 1,
      lastReviewedAt: null,
      severity: 0.5,
      recentMissRate: 0.5,
    });
    expect(warm).toBeLessThan(cold);
  });
});

describe("todays plan", () => {
  it("overdue görevleri bugüne çeker", () => {
    const { tasks, movedIds } = rescheduleOverdueTasks(
      [
        { id: "1", title: "Eski", due_date: "2020-01-01", completed: false },
        { id: "2", title: "Bugün", due_date: "2099-01-01", completed: false },
      ],
      "2026-09-23",
    );
    expect(movedIds).toEqual(["1"]);
    expect(tasks[0]?.due_date).toBe("2026-09-23");
    expect(tasks[1]?.due_date).toBe("2099-01-01");
  });

  it("bugünün listesini üretir", () => {
    const { tasks, totalMinutes } = buildTodaysStudyPlan({
      openMistakes: 5,
      weakTopicLabels: ["Fonksiyonlar"],
      maxTasks: 4,
    });
    expect(tasks.length).toBeGreaterThan(0);
    expect(totalMinutes).toBeGreaterThan(0);
    expect(tasks.some((t) => t.kind === "mistakes")).toBe(true);
  });
});
