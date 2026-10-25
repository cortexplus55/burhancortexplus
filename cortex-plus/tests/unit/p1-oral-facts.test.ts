import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeOralExam, oralAttemptScore, type OralQuestionDraft, type OralSemanticItem } from "@/lib/learning/oral-exam";
import { firstAnswerErrorLine } from "@/lib/learning/oral-first-answer";
import {
  collectFactConflicts,
  deterministicFactConflicts,
  factCheckUserPrompt,
  mergeFactConflicts,
  parseFactCheckPayload,
  withFactConflicts,
} from "@/lib/learning/oral-fact-check";
import { oralPercentScore, reconcileOralGrade } from "@/lib/learning/oral-review";

type Fixture = {
  name: string;
  source: string;
  wrong: string;
  right: string;
};

/**
 * Kabul örnekleri. Ürün kodunda ders adı yok; bu cümleler yalnız ölçüdür.
 * Kimya, KPSS vatandaşlık, matematik ve İngilizce dil bilgisi.
 */
const FIXTURES: Fixture[] = [
  {
    name: "kimya",
    source: "Derişim iki katına çıkınca hız değişmez.",
    wrong: "Derişim iki katına çıkınca hız artar.",
    right: "Derişim iki katına çıkınca hız değişmez.",
  },
  {
    name: "kpss",
    source: "1921 Anayasası Madde 1 egemenliği tanımlar.",
    wrong: "1924 Anayasası Madde 1 egemenliği tanımlar.",
    right: "1921 Anayasası Madde 1 egemenliği tanımlar.",
  },
  {
    name: "matematik",
    source: "İlk terim 3, ortak fark 5, beşinci terim 23.",
    wrong: "İlk terim 3, ortak fark 5, beşinci terim 28.",
    right: "İlk terim 3, ortak fark 5, beşinci terim 23.",
  },
  {
    name: "ingilizce",
    source: "Article 4 states the rule was fixed in 1985 and does not change.",
    wrong: "Article 9 states the rule was fixed in 1991 and doubles.",
    right: "Article 4 states the rule was fixed in 1985 and does not change.",
  },
];

function questionsFor(answers: string[]): OralQuestionDraft[] {
  return answers.map(() => ({
    prompt: "Kural için geçerli ifade hangisidir?",
    expectedPoints: ["kural kaynağın ölçüsünü söyler"],
    modelAnswer: "Kaynak cümle olduğu gibi geçerlidir.",
  }));
}

function covered(answers: string[]): OralSemanticItem[] {
  return answers.map((answer, index) => ({
    index,
    points: [{ point: "kural", status: "covered" as const, quote: answer }],
  }));
}

function grade(source: string, answers: string[]) {
  const conflicts = deterministicFactConflicts(
    source,
    answers.map((answer, index) => ({ index, answer })),
  );
  const report = gradeOralExam(
    questionsFor(answers),
    Object.fromEntries(answers.map((answer, index) => [String(index), answer])),
    source,
    [],
    withFactConflicts(covered(answers), conflicts),
  );
  return { conflicts, report };
}

describe("sözlü olgu denetimi her derste aynı ölçü", () => {
  it.each(FIXTURES)("$name: yanlış olgu puanı %90'ın altına çeker ve eksiklerde doğrusunu yazar", (fixture) => {
    const filler = fixture.right;
    const { conflicts, report } = grade(fixture.source, [fixture.wrong, filler, filler]);
    expect(conflicts.get(0)?.length).toBeGreaterThan(0);
    expect(conflicts.has(1)).toBe(false);
    expect(report.pct).toBeLessThan(90);
    const line = firstAnswerErrorLine(conflicts.get(0)![0]!);
    expect(report.weaknesses.some((item) => item.includes(conflicts.get(0)![0]!.wrong.slice(0, 24)))).toBe(true);
    expect(report.weaknesses[0]).toBe(line);
    const path = oralAttemptScore(report);
    expect(path.total).toBe(100);
    expect(path.score).toBe(report.pct);
    expect(Math.round((path.score / path.total) * 100)).toBe(report.pct);
  });

  it.each(FIXTURES)("$name: kaynağı tekrar eden cevap puanı düşürmez", (fixture) => {
    const { conflicts, report } = grade(fixture.source, [fixture.right, fixture.right, fixture.right]);
    expect(conflicts.size).toBe(0);
    expect(report.pct).toBe(100);
    expect(report.weaknesses).toEqual([]);
    expect(oralAttemptScore(report).score).toBe(100);
  });

  it("eksik sayı, aynı yön ve alt küme yanlış değildir; ters sıra ve tanım istisnası yanlıştır", () => {
    const math = "İlk terim 3, ortak fark 5, beşinci terim 23.";
    expect(deterministicFactConflicts(math, [{ index: 0, answer: "İlk terim 3, ortak fark 5." }]).size).toBe(0);
    const flat = "Derişim iki katına çıkınca hız değişmez.";
    expect(deterministicFactConflicts(flat, [{ index: 0, answer: flat }]).size).toBe(0);
    const order = deterministicFactConflicts("hazırla → tartış → oyla.", [
      { index: 0, answer: "oyla → tartış → hazırla." },
    ]);
    expect(order.get(0)?.[0]?.correct).toContain("hazırla");
    const definition = deterministicFactConflicts("Tanım cümlesi: ölçü sabit kalır.", [
      { index: 0, answer: "Tanım cümlesi: ölçü artar." },
    ]);
    expect(definition.get(0)?.length).toBeGreaterThan(0);
    const exception = deterministicFactConflicts("İstisna cümlesi süre üç gün değişmez.", [
      { index: 0, answer: "İstisna cümlesi süre üç gün artar." },
    ]);
    expect(exception.get(0)?.[0]?.wrong).toContain("artar");
  });

  it("model susarsa yedek kalır; boş kaynakta ne model ne yedek çalışır", async () => {
    const source = FIXTURES[0]!.source;
    const answers = [{ index: 0, answer: FIXTURES[0]!.wrong }];
    const merged = await collectFactConflicts({
      source,
      answers,
      model: Promise.resolve({ items: [{ index: 0, errors: [{ wrong: "kaynakta yok", correct: "uydurma" }] }] }),
    });
    expect(merged.get(0)?.some((row) => row.wrong.includes("artar"))).toBe(true);
    expect(merged.get(0)?.some((row) => row.wrong === "kaynakta yok")).toBe(false);
    const empty = await collectFactConflicts({ source: "  ", answers, model: Promise.resolve({ items: [] }) });
    expect(empty.size).toBe(0);
    const parsed = parseFactCheckPayload(
      { items: [{ index: 0, errors: [{ wrong: FIXTURES[2]!.wrong, correct: FIXTURES[2]!.source }] }] },
      [{ index: 0, answer: FIXTURES[2]!.wrong }],
    );
    expect(mergeFactConflicts(parsed, new Map()).get(0)?.[0]?.correct).toContain("23");
    expect(factCheckUserPrompt(answers, source)).toContain("yön");
    expect(factCheckUserPrompt(answers, source)).not.toMatch(/hücre|mitoz|mitokondri/i);
  });

  it("stüdyo notu da aynı alıntıyla tam puanı kapatır", () => {
    const fixture = FIXTURES[1]!;
    const conflicts = deterministicFactConflicts(fixture.source, [
      { index: 0, answer: fixture.wrong },
      { index: 1, answer: fixture.right },
      { index: 2, answer: fixture.right },
    ]);
    const modelItems = withFactConflicts(
      [
        { index: 0, correct: true, gap: null, errors: [] },
        { index: 1, correct: true, gap: null, errors: [] },
        { index: 2, correct: true, gap: null, errors: [] },
      ],
      conflicts,
    );
    const reconciled = reconcileOralGrade({
      questions: questionsFor([fixture.wrong, fixture.right, fixture.right]).map((question) => ({
        prompt: question.prompt ?? "",
        expectedPoints: question.expectedPoints,
      })),
      answers: { 0: fixture.wrong, 1: fixture.right, 2: fixture.right },
      modelItems: modelItems?.map((item) => ({
        index: item.index,
        correct: "correct" in item ? Boolean(item.correct) : false,
        gap: null,
        errors: item.errors ?? [],
      })),
    });
    expect(reconciled.items[0]?.correct).toBe(false);
    expect(reconciled.items[0]?.gap).toContain("1924");
    expect(oralPercentScore(reconciled.correctCount, reconciled.total)).toBeLessThan(90);
  });
});

describe("yeni dosyalarda ders adı ve ders sözcüğü yok", () => {
  const files = [
    "src/lib/learning/quiz-delivery.ts",
    "src/lib/learning/podcast-duration.ts",
    "src/lib/learning/oral-fact-check.ts",
  ];
  const banned =
    /hücre|mitoz|mayoz|mitokondri|kromozom|fotosentez|enzim|biyoloji|kimya|matematik|anayasa|pediatri|kpss|osmanlı|vatandaşlık|\btyt\b|\bayt\b|\byds\b|\btus\b|\bdna\b|\brna\b|\batp\b/i;

  it("üç yeni kapı ders dalı içermez", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(banned);
    }
  });

  it("kapalı katman tıklamayı kesmez", () => {
    const css = readFileSync("src/styles/oral-exam-chrome.css", "utf8");
    expect(css).toContain('.cp-oral-modal-back[hidden]');
    expect(css).toContain(".cp-oral-modal-back.is-closed");
    expect(css).toContain('.cp-oral-modal-back[aria-hidden="true"]');
    expect(css).toContain("pointer-events: none !important");
    expect(css).toContain("display: none !important");
  });
});
