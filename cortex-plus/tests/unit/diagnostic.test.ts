import { describe, expect, it } from "vitest";
import {
  attachQuestionMeta,
  buildDiagnosticSkillPlan,
  measuredLevelFromAccuracy,
  overallMeasuredFromTopics,
  planDiagnosticTopics,
  pickMainTopics,
  scoreDiagnosticAnswers,
  startingLevelLabel,
  type DiagnosticQuestion,
  type DiagnosticTopicPlan,
} from "@/lib/learning/diagnostic";

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
  it("prefers parentless nodes as main topics", () => {
    const mains = pickMainTopics([
      { id: "1", parentId: null },
      { id: "2", parentId: "1" },
      { id: "3", parentId: null },
    ]);
    expect(mains.map((m) => m.id)).toEqual(["1", "3"]);
  });

  it("samples one skill slot per measurable topic and cycles skills", () => {
    const plans: DiagnosticTopicPlan[] = [
      {
        id: "1",
        title: "A",
        examPrepTopicId: null,
        pageNumbers: [1],
        status: "unmeasured",
      },
      {
        id: "2",
        title: "B",
        examPrepTopicId: null,
        pageNumbers: [2],
        status: "unreadable",
        reason: "x",
      },
      {
        id: "3",
        title: "C",
        examPrepTopicId: null,
        pageNumbers: [3],
        status: "unmeasured",
      },
    ];
    const slots = buildDiagnosticSkillPlan(plans);
    expect(slots).toHaveLength(2);
    expect(slots[0].skill).toBe("definition");
    expect(slots[1].skill).toBe("concept");
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

  it("attachQuestionMeta aligns slots to questions", () => {
    const slots = buildDiagnosticSkillPlan(plans.filter((p) => p.status !== "unreadable"));
    const attached = attachQuestionMeta(
      [
        {
          text: "q1",
          options: ["a", "b"],
          correct: ["a"],
          multi: false,
        },
      ],
      slots,
    );
    expect(attached[0].topicId).toBe("t1");
    expect(attached[0].skill).toBe("definition");
  });
});
