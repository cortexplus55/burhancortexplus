import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractMisconceptions } from "@/lib/learning/teaching-standards";
import {
  dontKnowNote,
  gradeOralExam,
  isDontKnow,
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
  });
});
