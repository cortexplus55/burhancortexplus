import { describe, expect, it } from "vitest";
import {
  coverageRemaining,
  mergeCoverage,
  prepDocumentIds,
  priorityForTopic,
  schedulePriorityForTopic,
} from "@/lib/learning/exam-coverage";
import {
  coverageChecklist,
  lessonDepth,
  parseTeacherAnalysis,
  teacherBriefForTopic,
  type TeacherAnalysis,
} from "@/lib/learning/teacher-brain";
import {
  isClearlyOffDocument,
  paidChatAttempts,
  presentOutsideMaterialAnswer,
  verifyDocumentAnswer,
} from "@/lib/ai/document-answer-verification";

const analysis = parseTeacherAnalysis({
  language: "tr",
  summary: "Belge birinci yasayı anlatır, Carnot yoktur.",
  objectives: [{ statement: "Öğrenci birinci yasayı yazar.", pageNumbers: [2] }],
  examFocus: {
    questionTypes: ["hesap"],
    keyFormulas: [{ expression: "ΔU = Q − W", meaning: "birinci yasa", pageNumbers: [2] }],
    keyDefinitions: [
      { term: "iç enerji", definition: "Sistemin enerji deposudur.", pageNumbers: [2] },
    ],
  },
  misconceptions: [
    {
      mistake: "Isı ve iş aynı şey sanılır.",
      correction: "Isı geçiş, iş sınır hareketidir.",
      pageNumbers: [2],
    },
  ],
  topics: [
    {
      title: "Birinci Yasa",
      emphasis: "core",
      prerequisites: [],
      pageNumbers: [2],
      strategy: {
        examples: ["Kapalı sistemde ΔU = Q − W"],
        analogies: [],
        mnemonics: [],
        workedExamplePlan: "Önce Q, sonra W.",
        checkQuestions: ["W işareti neye göre seçilir?"],
      },
    },
    {
      title: "Birim dönüşümü",
      emphasis: "skim",
      prerequisites: [],
      pageNumbers: [8],
      strategy: {
        examples: ["kPa ile Pa"],
        analogies: [],
        mnemonics: [],
        workedExamplePlan: "",
        checkQuestions: ["1 kPa kaç Pa?"],
      },
    },
  ],
}) as TeacherAnalysis;

describe("sınav kapsamı", () => {
  it("formül, tuzak ve az önemli konuyu listeden düşürmez", () => {
    const items = coverageChecklist(analysis, "doc-1");
    expect(items.some((item) => item.kind === "formula" && item.label.includes("ΔU"))).toBe(true);
    expect(items.some((item) => item.kind === "trap" && item.label.includes("Isı ve iş"))).toBe(true);
    expect(items.some((item) => item.topicTitle === "Birim dönüşümü" && item.priority === "less")).toBe(true);
    expect(items.some((item) => item.priority === "important")).toBe(true);
  });

  it("ders notuna kapsam listesini yazar", () => {
    const brief = teacherBriefForTopic(analysis, "Birinci Yasa");
    expect(brief).toContain("Kapsam listesi");
    expect(brief).toContain("ΔU = Q − W");
    expect(brief).toContain("Isı ve iş");
    expect(brief).not.toContain("kPa ile Pa");
  });

  it("iki belgenin maddelerini birlikte tutar", () => {
    const second = parseTeacherAnalysis({
      ...analysis,
      topics: [
        {
          ...analysis.topics[0],
          title: "İkinci Yasa",
          emphasis: "support",
          pageNumbers: [4],
        },
      ],
    }) as TeacherAnalysis;
    const items = mergeCoverage([
      { documentId: "a", analysis },
      { documentId: "b", analysis: second },
    ]);
    expect(items.some((item) => item.documentId === "a" && item.topicTitle === "Birinci Yasa")).toBe(true);
    expect(items.some((item) => item.documentId === "b" && item.topicTitle === "İkinci Yasa")).toBe(true);
    expect(prepDocumentIds({ document_id: "a", source_document_ids: ["b", "a"] })).toEqual(["a", "b"]);
  });

  it("işlenen konunun maddesini kalanlardan çıkarır", () => {
    const items = coverageChecklist(analysis);
    const status = coverageRemaining(items, ["Birinci Yasa"]);
    expect(status.taught).toBeGreaterThan(0);
    expect(status.remaining.some((item) => item.topicTitle === "Birinci Yasa")).toBe(false);
    expect(status.remaining.some((item) => item.topicTitle === "Birim dönüşümü")).toBe(true);
  });

  it("önceliği sıraya ve ders derinliğine bağlar", () => {
    const groups = [{ documentId: "a", analysis }];
    expect(priorityForTopic(groups, "Birinci Yasa")).toBe("important");
    expect(schedulePriorityForTopic(groups, "Birim dönüşümü")).toBe(5);
    expect(lessonDepth("important").maxDraftAttempts).toBe(2);
    expect(lessonDepth("less").maxDraftAttempts).toBe(1);
    expect(lessonDepth("less").quizItems).toBeLessThan(lessonDepth("important").quizItems);
    expect(lessonDepth(null).maxDraftAttempts).toBe(2);
  });
});

describe("materyal dışı sohbet", () => {
  const source = "Birinci yasa: ΔU = Q − W. İç enerji sistemin deposudur.";

  it("belgede olmayan soruyu işaretler ve ikinci denemeyi keser", () => {
    expect(isClearlyOffDocument("Carnot çevriminin verimi neden 1 olamaz? Belgede var mı?", source)).toBe(true);
    expect(isClearlyOffDocument("Birinci yasa nedir?", source)).toBe(false);
    expect(paidChatAttempts(true)).toBe(1);
    expect(paidChatAttempts(false)).toBe(2);
    const labeled = presentOutsideMaterialAnswer({
      question: "Carnot çevriminin verimi neden 1 olamaz?",
      answer: "Verim 1 olamaz çünkü çevreye ısı atılır.",
      sourceText: source,
    });
    expect(labeled).toContain("Materyal dışı:");
    expect(labeled).toContain("Bu, belgede yok.");
  });

  it("işaretli genel bilgiyi kaynak alıntısı istemeden kabul eder", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "Carnot verimi neden 1 olamaz?",
      answer: "Bu, belgede yok.\n\nMateryal dışı: Verim 1 olamaz çünkü soğuk kaynağa ısı atılır.",
      evidence: [{ reference: 1, documentId: "d", documentName: "a.pdf", pageNumber: 1, chunkId: null, content: source }],
      strict: false,
    });
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("genel bilgi bölümündeki belge atıfını reddeder", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "Carnot",
      answer: "Materyal dışı: Belgede Carnot verimi 1-T2/T1 diye yazıyor [1].",
      evidence: [{ reference: 1, documentId: "d", documentName: "a.pdf", pageNumber: 1, chunkId: null, content: source }],
      strict: false,
    });
    expect(result.ok).toBe(false);
  });

  it("etiketsiz karışık cevabı düşürür", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "Carnot",
      answer: "Verim birdir ve belgede de böyledir.",
      evidence: [{ reference: 1, documentId: "d", documentName: "a.pdf", pageNumber: 1, chunkId: null, content: source }],
      strict: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("mixed_mode_missing_sections");
  });

  it("katı kipte işaretli genel bilgiyi belge kanıtı saymaz", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "Carnot",
      answer: "Materyal dışı: Verim 1 olamaz çünkü ısı atılır.",
      evidence: [],
      strict: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("no_evidence");
  });
});
