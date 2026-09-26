import { describe, expect, it } from "vitest";
import { isProcessingStale } from "@/lib/documents/processing-stale";

describe("isProcessingStale", () => {
  const now = new Date("2026-09-24T10:00:00Z");
  it("yarım saatten yeni işleme takılı sayılmaz", () => {
    expect(isProcessingStale("processing", "2026-09-24T09:45:00Z", now)).toBe(false);
  });
  it("yarım saatten eski işleme takılı", () => {
    expect(isProcessingStale("processing", "2026-08-29T13:39:00Z", now)).toBe(true);
    expect(isProcessingStale("pending", null, now)).toBe(true);
  });
  it("tamamlanmış ya da başarısız belge takılı değildir", () => {
    expect(isProcessingStale("completed", "2026-08-01T00:00:00Z", now)).toBe(false);
    expect(isProcessingStale("failed", null, now)).toBe(false);
  });
});
import { resolveNextBestAction } from "@/lib/learning/next-best-action";
import { resolveExamCountdown, daysUntilDate } from "@/lib/learning/exam-countdown";
import {
  explainReadiness,
  readinessFromComposite,
} from "@/lib/learning/student-readiness";
import {
  rankWeakTopics,
  recentMissRateByTopic,
  scoreWeakTopic,
} from "@/lib/learning/weak-topic-rank";
import {
  buildTodaysStudyPlan,
  rescheduleOverdueTasks,
} from "@/lib/learning/todays-plan";
import { formatProgressLine } from "@/lib/learning/progress-line";

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

  it("işlenen belgeyi resume'dan önce gösterir ve belgenin kendisine götürür", () => {
    const a = resolveNextBestAction({
      ...base,
      processingDocumentId: "d1",
      resumeHref: "/deneme",
    });
    expect(a.kind).toBe("document_processing");
    expect(a.href).toBe("/dokumanlar/d1");
  });

  it("yarım kalan çalışma bugünün görevinden önce gelir", () => {
    const a = resolveNextBestAction({
      ...base,
      resumeHref: "/deneme-sinavlari/p/dugum/n",
      studyTaskHref: "/calisma-plani",
    });
    expect(a.kind).toBe("exam_resume");
  });

  it("bugünün görevi varsa etiket 'Çalışmaya devam et'", () => {
    const a = resolveNextBestAction({ ...base, studyTaskHref: "/calisma-plani" });
    expect(a.kind).toBe("study_task");
    expect(a.label).toBe("Çalışmaya devam et");
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

  it("yakın dönem yanlış oranı sıralamayı değiştirir", () => {
    const base = {
      wrongCount: 3,
      correctStreak: 0,
      lastReviewedAt: null,
      severity: 0.5,
    };
    const hot = scoreWeakTopic({ ...base, topicLabel: "A", recentMissRate: 0.9 });
    const cool = scoreWeakTopic({ ...base, topicLabel: "B", recentMissRate: 0.1 });
    expect(hot).toBeGreaterThan(cool);
  });

  it("recentMissRateByTopic 30 günden eski ölçümü saymaz", () => {
    const now = new Date("2026-09-24T09:00:00Z");
    const old = new Date("2026-06-01T09:00:00Z").toISOString();
    const fresh = new Date("2026-09-20T09:00:00Z").toISOString();
    const rates = recentMissRateByTopic(
      [
        { topic_label: "Fonksiyonlar", severity: 1, created_at: old },
        { topic_label: "Fonksiyonlar", severity: 0.5, created_at: fresh },
        { topic_label: "Fonksiyonlar", severity: 0.1, created_at: fresh },
        { topic_label: "Paragraf", severity: 0.8, created_at: old },
      ],
      now,
    );
    expect(rates.get("Fonksiyonlar")).toBeCloseTo(0.3);
    expect(rates.has("Paragraf")).toBe(false);
  });
});

describe("progress line", () => {
  it("veri yoksa satır yok", () => {
    expect(
      formatProgressLine({
        onTargetTopics: 0,
        totalTopics: 0,
        masteredMistakes: 0,
        openMistakes: 0,
        lastExamScore: null,
        lastExamAt: null,
      }),
    ).toBeNull();
  });

  it("konu, defter ve deneme tek cümlede", () => {
    const line = formatProgressLine({
      onTargetTopics: 11,
      totalTopics: 18,
      masteredMistakes: 4,
      openMistakes: 2,
      lastExamScore: 68,
      lastExamAt: "2026-09-20",
    });
    expect(line).toContain("18 konudan 11");
    expect(line).toContain("4 yanlış defterden çıktı");
    expect(line).toContain("%68");
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

  it("günlük süre tavanı listeyi sondan kırpar, ilk görev kalır", () => {
    const { tasks, totalMinutes } = buildTodaysStudyPlan({
      openMistakes: 5,
      weakTopicLabels: ["Fonksiyonlar", "Olasılık"],
      includeOral: true,
      prepNode: { id: "n1", title: "Türev", href: "/x" },
      dailyMinutesCap: 20,
    });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(totalMinutes).toBeLessThanOrEqual(20);
    expect(tasks[0]?.kind).toBe("prep_node");
  });

  it("tavan tek görevden küçükse görev yine kalır", () => {
    const { tasks } = buildTodaysStudyPlan({
      prepNode: { id: "n1", title: "Türev", href: "/x" },
      dailyMinutesCap: 5,
    });
    expect(tasks).toHaveLength(1);
  });
});
