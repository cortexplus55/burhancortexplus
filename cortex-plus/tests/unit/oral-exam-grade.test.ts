import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractMisconceptions } from "@/lib/learning/teaching-standards";
import {
  dontKnowNote,
  gradeOralExam,
  isDontKnow,
  oralReviewItemFromGrade,
  presentOralReview,
  syllabusWeightLine,
  visibleProbe,
} from "@/lib/learning/oral-exam";
import { studyNodeAria, studyNodeOpenable } from "@/lib/learning/study-tools";

const chemistrySource = "Sınırlayıcı bileşen bulunur: mol sayısı stokiyometrik katsayıya bölünür. Verim %80.";
const lawSource = "Borçlar hukukunda irade sakatlığı hata, hile ve ikrahtır. İrade fesadı sözleşmeyi sakatlar.";

describe("oral exam grading is grounded for every subject", () => {
  it("scores a chemistry answer against the material and cites the file", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Sınırlayıcı bileşen nasıl bulunur?",
          learningObjective: "Sınırlayıcı bileşen",
          expectedPoints: ["mol sayısı stokiyometrik katsayıya bölünür"],
          sourceFile: "kimya-notu.pdf",
          sourcePage: "s.12",
        },
      ],
      { "0": "Mol sayısı stokiyometrik katsayıya bölünür." },
      chemistrySource,
    );
    expect(report.pct).toBe(100);
    expect(report.fullCount).toBe(1);
    expect(report.items[0]?.citation).toBe("kimya-notu.pdf · s.12");
    expect(report.items[0]?.missing).toEqual([]);
    expect(report.strengths).toContain("Sınırlayıcı bileşen");
    expect(report.items[0]?.modelAnswer).toContain("katsayıya");
  });

  it("uses the same rules for a law prep", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "İrade sakatlığı halleri nelerdir?",
          learningObjective: "İrade sakatlığı",
          expectedPoints: ["hata, hile ve ikrah"],
          sourceFile: "borclar.pdf",
          sourcePage: "s.3",
        },
      ],
      { "0": "Hata, hile ve ikrah irade sakatlığıdır." },
      lawSource,
    );
    expect(report.pct).toBe(100);
    expect(report.items[0]?.citation).toBe("borclar.pdf · s.3");
    expect(report.weaknesses).toEqual([]);
  });

  it("records bilmiyorum as a blank miss and does not invent a number", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Yüzde verim kaçtır?",
          learningObjective: "Yüzde verim",
          expectedPoints: ["verim %80"],
          sourceFile: "kimya-notu.pdf",
          sourcePage: "s.12",
        },
      ],
      { "0": "Bilmiyorum" },
      chemistrySource,
    );
    expect(isDontKnow("Bilmiyorum")).toBe(true);
    expect(report.pct).toBe(0);
    expect(report.items[0]?.dontKnow).toBe(true);
    expect(report.items[0]?.missing).toEqual(["verim %80"]);
    expect(report.items[0]?.modelAnswer).toContain("%80");
    expect(report.items[0]?.modelAnswer).not.toContain("%90");
    expect(dontKnowNote()).toMatch(/Bilmediğini kaydettim/);
  });

  it("caps a numeric answer that is not in the material", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Yüzde verim kaçtır?",
          learningObjective: "Yüzde verim",
          expectedPoints: ["verim %80"],
          sourceFile: "kimya-notu.pdf",
          sourcePage: "s.12",
        },
      ],
      { "0": "Verim %90 olur." },
      chemistrySource,
    );
    expect(report.items[0]?.numericIssue).toMatch(/90/);
    expect(report.items[0]?.ratio).toBeLessThan(1);
    expect(report.weaknesses.length + report.strengths.length).toBeGreaterThan(0);
  });

  it("drops an expected point whose number is not in the source", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Verim nedir?",
          expectedPoints: ["verim %80", "kaynakta olmayan %41"],
          sourceFile: "kimya-notu.pdf",
          sourcePage: "s.1",
        },
      ],
      { "0": "" },
      chemistrySource,
    );
    expect(report.items[0]?.modelAnswer).toContain("%80");
    expect(report.items[0]?.modelAnswer).not.toContain("%41");
  });

  it("repairs a model equation and rejects a wrong arithmetic claim", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "İki ile ikiyi topla.",
          learningObjective: "Toplama",
          expectedPoints: ["2 + 2 = 5", "mol katsayı oranına bakılarak bulunur"],
        },
      ],
      { "0": "2 + 2 = 5 ve mol katsayı oranına bakılarak bulunur." },
      "Toplam 2 + 2 = 4. Mol sayısı stokiyometrik katsayıya bölünür.",
    );
    expect(report.items[0]?.modelAnswer).toContain("2 + 2 = 4");
    expect(report.items[0]?.modelAnswer).not.toContain("= 5");
    expect(report.items[0]?.ratio).toBe(0);
    expect(report.items[0]?.numericIssue).toMatch(/5|hesap/i);
  });

  it("cites the corpus passage when the question has no stamped file", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "İrade sakatlığı halleri nelerdir?",
          expectedPoints: ["hata, hile ve ikrah"],
        },
      ],
      { "0": "Hata, hile ve ikrah." },
      lawSource,
      [
        {
          documentName: "anayasa.pptx",
          pageNumber: 2,
          slide: true,
          content: "Yasama organı meclistir.",
        },
        {
          documentName: "borclar.pdf",
          pageNumber: 9,
          content: "İrade sakatlığı hata, hile ve ikrahtır.",
        },
      ],
    );
    expect(report.items[0]?.citation).toBe("borclar.pdf · s.9");
  });

  it("asks one follow-up and hides the hint unless the teacher is helpful", () => {
    const partial = visibleProbe({
      answer: "18",
      probeKind: "unit",
      persona: "strict",
      alreadyProbed: false,
      hint: "Mol kütlesini düşün.",
    });
    expect(partial?.question).toBe("Birimi ne?");
    expect(partial?.hint).toBeNull();
    const helped = visibleProbe({
      answer: "18",
      probeKind: "unit",
      persona: "helpful",
      alreadyProbed: false,
      hint: "Mol kütlesini düşün.",
    });
    expect(helped?.hint).toBe("Mol kütlesini düşün.");
    expect(
      visibleProbe({
        answer: "18 gram",
        probeKind: "unit",
        persona: "helpful",
        alreadyProbed: true,
        hint: "Mol kütlesini düşün.",
      }),
    ).toBeNull();
    expect(
      visibleProbe({
        answer: "Bilmiyorum",
        probeKind: "why",
        persona: "harsh",
        alreadyProbed: false,
      }),
    ).toBeNull();
  });

  it("weights the syllabus without dropping a less important topic", () => {
    const chemistry = syllabusWeightLine([
      { title: "Stokiyometri", emphasis: "core" },
      { title: "Gazlar", emphasis: "skim" },
    ]);
    const law = syllabusWeightLine([
      { title: "Borçlar Hukuku", emphasis: "core" },
      { title: "Anayasa", emphasis: "support" },
    ]);
    expect(chemistry.indexOf("Stokiyometri")).toBeLessThan(chemistry.indexOf("Gazlar"));
    expect(chemistry).toMatch(/eleme/);
    expect(chemistry).toMatch(/olmayan konu/);
    expect(law).toContain("Borçlar Hukuku");
    expect(law).toContain("Anayasa");
  });

  it("gives full marks to a correct typed calculation and never prints a score label", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "88 gram karbondioksit kaç moldür?",
          learningObjective: "Mol hesabı",
          expectedPoints: ["Tam 2"],
          sourceFile: "foto-1.jpg",
          sourcePage: "s.1",
        },
        {
          prompt: "1 mol su kaç gramdır?",
          expectedPoints: ["Tam 2", "2 puan"],
        },
      ],
      {
        "0": "n = m/M = 88 g / 44 g·mol⁻¹ = 2 mol CO₂",
        "1": "M = 2×1 + 16 = 18 g/mol, yani 1 mol H₂O 18 g",
      },
      "Mol kütlesi CO₂ için 44 g/mol, H₂O için 18 g/mol.",
    );
    expect(report.pct).toBe(100);
    expect(report.fullCount).toBe(2);
    expect(report.items.every((item) => item.verdict === "dogru")).toBe(true);
    for (const item of report.items) {
      const review = oralReviewItemFromGrade(item);
      expect(review.solution).not.toMatch(/Tam 2/);
      expect(review.solution.length).toBeGreaterThan(8);
      expect(review.missing ?? "").not.toMatch(/Tam 2/);
    }
  });

  it("explains a wrong arithmetic answer instead of repeating a rubric label", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Dört artı bir kaç eder?",
          learningObjective: "Toplama",
          expectedPoints: ["Tam 2"],
        },
      ],
      { "0": "4 + 1 = 6" },
      "Toplama işlemi kaynakta anlatılır.",
    );
    const item = report.items[0];
    expect(item?.ratio).toBe(0);
    expect(item?.verdict).toBe("yanlis");
    expect(item?.gap || item?.modelAnswer || item?.numericIssue).toMatch(/6|5/);
    const review = oralReviewItemFromGrade(item!);
    expect(review.solution).not.toMatch(/Tam 2/);
    expect(review.solution).toMatch(/5|hesap|6/);
  });

  it("does not render a garbled review string", () => {
    const shown = presentOralReview({
      question: "Soru 2",
      answer: "88 g / 44 = 2",
      solution: "Tam 2 Hatanız şuradaydı: Tam 2",
      missing: "Tam 2",
      citation: "foto-1.jpg · s.1",
      scoreLabel: "%0 puan",
    });
    expect(shown.solution).toBe("Bu cevap için ayrıntılı inceleme kurulamadı.");
    expect(shown.solution).not.toMatch(/Tam 2/);
    expect(shown.missing).toBeUndefined();
    expect(shown.citation).toBeNull();
  });

  it("asks the helpful teacher once when the answer skips the step", () => {
    const hedge = visibleProbe({
      answer: "Mol oranını ayrıca hesaplamadım; bu adımı boş bıraktım ve sonra döneceğim.",
      question: "Hangisi sınırlayıcı bileşendir?",
      probeKind: "detail",
      persona: "helpful",
      alreadyProbed: false,
      hint: "Katsayıya böl.",
    });
    expect(hedge?.question).toBe("Eksik kalan adımı da yazar mısın?");
    expect(hedge?.hint).toBe("Katsayıya böl.");
    const complete = visibleProbe({
      answer: "n = m/M = 88 g / 44 g·mol⁻¹ = 2 mol CO₂",
      question: "88 gram karbondioksit kaç moldür?",
      probeKind: "detail",
      persona: "helpful",
      alreadyProbed: false,
      hint: "Mol kütlesi 44.",
    });
    expect(complete).toBeNull();
    expect(
      visibleProbe({
        answer: "Mol oranını ayrıca hesaplamadım",
        question: "Hangisi sınırlayıcı bileşendir?",
        probeKind: "detail",
        persona: "strict",
        alreadyProbed: false,
        hint: "Katsayıya böl.",
      })?.hint,
    ).toBeNull();
  });

  it("files only a real miss under the topic that was tested", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "88 gram karbondioksit kaç moldür?",
          expectedPoints: ["Tam 2"],
        },
        {
          prompt: "İrade sakatlığı halleri nelerdir?",
          learningObjective: "İrade sakatlığı",
          expectedPoints: ["hata, hile ve ikrah"],
        },
      ],
      {
        "0": "n = m/M = 88 g / 44 g·mol⁻¹ = 2 mol CO₂",
        "1": "Yalnızca hata.",
      },
      `${chemistrySource}\n${lawSource}`,
    );
    const drafts = extractMisconceptions({
      kind: "oral",
      topicLabel: "Mol kavramı ve Avogadro sayısı",
      payload: {
        type: "oral",
        testedTopic: "Stokiyometri: sınırlayıcı bileşen ve verim",
        questions: [
          { prompt: "88 gram karbondioksit kaç moldür?", expectedPoints: ["Tam 2"] },
          {
            prompt: "İrade sakatlığı halleri nelerdir?",
            expectedPoints: ["hata, hile ve ikrah"],
          },
        ],
        gradeMeta: report,
      },
      answers: {
        "0": "n = m/M = 88 g / 44 g·mol⁻¹ = 2 mol CO₂",
        "1": "Yalnızca hata.",
      },
    });
    expect(drafts.some((draft) => draft.claim.includes("88"))).toBe(false);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.topicLabel).toBe("Stokiyometri: sınırlayıcı bileşen ve verim");
    expect(drafts[0]?.wrongType).toBe("oral_miss");
  });

  it("writes a misconception draft the review queue can store", () => {
    const drafts = extractMisconceptions({
      kind: "oral",
      topicLabel: "İrade sakatlığı",
      payload: {
        type: "oral",
        questions: [
          {
            prompt: "İrade sakatlığı halleri nelerdir?",
            learningObjective: "İrade sakatlığı",
            expectedPoints: ["hata, hile ve ikrah"],
          },
        ],
      },
      answers: { "0": "Yalnızca hata." },
    });
    expect(drafts[0]?.sourceKind).toBe("oral");
    expect(drafts[0]?.wrongType).toBe("oral_miss");
    expect(drafts[0]?.corrected).toMatch(/hile/);
    expect(drafts[0]?.topicLabel).toBe("İrade sakatlığı");
  });
});

describe("study path lock is a recommendation", () => {
  it("opens a locked node and does not call it kilitli", () => {
    expect(studyNodeOpenable("locked")).toBe(true);
    expect(studyNodeOpenable("ready")).toBe(true);
    expect(studyNodeOpenable("done")).toBe(true);
    expect(studyNodeOpenable("hidden")).toBe(false);
    expect(studyNodeAria("locked")).toBe("önerilen sırada");
    expect(studyNodeAria("locked")).not.toContain("kilitli");
  });

  it("keeps the page and the node route on the same openable check", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(page).toContain("studyNodeOpenable");
    expect(page).not.toContain('node.status === "locked"');
    expect(route).toContain("studyNodeOpenable");
    expect(route).not.toContain('node.status === "locked"');
    expect(route).toContain("gradeOralExam");
    expect(route).toContain("loadPrepChatGrounding");
    expect(route).toContain("rememberMisconceptions");
    expect(route).not.toContain("needsQuantModelCheck");
  });
});
