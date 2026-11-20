/**
 * Faz 2 (madde 7.3): etkin konu testi / yol testi / D/Y paketinde cevap anahtarı yok; anında geri bildirim sunucuda
 * (`answer-check`), cevap kilitlendikten sonra yalnız o soru için.
 */
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { ANSWER_KEY_FIELDS, stripAnswerKeyForActiveExam } from "@/lib/learning/active-exam-seal";
import { answerFeedback, answerLocked } from "@/lib/learning/node/actions/answer-check";

const quiz = {
  type: "quiz",
  answerKey: ["Şık 1"],
  questions: [
    {
      text: "Soru kökü bir",
      options: ["Şık 1", "Şık 2"],
      multi: false,
      correct: ["Şık 1"],
      correctIndex: 0,
      correctOption: "A",
      explanation: "Gerekçe cümlesi.",
      optionWhy: ["neden bir", "neden iki"],
      steps: ["adım bir", "adım iki"],
    },
  ],
};
const trueFalse = {
  type: "true_false",
  items: [{ text: "Önerme bir", correct: false, explanation: "Gerekçe.", correctedStatement: "Doğrusu." }],
};

describe("stripAnswerKeyForActiveExam", () => {
  it("test sorusundan anahtar, açıklama ve şık gerekçeleri düşer; kök ve şıklar kalır", () => {
    const sealed = stripAnswerKeyForActiveExam(quiz) as typeof quiz & { answerCheck?: string };
    const question = sealed.questions[0] as Record<string, unknown>;
    expect(question.text).toBe("Soru kökü bir");
    expect(question.options).toEqual(["Şık 1", "Şık 2"]);
    for (const field of ["correct", "correctIndex", "correctOption", "explanation", "optionWhy", "steps"]) {
      expect(question[field]).toBeUndefined();
    }
    expect((sealed as Record<string, unknown>).answerKey).toBeUndefined();
    expect(sealed.answerCheck).toBe("server");
    expect(JSON.stringify(sealed)).not.toContain("Gerekçe");
  });

  it("D/Y önermesinden doğru değeri ve doğrusu düşer", () => {
    const sealed = stripAnswerKeyForActiveExam(trueFalse) as Record<string, unknown>;
    expect(sealed.items).toEqual([{ text: "Önerme bir" }]);
  });

  it("öbür türler olduğu gibi; kayıtlı paket değişmez", () => {
    const lesson = { type: "lesson", lesson: { a: 1 } };
    expect(stripAnswerKeyForActiveExam(lesson)).toBe(lesson);
    stripAnswerKeyForActiveExam(quiz);
    expect(quiz.questions[0]!.correct).toEqual(["Şık 1"]);
  });

  it("mühür listesi madde 7.3'ün adlarını kapsar", () => {
    for (const field of ["correctIndex", "correctOption", "explanation", "answerKey"]) {
      expect(ANSWER_KEY_FIELDS).toContain(field);
    }
  });
});

describe("answer-check", () => {
  it("tek sorunun geri bildirimi kayıtlı paketten (notlandırmanın okuduğu biçim)", () => {
    const quizFeedback = answerFeedback(quiz, 0);
    expect(quizFeedback?.kind).toBe("quiz");
    expect(quizFeedback && quizFeedback.kind === "quiz" ? quizFeedback.question.correct : null).toEqual(["Şık 1"]);
    expect(answerFeedback(quiz, 5)).toBeNull();
    const tf = answerFeedback(trueFalse, 0);
    expect(tf && tf.kind === "true_false" ? tf.item : null).toEqual({ correct: false, explanation: "Gerekçe.", correctedStatement: "Doğrusu." });
  });

  it("kilit: testte __locked, D/Y'de verilmiş cevap", () => {
    expect(answerLocked("quiz", { "0": "Şık 1", __locked: ["0"] }, "0")).toBe(true);
    expect(answerLocked("quiz", { "0": "Şık 1" }, "0")).toBe(false);
    expect(answerLocked("true_false", { "0": true }, "0")).toBe(true);
    expect(answerLocked("true_false", {}, "0")).toBe(false);
  });

  it("uç: etkin oturum yanıtları mühürlü; anahtar cevap kilitlenince döner; zamanlı denemede kapalı", () => {
    const payload = readFileSync("src/lib/learning/node/payload.ts", "utf8");
    expect(payload).toContain("const sealed = stripAnswerKeyForActiveExam(publicNodePayload(");
    const action = readFileSync("src/lib/learning/node/actions/answer-check.ts", "utf8");
    expect(action).toContain('if (kind === "written_exam") return errorResponse(400, "invalid_input");');
    expect(action).toContain("applyAnswerLocks(saved");
    expect(readFileSync("src/lib/learning/node/handler.ts", "utf8")).toContain('case "answer-check":');
    const incele = readFileSync("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx", "utf8");
    expect(incele).toContain("if (!attempt) redirect(");
  });
});
