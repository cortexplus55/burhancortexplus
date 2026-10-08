import { describe, expect, it } from "vitest";
import { firstLessonDiagnosticSlots, measuredLevelFromAccuracy, overallMeasuredFromTopics, planDiagnosticTopics, pickMainTopics, pickStudyTopics, scoreDiagnosticAnswers, selectDiagnosticSkillQuestions, startingLevelLabel, type DiagnosticQuestion, type DiagnosticTopicPlan } from "@/lib/learning/diagnostic";

describe("planDiagnosticTopics", () => {
  it("marks topics whose only pages are unreadable as unreadable/unknown", () => {
    const plans = planDiagnosticTopics(
      [
        { id: "a", title: "Radyan", pageNumbers: [2, 3] },
        { id: "b", title: "Grafik", pageNumbers: [8] },
      ],
      [8],
    );
    expect(plans[0].status).toBe("unmeasured");
    expect(plans[1].status).toBe("unreadable");
    expect(plans[1].reason).toMatch(/okunamadı/i);
  });

  it("leaves topics without pages unmeasured", () => {
    const [plan] = planDiagnosticTopics([{ id: "x", title: "Boş", pageNumbers: [] }], []);
    expect(plan.status).toBe("unmeasured");
    expect(plan.reason).toMatch(/ölçülmedi/i);
  });

  it("carries the document's own mistakes into every plan branch", () => {
    // Çeldiriciler bunlardan üretiliyor; yolda düşerse tanı soruları yine
    // uydurma şıklara döner.
    const mistakes = ["Üssü tabanla çarpmak", "Negatif üssü sonucu negatif sanmak"];
    const plans = planDiagnosticTopics(
      [
        { id: "ok", title: "Okunur", pageNumbers: [1], commonMistakes: mistakes },
        { id: "unread", title: "Okunmaz", pageNumbers: [9], commonMistakes: mistakes },
        { id: "empty", title: "Sayfasız", pageNumbers: [], commonMistakes: mistakes },
      ],
      [9],
    );
    for (const plan of plans) {
      expect(plan.commonMistakes).toEqual(mistakes);
    }
  });
});

describe("pickMainTopics / skill plan", () => {
  it("selects one verified question per skill when backups are interleaved", () => {
    const candidates = [
      { topic: "definition", text: "D1" },
      { topic: "definition", text: "D2" },
      { topic: "concept", text: "C1" },
      { topic: "concept", text: "C2" },
      { topic: "application", text: "A1" },
      { topic: "application", text: "A2" },
    ];
    expect(selectDiagnosticSkillQuestions(candidates, ["definition", "concept", "application"])
      .map((question) => question.text)).toEqual(["D1", "C1", "A1"]);
  });
  it("first lesson measures only the selected document chapter", () => {
    const plans: DiagnosticTopicPlan[] = [
      { id: "a", title: "Büyüme", examPrepTopicId: "prep-a", pageNumbers: [1, 2], status: "unmeasured" },
      { id: "b", title: "Yenidoğan", examPrepTopicId: "prep-b", pageNumbers: [3, 4], status: "unmeasured" },
    ];
    const slots = firstLessonDiagnosticSlots(plans, "prep-a");
    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.topic.id)).toEqual(["a", "a", "a"]);
    expect(slots.map((slot) => slot.skill)).toEqual(["definition", "concept", "application"]);
    expect(firstLessonDiagnosticSlots(plans, "unknown")).toEqual([]);
  });
  it("prefers parentless nodes as main topics", () => {
    const mains = pickMainTopics([
      { id: "1", parentId: null },
      { id: "2", parentId: "1" },
      { id: "3", parentId: null },
    ]);
    expect(mains.map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("pickStudyTopics uses leaves when hierarchy exists", () => {
    const study = pickStudyTopics([
      { id: "unit", parentId: null },
      { id: "a", parentId: "unit" },
      { id: "b", parentId: "unit" },
    ]);
    expect(study.map((n) => n.id)).toEqual(["a", "b"]);
  });

});

describe("scoreDiagnosticAnswers", () => {
  const plans: DiagnosticTopicPlan[] = [
    {
      id: "t1",
      title: "Radyan",
      examPrepTopicId: "p1",
      pageNumbers: [1],
      status: "unmeasured",
    },
    {
      id: "t2",
      title: "Yay",
      examPrepTopicId: "p2",
      pageNumbers: [2],
      status: "unreadable",
      reason: "okunamadı",
    },
  ];

  const questions: DiagnosticQuestion[] = [
    {
      text: "1 radyan nedir?",
      options: ["yarıçap yay", "90 derece", "π"],
      correct: ["yarıçap yay"],
      multi: false,
      topicId: "t1",
      topicLabel: "Radyan",
      examPrepTopicId: "p1",
      skill: "definition",
    },
    {
      text: "Yay uzunluğu formülü?",
      options: ["s=rθ", "s=r/θ"],
      correct: ["s=rθ"],
      multi: false,
      topicId: "t1",
      topicLabel: "Radyan",
      examPrepTopicId: "p1",
      skill: "application",
    },
  ];

  it("keeps unreadable topics unknown and records evidence per answer", () => {
    const scored = scoreDiagnosticAnswers(questions, { "0": "yarıçap yay", "1": "s=r/θ" }, plans);
    expect(scored.score).toBe(1);
    expect(scored.total).toBe(2);
    expect(scored.evidence).toHaveLength(2);
    expect(scored.evidence[0].correct).toBe(true);
    expect(scored.evidence[1].correct).toBe(false);

    const radyan = scored.topicResults.find((t) => t.topicId === "t1")!;
    const yay = scored.topicResults.find((t) => t.topicId === "t2")!;
    expect(radyan.status).toBe("measured");
    expect(radyan.measuredLevel).toBe("emerging");
    expect(yay.status).toBe("unreadable");
    expect(yay.measuredLevel).toBe("unknown");
    expect(scored.startingLevelLabel).toMatch(/ölçüldü/i);
    expect(scored.startingLevelLabel).toMatch(/ustalığı kanıtlamaz/i);
  });

  it("does not treat few correct answers as mastery claim beyond solid starting signal", () => {
    expect(measuredLevelFromAccuracy(2, 2)).toBe("solid");
    expect(overallMeasuredFromTopics([])).toBe("unknown");
    expect(startingLevelLabel("solid", 1, 3)).toMatch(/kısa test/i);
  });

  it("counts every verified backup question even when skill labels repeat", () => {
    const repeated: DiagnosticQuestion[] = [
      questions[0],
      { ...questions[0], text: "Başka bir tanım?" },
      { ...questions[1], skill: "definition" },
    ];
    const scored = scoreDiagnosticAnswers(repeated, {
      "0": "yarıçap yay",
      "1": "yarıçap yay",
      "2": "s=r/θ",
    }, plans);
    expect(scored.topicResults[0].measuredLevel).toBe("emerging");
    expect(scored.topicResults[0].evidence).toHaveLength(3);
  });
});
