import { describe, expect, it, vi } from "vitest";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import {
  auditLearnerLesson,
  exampleIsComplete,
  polishWorkedExample,
  repairLearnerLesson,
  scopeLessonToTopic,
  workedExampleNeedsFormula,
} from "@/lib/learning/lesson-repair";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const MOL = "Mol Kavramı";
const MOL_SOURCE = [
  "Mol kavramı, kütleyi tanecik sayısına bağlar.",
  "Mol kavramı n = m/M bağıntısıyla yazılır.",
  "m = 36 g. M = 18 g/mol. Sonuç 2 mol olur.",
].join(" ");

function molLesson(): LessonV2 {
  return {
    title: "Kimyasal Hesaplamaların Genel Özeti ve Formülleri",
    overview: "Mol kavramı, bir maddenin kütlesini tanecik sayısına bağlar.",
    sections: [
      {
        heading: "Mol kavramı",
        body: "Mol kavramı, kütleyi tanecik sayısına bağlar. Madde miktarı n = m/M bağıntısıyla yazılır.",
        check: {
          type: "mcq",
          prompt: "36 g su ve 18 g/mol mol kütlesi verildiğinde madde miktarı ____ olur.",
          options: ["2 mol", "54 mol", "0.5 mol", "18 mol"],
          answerIndex: 0,
          explanation:
            "Madde miktarı n = m/M ile bulunur. m = 36 g ve M = 18 g/mol ise n = 36/18 = 2 mol olur. Diğer seçenekler pay ve payda yer değiştirmiştir.",
        },
      },
      {
        heading: "Bu formüller, mol",
        body: "Bu formüller, mol hesabını öğretir ve kaynakta duran bağıntıyı kullanır.",
        check: {
          type: "trueFalse",
          prompt: "Bu formüller mol hesabını sağlar Bu ifade doğru mudur?",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Bu formüller mol hesabını sağlar.",
        },
      },
      {
        heading: "Kütle",
        body: "Kütle gram cinsinden ölçülür ve mol kütlesine bölününce madde miktarı bulunur.",
        check: {
          type: "mcq",
          prompt: "Mol kütlesi hangi büyüklüğü böler?",
          options: ["Kütleyi", "Hacmi", "Basıncı", "Sıcaklığı"],
          answerIndex: 0,
          explanation: "Madde miktarı, kütlenin mol kütlesine bölünmesiyle bulunur.",
        },
      },
    ],
    example: {
      prompt: "36 g maddenin mol kütlesi 18 g/mol ise madde miktarı nedir?",
      solution: "36/18 = 2 mol",
    },
    summary: [
      "Mol kavramı kütleyi tanecik sayısına bağlar.",
      "Madde miktarı n = m/M bağıntısıyla yazılır.",
      "Bu ifade doğrudur ve diğer seçenekler yanlıştır.",
    ],
  };
}

const CHARTER = "Magna Carta";
const CHARTER_SOURCE = [
  "Magna Carta 1215 yılında baronların baskısıyla ilan edildi.",
  "Magna Carta kralın keyfi tutuklama yetkisini sınırladı.",
  "Belge, vergi için baronların onayını şart koştu.",
].join(" ");

function charterLesson(): LessonV2 {
  return {
    title: "Orta Çağ Belgelerinin Uzun Tarihi ve Sonuçları",
    overview: "Magna Carta, kralın yetkisini yazılı kurallara bağlayan bir belgedir.",
    sections: [
      {
        heading: "Magna Carta",
        body: "Magna Carta 1215 yılında ilan edildi. Baronlar kralın keyfi tutuklama yetkisine karşı çıktı.",
        check: {
          type: "trueFalse",
          prompt: "Magna Carta kralın yetkisini sınırlayan bir belge midir?",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Belge, kralın keyfi tutuklama yetkisini sınırladı.",
        },
      },
      {
        heading: "Vergi",
        body: "Magna Carta, yeni vergi için baronların onayını şart koştu ve bunu yazılı hale getirdi.",
        check: {
          type: "mcq",
          prompt: "Yeni vergi için belge kimlerin onayını şart koşar?",
          options: ["Baronların", "Köylülerin", "Tüccar loncasının", "Papalık kurulunun"],
          answerIndex: 0,
          explanation: "Belge, vergi için baronların onayını şart koştu.",
        },
      },
      {
        heading: "Yıl",
        body: "Belge 1215 yılında ilan edildi ve sonraki krallar tarafından da hatırlandı.",
        check: {
          type: "mcq",
          prompt: "Belge hangi yılda ilan edildi?",
          options: ["1215", "1066", "1453", "1789"],
          answerIndex: 0,
          explanation: "Magna Carta 1215 yılında ilan edildi.",
        },
      },
    ],
    example: {
      prompt: "Baronlar bu belgeyle neyi sınırlamak istedi?",
      solution: "Baronlar kralın keyfi tutuklama yetkisini sınırlamak istedi.",
    },
    summary: [
      "Magna Carta 1215 yılında ilan edildi.",
      "Belge kralın keyfi tutuklama yetkisini sınırladı.",
      "Bu ifade doğrudur.",
    ],
  };
}

describe("non-physics lesson gates", () => {
  it("rewrites a mole calculation from the lesson formula and cleans the summary", async () => {
    expect(workedExampleNeedsFormula("36/18 = 2 mol")).toBe(true);
    expect(polishWorkedExample("36/18 = 2 mol", MOL_SOURCE)).toBe("n = m/M = 36 g / 18 g/mol = 2 mol");
    expect(exampleIsComplete("n = m/M = 36 g / 18 g/mol = 2 mol")).toBe(true);
    const verify = vi.fn(async () => ({ bad: [] }));
    const complete = vi.fn(async () => null);
    const result = await repairLearnerLesson(
      molLesson(),
      { source: MOL_SOURCE, topicLabel: MOL },
      complete,
      verify,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(result.lesson.title).toBe(MOL);
    expect(result.lesson.example?.solution).toMatch(/n = m\/M/);
    expect(result.lesson.example?.solution).toMatch(/36 g/);
    expect(result.lesson.example?.solution).toMatch(/2 mol/);
    expect(result.lesson.summary?.join(" ") ?? "").not.toMatch(/ifade doğrudur|diğer seçenek/i);
    expect(result.lesson.sections.map((section) => section.heading)).not.toContain("Bu formüller, mol");
    const retry = reviewQuestionFor(
      molLesson().sections[0].check! as SectionCheck & {
        type: "mcq" | "trueFalse";
        options: string[];
        answerIndex: number;
      },
      "tr",
    );
    expect(retry.prompt).not.toMatch(/36\/18|diğer seçenek/i);
    expect(retry.options[retry.answerIndex]).toBe("2 mol");
    expect(retry.options).not.toEqual(molLesson().sections[0].check?.options);
  });

  it("keeps a history lesson narrative and does not invent a numeric example", async () => {
    expect(summaryLineProblem("Bu ifade doğrudur.")).toBe("flashcard");
    const before = auditLearnerLesson(charterLesson(), { source: CHARTER_SOURCE, topicLabel: CHARTER });
    expect(before.map((issue) => issue.code)).not.toContain("example_incomplete");
    const verify = vi.fn(async () => ({ bad: [] }));
    const result = await repairLearnerLesson(
      charterLesson(),
      { source: CHARTER_SOURCE, topicLabel: CHARTER },
      async () => null,
      verify,
    );
    expect(verify).toHaveBeenCalledTimes(1);
    const lesson = result.lesson;
    expect(lesson.title).toBe(CHARTER);
    expect(lesson.example?.solution).toMatch(/keyfi tutuklama/);
    expect(lesson.example?.solution ?? "").not.toMatch(/\d+\s*(kJ|mol|g)\b/);
    expect(JSON.stringify(lesson)).not.toMatch(/=\s*\d+/);
    expect(lesson.summary?.join(" ") ?? "").not.toMatch(/ifade doğrudur/i);
    const scoped = scopeLessonToTopic(charterLesson(), CHARTER_SOURCE, CHARTER);
    expect(scoped.title).toBe(CHARTER);
    expect(scoped.example?.solution).toMatch(/tutuklama/);
    const retry = reviewQuestionFor(
      charterLesson().sections[0].check! as SectionCheck & {
        type: "mcq" | "trueFalse";
        options: string[];
        answerIndex: number;
      },
      "tr",
    );
    expect(retry.prompt).not.toBe(charterLesson().sections[0].check?.prompt);
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
  });
});
