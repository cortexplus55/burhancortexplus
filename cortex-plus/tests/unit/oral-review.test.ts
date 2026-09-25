import { describe, expect, it } from "vitest";
import {
  answerCoversExpectedPoints,
  displaySolution,
  isPromptEcho,
  oralPercentScore,
  reconcileOralGrade,
  sanitizeGap,
  verifyOralPrompt,
} from "@/lib/learning/oral-review";
import {
  explanationConflictsWithCorrect,
  optionReasonIssues,
  validateOralPedagogy,
  validateQuizPedagogy,
  extractMisconceptions,
} from "@/lib/learning/teaching-standards";
import { isUnsupportedComparativeAbsolute } from "@/lib/learning/absolute-claims";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

describe("verifyOralPrompt", () => {
  it("rejects single-substance limiting-reagent prompts (chemistry)", () => {
    expect(
      verifyOralPrompt("CO₂ tepkimesinde sınırlayıcı bileşeni nasıl belirlersiniz?"),
    ).not.toEqual([]);
  });

  it("accepts two-side force comparison (physics)", () => {
    expect(
      verifyOralPrompt(
        "İki kuvvetten hangisi baskın olur: 12 N sağa ve 8 N sola?",
      ),
    ).toEqual([]);
  });

  it("accepts equation-based limiting prompt", () => {
    expect(
      verifyOralPrompt("H₂ + O₂ → H₂O tepkimesinde sınırlayıcı reaktanı nasıl bulursunuz?"),
    ).toEqual([]);
  });

  it("accepts two historical sides (history)", () => {
    expect(
      verifyOralPrompt(
        "Osmanlı ile Rusya arasındaki savaşta hangisi tükenmeye daha yakındır: asker sayısı mı, ikmal mi?",
      ),
    ).toEqual([]);
  });
});

describe("prompt echo and solution display", () => {
  it("detects clipped prompt as echo", () => {
    const prompt = "1 mol H₂O kaç gramdır?";
    expect(isPromptEcho("mol H₂O kaç gramdır?", prompt)).toBe(true);
    expect(displaySolution("mol H₂O kaç gramdır?", prompt)).toBeNull();
  });

  it("keeps a real solution for a physics prompt", () => {
    const prompt = "I = 2 A ve R = 4 Ω iken güç kaç wattır?";
    expect(displaySolution("P = I² R = 4 × 4 = 16 W", prompt)).toContain("16 W");
  });

  it("sanitizeGap drops verified-solution excuses and prompt copies", () => {
    const prompt = "CO₂ tepkimesinde sınırlayıcı bileşeni nasıl belirlersiniz?";
    expect(
      sanitizeGap(
        "Kaynakta bu soru için doğrulanmış bir çözüm cümlesi yok. Hatanız şuradaydı: " +
          prompt,
        prompt,
      ),
    ).toBeNull();
    expect(sanitizeGap("Mol oranını katsayıya bölmeyi unuttun.", prompt)).toContain(
      "Mol oranını",
    );
  });
});

describe("reconcileOralGrade", () => {
  it("credits a rubric-matching answer even when the model scores 0", () => {
    const questions = [
      {
        prompt: "H₂ + Cl₂ → 2 HCl tepkimesinde sınırlayıcıyı nasıl bulursunuz?",
        expectedPoints: [
          "Denklemi denkleştir",
          "Mol sayısını katsayıya böl",
          "En küçük oran sınırlayıcıdır",
        ],
      },
      {
        prompt: "Birim çemberde cos 0° nedir?",
        expectedPoints: ["1", "x koordinatı"],
      },
      {
        prompt: "Tanzimat fermanı hangi yılda ilan edildi?",
        expectedPoints: ["1839"],
      },
    ];
    const goodAnswer =
      "Önce denklemi denkleştiririm; her reaktanın mol sayısını katsayısına bölerim; oranı en küçük olan sınırlayıcıdır, tamamen tükenir ve ürün miktarını belirler.";
    const reconciled = reconcileOralGrade({
      questions,
      answers: {
        "0": goodAnswer,
        "1": "1",
        "2": "yanlış yıl",
      },
      modelItems: [
        {
          index: 0,
          correct: false,
          gap: "Kaynakta bu soru için doğrulanmış bir çözüm cümlesi yok. Hatanız şuradaydı: " +
            questions[0].prompt,
        },
        { index: 1, correct: true, gap: null },
        { index: 2, correct: false, gap: questions[2].prompt },
      ],
      modelCorrectCount: 0,
    });
    expect(reconciled.correctIndices).toContain(0);
    expect(reconciled.correctIndices).toContain(1);
    expect(reconciled.correctIndices).not.toContain(2);
    expect(reconciled.items.find((i) => i.index === 0)?.gap).toBeNull();
    expect(reconciled.items.find((i) => i.index === 2)?.gap).toBeNull();
    expect(oralPercentScore(reconciled.correctCount, reconciled.total)).toBe(
      Math.round((2 / 3) * 100),
    );
  });

  it("does not treat unsupported absolute claims as covering the rubric", () => {
    expect(
      answerCoversExpectedPoints("Yalnızca bir sınırlayıcı olabilir.", [
        "Mol oranını katsayıya böl",
      ]),
    ).toBe(false);
    expect(isUnsupportedComparativeAbsolute("Hepsi birlikte tükenir, artan madde yok.")).toBe(
      true,
    );
  });
});

describe("oral misconceptions omit prompt-as-claim", () => {
  it("skips gaps that are only the question text", () => {
    const drafts = extractMisconceptions({
      kind: "oral",
      topicLabel: "Kimya",
      answers: { "0": "bilmiyorum" },
      payload: {
        type: "oral",
        questions: [
          {
            prompt: "H₂ + O₂ tepkimesinde sınırlayıcıyı anlat.",
            expectedPoints: ["mol / katsayı"],
          },
        ],
        gradeMeta: {
          correctIndices: [],
          items: [
            {
              index: 0,
              correct: false,
              gap: "H₂ + O₂ tepkimesinde sınırlayıcıyı anlat.",
            },
          ],
        },
      },
    });
    expect(drafts).toEqual([]);
  });
});

describe("quiz explanation arithmetic vs correct option", () => {
  const q = (
    text: string,
    options: string[],
    correct: string[],
    explanation: string,
    optionReasons?: Record<string, string>,
  ): QuizQuestion => ({
    text,
    options,
    correct,
    multi: false,
    explanation,
    optionReasons,
  });

  it("rejects explanation that claims 24 g when correct is 48 g (chemistry)", () => {
    const question = q(
      "1 mol KClO₃ kaç gram O₂ üretir?",
      ["32 g", "48 g", "16 g", "64 g"],
      ["48 g"],
      "1,5 mol = 24g oksijen çıkar.",
    );
    expect(explanationConflictsWithCorrect(question)).toMatch(/24/);
    expect(
      validateQuizPedagogy([question, question]).some((i) => i.includes("24") || i.includes("Açıklama")),
    ).toBe(true);
  });

  it("accepts consistent physics explanation", () => {
    const question = q(
      "I = 2 A, R = 4 Ω iken güç?",
      ["4 W", "8 W", "16 W", "2 W"],
      ["16 W"],
      "P = I² R = 4 × 4 = 16 W. 8 W, I×R ile karıştırmaktır.",
      {
        "4 W": "Yalnızca I² almak 4 verir.",
        "8 W": "I×R = 8 W yanlış formüldür.",
        "2 W": "Yalnızca akımı yazmak 2 verir.",
      },
    );
    expect(explanationConflictsWithCorrect(question)).toBeNull();
    expect(optionReasonIssues(question)).toEqual([]);
  });

  it("rejects duplicated distractor reason templates (history)", () => {
    const question = q(
      "Tanzimat fermanı hangi yılda ilan edildi?",
      ["1839", "1923", "1453", "1908"],
      ["1839"],
      "Ferman 1839'da okundu; 1923 Cumhuriyetin ilanıdır.",
      {
        "1923": "1923 bu sorunun cevabı değil; tuzak: yıl karıştırmak.",
        "1453": "1453 bu sorunun cevabı değil; tuzak: yıl karıştırmak.",
        "1908": "1908 bu sorunun cevabı değil; tuzak: yıl karıştırmak.",
      },
    );
    expect(
      optionReasonIssues(question).some((i) => i.includes("şablon") || i.includes("tekrar")),
    ).toBe(true);
  });
});

describe("validateOralPedagogy uses verifyOralPrompt", () => {
  it("flags comparative single-substance prompts", () => {
    expect(
      validateOralPedagogy([
        {
          prompt: "CO₂ tepkimesinde sınırlayıcı bileşeni nasıl belirlersiniz?",
          rubricCriteria: ["Yöntem"],
          expectedPoints: ["mol / katsayı"],
        },
      ]).some((i) => i.includes("iki taraf") || i.includes("denklem")),
    ).toBe(true);
  });
});
