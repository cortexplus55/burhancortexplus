import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  ANSWER_LEAK_PREFIX,
  SINGLE_CHOICE_ISSUE_PREFIX,
  answerLeakIssue,
  correctOptionIndexOf,
  enforceSingleChoice,
  preSaveQuestionIssues,
  repairSingleChoice,
  singleChoiceVerdict,
} from "@/lib/learning/single-choice-guard";
import { parseTeacherQuiz, quizStructureIssues } from "@/lib/learning/teacher-quiz";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  Faz 1-A §5.2 (19 Kasım 2026): konu testi ve dinleme kontrolü soruları kaydedilmeden önce tek doğru şık
  (`correctOptionIndex`) ve cevap sızıntısı (AnswerLeakGuard) kapısından geçer. Örnekler şartnamenin kendi örnekleri.
*/

const OPTIONS = [
  "Sıvının yoğunluğuna",
  "Cismin yoğunluğuna",
  "Cismin rengine",
  "Kabın biçimine",
];

function question(partial: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    text: "Tamamen batmış bir cisme etki eden kaldırma kuvveti hangisine bağlıdır?",
    options: OPTIONS,
    correct: ["Sıvının yoğunluğuna"],
    multi: false,
    explanation: "Kaldırma kuvveti batan hacim, sıvının yoğunluğu ve yer çekimi ivmesinin çarpımıdır.",
    ...partial,
  } as QuizQuestion;
}

describe("single_choice: tam bir geçerli doğru şık (§3.1, §5.2)", () => {
  it("tek doğru şıklı soru geçer ve doğru şıkkın yeri bulunur", () => {
    expect(singleChoiceVerdict(question())).toEqual({ ok: true, correctOptionIndex: 0 });
    expect(correctOptionIndexOf(question())).toBe(0);
    expect(preSaveQuestionIssues(question())).toEqual([]);
  });

  it("birden fazla doğru işaretli soru kayıt öncesi yakalanır ve onarılamaz (yeniden üretilir)", () => {
    const multi = question({ correct: ["Sıvının yoğunluğuna", "Cismin yoğunluğuna"], multi: true });
    const verdict = singleChoiceVerdict(multi);
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toBe("multiple_correct");
    expect(preSaveQuestionIssues(multi).join(" ")).toContain(SINGLE_CHOICE_ISSUE_PREFIX);
    expect(repairSingleChoice(multi)).toBeNull();
    expect(correctOptionIndexOf(multi)).toBe(-1);
  });

  it("doğru şık şıklarda yoksa, işaretsizse ya da iki şık aynıysa yakalanır", () => {
    expect(singleChoiceVerdict(question({ correct: ["Cismin kütlesine"] })).ok).toBe(false);
    expect(singleChoiceVerdict(question({ correct: [] })).ok).toBe(false);
    expect(singleChoiceVerdict(question({ options: [OPTIONS[0]!, OPTIONS[0]!, OPTIONS[2]!, OPTIONS[3]!] })).ok).toBe(false);
  });

  it("kodun güvenle onarabildiği hata onarılır: yinelenen anahtar, gereksiz çok cevaplı bayrağı, yazım farkı", () => {
    const repaired = repairSingleChoice(question({ correct: ["sıvının yoğunluğuna", "Sıvının yoğunluğuna."], multi: true }));
    expect(repaired?.correct).toEqual(["Sıvının yoğunluğuna"]);
    expect(repaired?.multi).toBe(false);
  });

  it("yapı denetimi (quizStructureIssues) tek seçimli testte çok doğrulu soruyu düşürür", () => {
    const issues = quizStructureIssues(question({ correct: ["Sıvının yoğunluğuna", "Cismin yoğunluğuna"], multi: false }));
    expect(issues.join(" ")).toMatch(/Tek doğru şık/);
  });

  it("model çıktısı çok doğrulu geldiğinde kayıt kapısı onu eler, kalanlar tek doğrulu çıkar", () => {
    const parsed = parseTeacherQuiz({
      questions: [
        { ...question(), correct: "Sıvının yoğunluğuna" },
        { ...question({ text: "Avogadro sayısı yaklaşık kaçtır?" }), options: ["6,02 x 10^23", "3,00 x 10^8", "9,81", "1,60 x 10^-19"], correct: "6,02 x 10^23" },
      ],
    })!;
    const bad = question({ text: "Hangisi kaldırma kuvvetini etkiler?", correct: ["Sıvının yoğunluğuna", "Cismin yoğunluğuna"], multi: true });
    const gate = enforceSingleChoice([...parsed, bad]);
    expect(gate.kept).toHaveLength(2);
    expect(gate.rejected.map((row) => row.question.text)).toEqual(["Hangisi kaldırma kuvvetini etkiler?"]);
    for (const kept of gate.kept) {
      expect(kept.correct).toHaveLength(1);
      expect(kept.multi).toBe(false);
      expect(singleChoiceVerdict(kept).ok).toBe(true);
    }
  });
});

describe("AnswerLeakGuard: kök doğru şıkkı ele veremez (§3.2, §5.2)", () => {
  it("parantez içinde doğru şıkkı veren kök yakalanır", () => {
    const leak = question({ text: "Kaldırma kuvveti (sıvının yoğunluğuna) bağlıdır; buna göre kaldırma kuvveti neye bağlıdır?" });
    expect(answerLeakIssue(leak)).toContain(ANSWER_LEAK_PREFIX);
    expect(preSaveQuestionIssues(leak).join(" ")).toContain(ANSWER_LEAK_PREFIX);
    expect(enforceSingleChoice([leak]).kept).toEqual([]);
  });

  it("doğru şıkkı doğrudan yazan kök ve 'cevap:' etiketi yakalanır", () => {
    const direct = question({ text: "Kaldırma kuvveti sıvının yoğunluğuna bağlıysa, kaldırma kuvveti hangisine bağlıdır?" });
    expect(answerLeakIssue(direct)).toContain(ANSWER_LEAK_PREFIX);
    const labelled = question({ text: "Kaldırma kuvveti hangisine bağlıdır? Cevap: A" });
    expect(answerLeakIssue(labelled)).toContain(ANSWER_LEAK_PREFIX);
  });

  it("kök bir çeldiriciyi de aynı biçimde anıyorsa sızıntı sayılmaz; sızıntısız soru geçer", () => {
    const both = question({ text: "Kaldırma kuvveti sıvının yoğunluğuna mı yoksa cismin yoğunluğuna mı bağlıdır?" });
    expect(answerLeakIssue(both)).toBeNull();
    expect(answerLeakIssue(question())).toBeNull();
  });

  it("yapı denetimi (quizStructureIssues) sızıntıyı reddeder; üretim yerine yenisini yazar", () => {
    const leak = question({ text: "Kaldırma kuvveti (sıvının yoğunluğuna) bağlıdır; buna göre kaldırma kuvveti neye bağlıdır?" });
    expect(quizStructureIssues(leak).join(" ")).toMatch(/Cevap sızıntısı|cevabı veriyor/);
  });
});

describe("kapı üretim hattında: konu testi ve dinleme kontrolü", () => {
  it("konu testi tek seçimli istenir ve kayıt öncesi kapıdan geçer; dinleme kontrolü de aynı kapıdan", () => {
    const quizNode = readFileSync("src/lib/learning/node/quiz.ts", "utf8");
    expect(quizNode).toContain("multi: false,");
    const run = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    expect(run).toContain("enforceSingleChoice(questions)");
    expect(run).toContain("repairSingleChoice(question) ?? question");
    const podcast = readFileSync("src/lib/learning/teacher-podcast-run.ts", "utf8");
    expect(podcast).toContain("enforceSingleChoice(loop.questions)");
  });
});
