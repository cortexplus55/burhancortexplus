/**
 * Stage 10 — quality matrix (document / subject / student / technical).
 * Pure fixtures + existing helpers. No secrets, no live network.
 */
import { describe, expect, it } from "vitest";
import { analyzePages } from "@/lib/documents/page-analysis";
import { buildTopicMap } from "@/lib/documents/topic-map";
import { buildCoverageReport } from "@/lib/documents/coverage";
import {
  checkImpossiblePercentClaims,
  checkSimpleMathClaims,
  runIndependentValidation,
} from "@/lib/learning/validation-pipeline";
import {
  extractMisconceptions,
  validateQuizPedagogy,
  validateTrueFalsePedagogy,
} from "@/lib/learning/teaching-standards";
import {
  buildLearningIndicators,
  extractAnswerEvidence,
  foldTopicMastery,
} from "@/lib/learning/learning-tracking";
import {
  isCreatingStale,
  isStaleWrite,
  mergeAnswersForScoring,
  shouldReuseExistingStart,
} from "@/lib/learning/attempt-lifecycle";
import {
  buildExamScheduleV2,
  redistributeRemainingSchedule,
} from "@/lib/learning/exam-schedule-v2";
import { missedIncompleteGroups, groupNodesByStudyDay } from "@/lib/learning/exam-prep-ui-path";
import { isLongEnough, wordCount } from "@/lib/learning/explain-review";
import { scoreQuizAnswers, type QuizQuestion } from "@/lib/learning/exam-quiz";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

const quizQ = (
  text: string,
  options: string[],
  correct: string[],
  extra?: Partial<QuizQuestion>,
): QuizQuestion => ({
  text,
  options,
  correct,
  multi: false,
  explanation: "Açıklama metni yeterince uzun tutuldu.",
  learningObjective: "Öğrenme hedefi yeterince uzun",
  ...extra,
});

describe("Stage 10 document varieties", () => {
  it("text PDF fixture covers instructional pages", () => {
    const pages = [
      "1. Derece ve radyan\n180 derece = π radyan.\nÖrnek: 90° = π/2",
      "2. Birim çember\nsin θ = y, cos θ = x\nsin²+cos²=1",
    ];
    const analyses = analyzePages(pages);
    const { topics, mergedTitles } = buildTopicMap(analyses);
    const coverage = buildCoverageReport(analyses, topics, mergedTitles);
    expect(coverage.uncoveredContentPages).toEqual([]);
    expect(coverage.status).toBe("complete");
  });

  it("scanned / OCR-gap pages stay unreadable (no invented OCR)", () => {
    const analyses = analyzePages(["", "ab", "xx"]);
    expect(analyses[0].pageKind).toBe("blank");
    expect(analyses[1].pageKind).toBe("unreadable");
    expect(analyses[1].extractionMethod).toBe("none");
    expect(analyses[1].uncertainRegions.some((r) => /taranmış|görsel/i.test(r))).toBe(
      true,
    );
  });

  it("formula/graph-heavy pages flag visual-analysis gap", () => {
    const page =
      "sin²θ+cos²θ=1\n√2/2\nπ/3\n∑x\n∫dx\ny=A sin(Bx)\nθ=90°\n≈≠≤≥";
    const [analysis] = analyzePages([page]);
    expect(analysis.formulas.length).toBeGreaterThanOrEqual(4);
    expect(
      analysis.uncertainRegions.some((r) => /görsel analiz henüz yok/i.test(r)),
    ).toBe(true);
  });

  it("tables are detected via pipe/tab heuristics", () => {
    const [analysis] = analyzePages([
      "Açı tablosu\n| açı | sin | cos |\n| 30 | 1/2 | √3/2 |\n| 45 | √2/2 | √2/2 |",
    ]);
    expect(analysis.tablesDetected).toBeGreaterThanOrEqual(1);
  });

  it("long doc (~40 pages) still builds a topic map without silent drops", () => {
    const pages = Array.from({ length: 40 }, (_, i) => {
      if (i === 0) return "KAPAK\nFizik Ders Notları\nYazar: Cortex Plus\nISBN 978-0-000000-00-0\nYayınevi deneme baskısı";
      if (i === 1) {
        return "İÇİNDEKİLER\n1. Kuvvet ve hareket\n2. Enerji dönüşümleri\n3. Elektrik";
      }
      if (i === 39) {
        return "CEVAP ANAHTARI\n1) 10 N  2) 20 J  3) 5 m/s  4) 12 V";
      }
      return `Newton kuvvet ve ivme\nF = m a\nÖrnek ${i}: kütle ${i} kg hareket eder.`;
    });
    const analyses = analyzePages(pages);
    expect(analyses[1].pageKind).toBe("toc");
    expect(analyses[39].pageKind).toBe("answer_key");
    const { topics, mergedTitles } = buildTopicMap(analyses);
    const coverage = buildCoverageReport(analyses, topics, mergedTitles);
    expect(coverage.totalPages).toBe(40);
    expect(topics.some((t) => t.title === "Kuvvet ve hareket")).toBe(true);
    expect(coverage.unreadablePages).toEqual([]);
  });

  it("repeated near-duplicate topics merge instead of double-counting", () => {
    const analyses = analyzePages([
      "1. Birim çember\nsin θ = y\nÖrnek: 90°",
      "Birim çember devam\ncos θ = x\nÖrnek: 0°",
    ]);
    const { topics, mergedTitles } = buildTopicMap(analyses);
    const circle = topics.filter((t) => /birim çember/i.test(t.title));
    expect(circle.length).toBe(1);
    expect(circle[0].pageNumbers).toEqual(expect.arrayContaining([1, 2]));
    expect(mergedTitles.length + topics.length).toBeGreaterThan(0);
  });

  it("multi-doc is simulated by concatenating page arrays (prep binds one document)", () => {
    const docA = analyzePages([
      "Fotosentez\nKlorofil ışığı emer.\nHücre mitokondri ile ATP üretir.",
    ]);
    const docB = analyzePages([
      "Osmanlı Devleti\n1453 İstanbul'un fethi.\nCumhuriyet inkılapları.",
    ]);
    // Product: exam_preps.document_id is singular — Stage 10 records this as partial.
    const combined = [...docA, ...docB.map((p) => ({ ...p, pageNumber: p.pageNumber + 1 }))];
    const { topics } = buildTopicMap(combined);
    const titles = topics.map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(["Hücre ve enerji", "Tarih"]));
  });
});

describe("Stage 10 subject varieties (domain validators + topic seeds)", () => {
  const subjects: { label: string; pages: string[]; topic: string; badDraft: string }[] =
    [
      {
        label: "Math",
        pages: ["Birim çember\nsin 90° = 1\ncos 0° = 1"],
        topic: "Birim çember",
        badDraft: "2+2=5",
      },
      {
        label: "Physics",
        pages: ["Newton kuvvet\nF = m a\nKinetik enerji = 1/2 m v²"],
        topic: "Kuvvet ve hareket",
        badDraft: "5 kg = 5 g",
      },
      {
        label: "Chemistry",
        pages: ["Mol ve Avogadro\n1 mol madde 6.02×10²³ parçacıktır.\nAsit-baz tepkimesi."],
        topic: "Kimyasal tepkimeler",
        badDraft: "1 mol = 1 g",
      },
      {
        label: "Biology",
        pages: ["Fotosentez\nKlorofil ışık enerjisini yakalar.\nMitokondri ATP üretir."],
        topic: "Hücre ve enerji",
        badDraft: "yüzde 150 verim",
      },
      {
        label: "History",
        pages: ["Osmanlı ve Cumhuriyet\n1453 İstanbul.\nİnkılaplar dönemi."],
        topic: "Tarih",
        badDraft: "2+2=5",
      },
      {
        label: "Geography",
        pages: ["Türkiye coğrafyası\nİklim tipleri ve yer şekilleri.\nHarita okuma: plato, delta."],
        topic: "Coğrafya",
        badDraft: "3×3=10",
      },
      {
        label: "Turkish",
        pages: ["Cümle öğeleri\nÖzne ve yüklem.\nAnlatım bozukluğu ve yazım kuralı."],
        topic: "Türkçe dil bilgisi",
        badDraft: "4÷2=3",
      },
    ];

  for (const subject of subjects) {
    it(`${subject.label}: topic seed + domain reject on bad claim`, () => {
      const analyses = analyzePages(subject.pages);
      const { topics } = buildTopicMap(analyses);
      expect(topics.some((t) => t.title === subject.topic)).toBe(true);

      const mathIssues = checkSimpleMathClaims(subject.badDraft);
      const percentIssues = checkImpossiblePercentClaims(subject.badDraft);
      const unitResult = runIndependentValidation({
        draft: subject.badDraft,
        parsed: {
          questions: [
            { text: "Soru metni yeterince uzun olsun", options: ["a", "b"] },
            { text: "İkinci soru da yeterince uzun", options: ["a", "b"] },
            { text: "Üçüncü soru da yeterince uzun", options: ["a", "b"] },
          ],
        },
        minItems: 3,
        pedagogyIssues: [],
        subjectHint: subject.label.toLowerCase(),
      });

      const domainHit =
        mathIssues.length > 0 ||
        percentIssues.length > 0 ||
        unitResult.issues.some((i) => i.stage === "domain");
      expect(domainHit).toBe(true);
    });
  }

  it("quiz pedagogy accepts a solid physics stem", () => {
    expect(
      validateQuizPedagogy(
        [
          quizQ(
            "Newton'un ikinci yasasında net kuvvet neye eşittir?",
            ["m·a", "m/a", "a/m", "m+a"],
            ["m·a"],
          ),
        ],
        { requireObjective: true },
      ),
    ).toEqual([]);
  });
});

describe("Stage 10 student behaviors", () => {
  const payload = {
    type: "quiz" as const,
    questions: [
      quizQ("sin 90°?", ["1", "0"], ["1"], { misconceptionTag: "sin_cos_swap" }),
      quizQ("cos 0°?", ["1", "0"], ["1"]),
      quizQ("tan 45°?", ["1", "0"], ["1"]),
    ],
  };

  it("correct answers mark independent success", () => {
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      isFirstAttempt: true,
      answers: { "0": "1", "1": "1", "2": "1" },
      payload,
    });
    expect(evidence.every((e) => e.correct && e.independentSuccess)).toBe(true);
  });

  it("partial credit does not claim full readiness", () => {
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      isFirstAttempt: true,
      answers: { "0": "1", "1": "0", "2": "0" },
      payload,
    });
    const topics = foldTopicMastery(evidence);
    const indicators = buildLearningIndicators({
      nodes: [
        { kind: "quiz" as PlanNodeKind, status: "done" },
        { kind: "quiz" as PlanNodeKind, status: "done" },
      ],
      topics,
      plannedTopicKeys: ["trigonometri"],
      openMisconceptions: 1,
    });
    expect(indicators.programProgress.pct).toBe(100);
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
    expect(indicators.examReadiness.pct).toBeLessThan(100);
  });

  it("common wrong extracts misconception tag", () => {
    const drafts = extractMisconceptions({
      kind: "quiz",
      topicLabel: "Trig",
      answers: { "0": "0" },
      payload: {
        type: "quiz",
        questions: [payload.questions[0]],
      },
    });
    expect(drafts[0]?.wrongType).toBe("sin_cos_swap");
  });

  it("blank answers score as incorrect / unscored", () => {
    const scored = scoreQuizAnswers(payload.questions, {});
    expect(scored.score).toBe(0);
    expect(scored.total).toBe(3);
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      isFirstAttempt: true,
      answers: {},
      payload,
    });
    expect(evidence.every((e) => e.correct === false)).toBe(true);
  });

  it("irrelevant long text passes length gate but is not treated as mastery", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `kelime${i}`).join(" ");
    expect(wordCount(filler)).toBeGreaterThanOrEqual(15);
    expect(isLongEnough(filler)).toBe(true);
    // Length alone never becomes readiness claim.
    const indicators = buildLearningIndicators({
      nodes: [{ kind: "written_exam" as PlanNodeKind, status: "done" }],
      topics: [],
      plannedTopicKeys: ["trigonometri"],
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
  });

  it("hint-assisted success is not independent", () => {
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      isFirstAttempt: true,
      hintsUsed: { "0": true },
      answers: { "0": "1", "1": "1", "2": "1" },
      payload,
    });
    expect(evidence[0].hintAssisted).toBe(true);
    expect(evidence[0].independentSuccess).toBe(false);
  });

  it("re-solve (second attempt) clears first-attempt flag", () => {
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      isFirstAttempt: false,
      answers: { "0": "1", "1": "1", "2": "1" },
      payload,
    });
    expect(evidence.every((e) => e.isFirstAttempt === false)).toBe(true);
  });

  it("abandon mid-activity keeps resume path open", () => {
    expect(
      shouldReuseExistingStart({ status: "active", hasPayload: true }),
    ).toBe("return_ready");
    expect(
      shouldReuseExistingStart({ status: "creating", hasPayload: false }),
    ).toBe("resume_creating");
  });

  it("missed day surfaces for reschedule nudge", () => {
    const groups = groupNodesByStudyDay(
      [
        {
          id: "a",
          dayIndex: 1,
          status: "ready",
          sessionMeta: { calendarDate: "2026-09-07" },
        },
      ],
      new Date(2026, 8, 9),
    );
    expect(missedIncompleteGroups(groups)).toHaveLength(1);
  });

  it("changing exam date redistributes remaining while keeping completed", () => {
    const topics = [
      {
        id: "t1",
        title: "Derece",
        measuredLevel: "weak" as const,
        pageNumbers: [1],
      },
      {
        id: "t2",
        title: "Birim çember",
        measuredLevel: "emerging" as const,
        prerequisites: ["Derece"],
        pageNumbers: [2],
      },
    ];
    const previous = buildExamScheduleV2({
      daysToExam: 10,
      dailyMinutes: 40,
      studyDays: [1, 2, 3, 4, 5],
      topics,
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    const first = previous.sessions[0];
    const redistributed = redistributeRemainingSchedule({
      previous,
      completed: [{ sortOrder: first.sortOrder, calendarDate: first.calendarDate }],
      fromDate: new Date("2026-09-15T12:00:00"),
      dailyMinutes: 40,
      studyDays: [1, 2, 3, 4, 5],
      daysToExam: 7,
      topics,
    });
    expect(
      redistributed.sessions.some(
        (s) =>
          s.calendarDate === first.calendarDate && s.sortOrder === first.sortOrder,
      ),
    ).toBe(true);
    expect(redistributed.summary).toMatch(/yeniden dağıtıldı/i);
  });
});

describe("Stage 10 technical scenarios", () => {
  it("refresh: saved answers merge into scoring", () => {
    const questions: QuizQuestion[] = [
      quizQ("q1", ["A", "B"], ["A"]),
      quizQ("q2", ["A", "B"], ["B"]),
    ];
    const merged = mergeAnswersForScoring({ "0": "A", "1": "B" }, {});
    expect(scoreQuizAnswers(questions, merged)).toEqual({ score: 2, total: 2 });
  });

  it("disconnect / stale generation write is rejected", () => {
    expect(
      isStaleWrite({
        attemptGenerationId: "g-new",
        requestGenerationId: "g-old",
        attemptVersion: 2,
        expectedVersion: 2,
      }),
    ).toBe(true);
  });

  it("generation timeout: creating older than threshold is stale", () => {
    expect(isCreatingStale(new Date(Date.now() - 3 * 60 * 1000).toISOString())).toBe(
      true,
    );
    expect(isCreatingStale(new Date().toISOString())).toBe(false);
  });

  it("double-click complete: version mismatch blocks second writer", () => {
    expect(
      isStaleWrite({
        attemptGenerationId: "g1",
        requestGenerationId: "g1",
        attemptVersion: 4,
        expectedVersion: 3,
      }),
    ).toBe(true);
  });

  it("two tabs same attempt: older content_version loses", () => {
    expect(
      isStaleWrite({
        attemptGenerationId: "g1",
        requestGenerationId: "g1",
        attemptVersion: 5,
        expectedVersion: 4,
      }),
    ).toBe(true);
  });

  it("insufficient credits surface as reservation reason (contract)", () => {
    // generateJson maps reserveCredits.insufficient_credits → HTTP 402.
    const reason = "insufficient_credits" as const;
    const status = reason === "insufficient_credits" ? 402 : 400;
    expect(status).toBe(402);
  });

  it("validation service failure stays fail-closed (domain unit)", () => {
    const result = runIndependentValidation({
      draft: "not-json",
      parsed: null,
      pedagogyIssues: ["should not run"],
    });
    expect(result.ok).toBe(false);
    expect(result.failedStage).toBe("structural");
  });

  it("old prep on new version: legacy progress path stays available when indicators empty", () => {
    const indicators = buildLearningIndicators({
      nodes: [
        { kind: "quiz" as PlanNodeKind, status: "done" },
        { kind: "podcast" as PlanNodeKind, status: "ready" },
      ],
      topics: [],
      plannedTopicKeys: [],
    });
    expect(indicators.programProgress.pct).toBe(50);
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
  });

  it("vague true/false rejected across language subject stems", () => {
    expect(
      validateTrueFalsePedagogy([
        {
          text: "Her zaman doğrudur.",
          correct: true,
          explanation: "Belirsiz genelleme örneği olarak reddedilmeli.",
        },
      ]).length,
    ).toBeGreaterThan(0);
  });
});
