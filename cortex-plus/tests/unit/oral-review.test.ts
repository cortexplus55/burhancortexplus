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
import { extractMisconceptions } from "@/lib/learning/teaching-standards";
import { isUnsupportedComparativeAbsolute } from "@/lib/learning/absolute-claims";

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
