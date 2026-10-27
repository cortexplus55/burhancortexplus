import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";
import { playableQuestions } from "@/lib/learning/quiz-delivery";

const raw = (text: string) => ({
  text,
  options: ["Uygulanır", "Ertelenir", "Düşer", "Askıdadır"],
  correct: "Uygulanır",
  multi: false,
  explanation: "Koşul tamamsa işlem yürür; diğerlerinde işlem durur.",
  optionWhy: [
    "Koşul tamam olduğu için işlem yürür.",
    "Ertelemede işlem henüz yürümez.",
    "Düşmede işlem sona erer.",
    "Askıda işlem onaya kadar beklemededir.",
  ],
  misconceptionTag: "kural karışıklığı",
  learningObjective: "Koşul tamamsa işlemin yürüdüğünü seçer.",
});

describe("akan test: denetimden geçmiş ilk pencere", () => {
  it("yapıdan düşen soru ilk pencerede yok, kalanların ilk üçü oynanır", async () => {
    const stems = [
      "Kuralın uygulanma koşulu hangi ifadedir?",
      "Erteleme kararı hangi durumda alınır?",
      "İşlemin sona ermesi hangi sonuçtur?",
      "Onay bekleyen işlem hangi adla anılır?",
      "Kapsam dışı kalan durum hangisidir?",
    ];
    const hepsi = {
      ...raw("Toplu seçenek hangi durumda geçerlidir?"),
      options: ["Uygulanır", "Ertelenir", "Düşer", "Hepsi"],
    };
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin") || system.includes("anahtarı görmeden")) return { issues: [], solved: [] };
      return { questions: [...stems.map(raw), hepsi] };
    });
    const seen: string[][] = [];
    const loop = await teacherQuizLoop(
      ask,
      {
        topicLabel: "Kural",
        prepTitle: "Hazırlık",
        pages: [{ page: 1, text: "Koşul tamamsa işlem yürür." }],
        count: 5,
        urgent: true,
        optionCount: 4,
      },
      Date.now(),
      { onPlayable: (questions) => seen.push(questions.map((question) => question.text)) },
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).not.toContain("Toplu seçenek hangi durumda geçerlidir?");
    expect(seen[0]?.length).toBeGreaterThanOrEqual(3);
    const window = playableQuestions(loop.questions.filter((question) => seen[0]?.includes(question.text)));
    expect(window).toHaveLength(3);
    expect(window.map((question) => question.text)).toEqual(seen[0]?.slice(0, 3));
    expect(loop.stages.draftMs).toBeGreaterThanOrEqual(0);
    expect(loop.stages.reviewMs).toBeGreaterThanOrEqual(0);
  });
});
