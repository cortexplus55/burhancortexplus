// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyChoiceSolver, settleSteps, verifyChoiceQuestion } from "@/lib/learning/question-verifier";
import {
  normalizeQuizQuestion,
  normalizeSteps,
  parseQuizQuestions,
  publicQuizQuestion,
  sealedQuizQuestion,
} from "@/lib/learning/exam-quiz";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";

afterEach(cleanup);

function why(options: string[], correct: string[]): string[] {
  return options.map((option, index) =>
    correct.includes(option)
      ? `${option} doğru seçenektir; kaynakla uyumludur.`
      : `${option} yanlıştır; tuzak: ${["oran", "birim", "ürün", "yıl"][index % 4]} karıştırmak.`,
  );
}

describe("çözüm adımları kapısı", () => {
  // Canlıdaki bir kimya sorusunun açıklaması bu hesabı tek cümleye sıkıştırıyordu.
  const methane = [
    "n(CH₄) = 8 / 16 = 0,5 mol",
    "Denkleme göre 1 mol CH₄ için 2 mol O₂ gerekir; 0,5 mol CH₄ için 1 mol O₂",
    "1 mol O₂ = 32 g",
  ];

  it("keeps steps whose arithmetic holds and that end at the correct option", () => {
    expect(settleSteps(methane, ["32 g"])).toEqual(methane);
  });

  it("drops the whole list when one step's arithmetic is wrong", () => {
    expect(settleSteps(["n(CH₄) = 8 / 16 = 2 mol", ...methane.slice(1)], ["32 g"])).toBeUndefined();
  });

  it("drops steps that arrive at a different answer than the key", () => {
    expect(settleSteps([...methane.slice(0, 2), "1 mol O₂ = 16 g"], ["32 g"])).toBeUndefined();
  });

  it("needs at least two steps", () => {
    expect(settleSteps(["1 mol O₂ = 32 g"], ["32 g"])).toBeUndefined();
    expect(settleSteps(undefined, ["32 g"])).toBeUndefined();
  });

  it("strips numbering the model adds (the list is already numbered) and caps at five", () => {
    expect(normalizeSteps(["1) İlk adım", "Adım 2: İkinci adım", "3. Üçüncü"])).toEqual([
      "İlk adım",
      "İkinci adım",
      "Üçüncü",
    ]);
    expect(normalizeSteps(Array.from({ length: 7 }, (_, i) => `adım metni ${i}`))).toHaveLength(5);
    expect(normalizeSteps("tek metin")).toBeUndefined();
  });

  it("carries steps through verification for a kept question", () => {
    const options = ["2H₂ + O₂ → 2H₂O", "CaCO₃ → CaO + CO₂", "NaCl → Na + Cl", "Zn + 2HCl → ZnCl₂ + H₂"];
    const checked = verifyChoiceQuestion({
      text: "Aşağıdaki tepkimelerden hangisi hem yanma hem sentez tepkimesidir?",
      options,
      correct: ["2H₂ + O₂ → 2H₂O"],
      multi: false,
      explanation: "Hidrojenin oksijenle birleşmesi hem yanma hem sentezdir.",
      optionWhy: why(options, ["2H₂ + O₂ → 2H₂O"]),
      steps: ["Yanma, bir maddenin oksijenle tepkimesidir", "Sentez, iki maddeden tek ürün oluşmasıdır; 2H₂O tek üründür"],
      needsSolver: false,
    });
    expect(checked.status).toBe("keep");
    expect(checked.question.steps).toHaveLength(2);
  });

  it("drops the generator's steps when the solver picks a different answer", () => {
    const options = ["Ribozom", "Mitokondri", "Golgi cisimciği", "Lizozom"];
    const base = {
      text: "Hücrede protein sentezinin gerçekleştiği organel hangisidir?",
      options,
      multi: false,
      explanation: "Protein sentezi mitokondride olur.",
      optionWhy: why(options, ["Mitokondri"]),
      steps: ["Protein sentezi enerji ister", "Enerjiyi mitokondri üretir, sentez orada olur"],
      needsSolver: true,
    };
    const solverSays = (answer: string) =>
      JSON.stringify({ items: [{ index: 0, answer, reason: `${answer} protein sentezinin yapıldığı organeldir.` }] });

    const switched = applyChoiceSolver([{ ...base, correct: ["Mitokondri"] }], solverSays("Ribozom"));
    expect(switched?.[0]?.correct).toEqual(["Ribozom"]);
    expect(switched?.[0]?.steps).toBeUndefined();
  });
});

describe("adımlar öğrenciye ulaşıyor", () => {
  const raw = {
    questions: [0, 1, 2].map((i) => ({
      text: `8 g CH₄ ile tam olarak kaç gram O₂ gereklidir? (${i})`,
      options: ["16 g", "32 g", "64 g"],
      correct: "32 g",
      explanation: "0,5 mol CH₄ için 1 mol O₂ gerekir.",
      steps: ["1) n(CH₄) = 8 / 16 = 0,5 mol", "2) 1 mol O₂ = 32 g"],
    })),
  };

  it("survives parsing and reaches the public payload, but not a sealed exam", () => {
    const questions = parseQuizQuestions(raw)!;
    expect(questions[0].steps).toEqual(["n(CH₄) = 8 / 16 = 0,5 mol", "1 mol O₂ = 32 g"]);
    expect(publicQuizQuestion(questions[0]).steps).toHaveLength(2);
    expect(sealedQuizQuestion(questions[0]).steps).toBeUndefined();
  });

  it("does not drop a question whose steps field is malformed", () => {
    const questions = parseQuizQuestions({
      questions: raw.questions.map((q) => ({ ...q, steps: "tek metin" })),
    });
    expect(questions).toHaveLength(3);
    expect(questions?.[0].steps).toBeUndefined();
    expect(normalizeQuizQuestion({ ...raw.questions[0], steps: undefined })?.steps).toBeUndefined();
  });

  it("shows the numbered steps under the explanation after checking", () => {
    render(
      <ExamQuizPlay
        questions={[
          {
            text: "8 g CH₄ ile tam olarak kaç gram O₂ gereklidir?",
            options: ["16 g", "32 g"],
            multi: false,
            correct: ["32 g"],
            explanation: "0,5 mol CH₄ için 1 mol O₂ gerekir.",
            steps: ["n(CH₄) = 8 / 16 = 0,5 mol", "1 mol O₂ = 32 g"],
          },
        ]}
        index={0}
        value="32 g"
        onChange={() => undefined}
        onContinue={() => undefined}
        continueLabel="Testi bitir"
      />,
    );
    expect(screen.queryByText("Çözüm adımları")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.getByText("Çözüm adımları")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "n(CH₄) = 8 / 16 = 0,5 mol",
      "1 mol O₂ = 32 g",
    ]);
  });
});
