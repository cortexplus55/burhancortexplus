import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  KEY_CONSISTENCY_PREFIX,
  computations,
  evaluateExpression,
  hasFalseArithmetic,
  keyConsistency,
  rationaleSupportedIndex,
  storedTrueFalseKey,
  unsafeStoredCheck,
} from "@/lib/learning/answer-key-consistency";
import { explanationAnswerMismatch, mcqAnswerMismatch } from "@/lib/learning/answer-consistency";
import { LESSON_V3_FORMAT, readLessonV3, type LessonV3 } from "@/lib/learning/lesson-v3";
import { lessonStructureIssues } from "@/lib/learning/teacher-lesson";
import { alignedAnswerIndex } from "@/lib/learning/lesson-play";
import { normalizeQuizQuestion, scoreQuizAnswers, STORED_KEY_VOID_NOTE, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { activityVerdicts } from "@/lib/learning/answer-tally";
import { quizStructureIssues } from "@/lib/learning/teacher-quiz";
import { oralStructureIssues, trueFalseStructureIssues } from "@/lib/learning/teacher-practice";
import { cardStructureIssues } from "@/lib/learning/teacher-cards";
import { fitCramText } from "@/lib/learning/cram-sheet";

/*
  Faz 1-A §3 güçlendirmesi (19 Kasım 2026): cevap anahtarı sorunun kendi açıklaması, hesabı ve şık gerekçeleriyle
  çelişirse yakalanır; hesaplanabilen soruda kod doğrular. Bütün örnekler jeneriktir ("birim", "birinci kavram");
  gerçek konu, belge ya da ders içeriği yok.
*/

// Açıklamanın ilk cümlesi bir ARA sonuca varıyor ve o ara sonuç yanlış anahtarlı şıkla aynı sayı.
const INTERMEDIATE = {
  options: ["36 birim", "3 birim", "12 birim", "48 birim"],
  answerIndex: 1,
  explanation: "Fark 7 − 4 = 3’tür. Sonuç 3 × 12 = 36 birimdir. 3 birim farkın kendisidir; 12 birim çarpandır.",
  optionWhy: [
    "36 birim, farkın çarpanla çarpımıdır.",
    "3 birim, farkı sonuç sanmaktır.",
    "12 birim, çarpanın kendisidir.",
    "48 birim, çarpanı dörtle çarpmaktır.",
  ],
};

const CONCEPTS = ["Birinci kavram", "İkinci kavram", "Üçüncü kavram", "Dördüncü kavram"];

describe("aritmetik", () => {
  it("işlem zinciri kodla hesaplanır: üs, kesir, üst simge ve ondalık virgül", () => {
    expect(evaluateExpression("2 × (3 + 4)")).toBe(14);
    expect(evaluateExpression("10²")).toBe(100);
    expect(evaluateExpression("10⁻³")).toBeCloseTo(0.001);
    expect(evaluateExpression("1,5 · 4")).toBe(6);
    expect(computations("Sonuç 6 / 3 = 2 birimdir.")[0]).toMatchObject({ ok: true, result: 2, unit: "birimdir" });
  });

  it("yanlış işlem yakalanır; yuvarlama, cebir ve atama yanlış alarm vermez", () => {
    expect(hasFalseArithmetic("Toplam 3 × 4 = 10 olur.")).toBe(true);
    expect(hasFalseArithmetic("v = 2 + 2 = 5")).toBe(true);
    expect(hasFalseArithmetic("1/3 = 0,33")).toBe(false);
    expect(hasFalseArithmetic("2y − 3 × 2 = 4 denkleminde")).toBe(false);
    expect(hasFalseArithmetic("2x - 3 = 7")).toBe(false);
    expect(hasFalseArithmetic("6 × 10² = 600 birim")).toBe(false);
    expect(hasFalseArithmetic("Değer 5 birimdir.")).toBe(false);
  });
});

describe("tek doğrulu anahtar ↔ açıklama ve gerekçe", () => {
  it("ara sonuç yanlış anahtarla örtüşse bile birimiyle yazılmış hesap sonucu desteklenen şıkkı gösterir", () => {
    const verdict = keyConsistency(INTERMEDIATE);
    expect(verdict).toMatchObject({ ok: false, reason: "computed", supported: 0 });
    const mismatch = mcqAnswerMismatch(INTERMEDIATE);
    expect(mismatch).toMatchObject({ reason: "computed", expectedIndex: 0, expected: "36 birim" });
    expect(explanationAnswerMismatch({ ...INTERMEDIATE, keyed: [1] })?.expectedIndex).toBe(0);
  });

  it("tutarlı anahtar ve birden çok nötr gerekçe yanlış alarm vermez", () => {
    expect(keyConsistency({ ...INTERMEDIATE, answerIndex: 0 }).ok).toBe(true);
    expect(mcqAnswerMismatch({ ...INTERMEDIATE, answerIndex: 0 })).toBeNull();
  });

  it("anahtarlı şıkkın gerekçesi onu yanılgı diye anlatıyor ve tek bir başka şık destekleniyorsa o şık", () => {
    const why = [
      "Birinci kavram, tanımın kendisidir.",
      "İkinci kavram, tanımın tersini sanmaktır.",
      "Üçüncü kavram, birinciyle karıştırılır.",
      "Dördüncü kavram, kapsam dışı olduğu için uymaz.",
    ];
    expect(rationaleSupportedIndex(CONCEPTS, 2, why)).toBe(0);
    expect(mcqAnswerMismatch({ options: CONCEPTS, answerIndex: 2, explanation: "Tanım birinci kavramdır.", optionWhy: why })).toMatchObject({
      reason: "rationale",
      expectedIndex: 0,
    });
    // Birden çok aday kesin kanıt değildir.
    expect(rationaleSupportedIndex(CONCEPTS, 2, [why[0]!, "İkinci kavram, ikinci tanımdır.", why[2]!, why[3]!])).toBeNull();
  });

  it("olumsuz ifade taşıyan doğru şık kendi sözcüğüyle çürütülmüş sayılmaz", () => {
    const options = ["Birinci büyüklüğe bağlı değildir", "İkinci büyüklüğe bağlıdır", "Üçüncü büyüklüğe bağlıdır", "Dördüncü büyüklüğe bağlıdır"];
    const why = [
      "Birinci büyüklüğe bağlı değildir; ölçüm bunu gösterir.",
      "İkinci büyüklüğe bağlıdır demek yanlıştır.",
      "Üçüncü büyüklük ile karıştırılır.",
      "Dördüncü büyüklük ilgisizdir.",
    ];
    expect(rationaleSupportedIndex(options, 0, why)).toBeNull();
  });
});

function lessonWith(check: Record<string, unknown>) {
  return {
    format: LESSON_V3_FORMAT,
    title: "Jenerik hesap",
    objective: "Bir çarpımı hesaplamak.",
    overview: "Fark ve çarpan.",
    screens: [
      { heading: "Birinci kavram", concept: "Birinci kavram", blocks: [{ type: "text", text: "Fark bulunur, sonra çarpanla çarpılır." }] },
      {
        heading: "İkinci kavram",
        concept: "İkinci kavram",
        blocks: [
          { type: "text", text: "Sonuç farkın çarpanla çarpımıdır." },
          { type: "check", check },
        ],
      },
    ],
  };
}

const MCQ = { type: "mcq", prompt: "Fark 3, çarpan 12 ise sonuç kaç birimdir?", ...INTERMEDIATE };

describe("ders içi kontrol: üretim ve kayıt aynı kapıdan", () => {
  it("kayıtlı ders okunurken anahtar desteklenen şıkka alınır; notlandırma da aynı şıkkı doğru sayar", () => {
    const lesson = readLessonV3(lessonWith(MCQ))!;
    const block = lesson.screens[1]!.blocks.find((item) => item.type === "check");
    expect(block?.type === "check" && block.check.answerIndex).toBe(0);
    expect(alignedAnswerIndex(MCQ as never)).toBe(0);
  });

  it("açıklamasındaki işlem yanlış kayıtlı soru gösterilmez (ekrandan düşer); ekranın geri kalanı kalır", () => {
    const broken = { ...MCQ, answerIndex: 0, explanation: "Sonuç 3 × 12 = 30 birimdir.", optionWhy: INTERMEDIATE.optionWhy };
    expect(unsafeStoredCheck(broken)).toBe(true);
    const lesson = readLessonV3(lessonWith(broken))!;
    expect(lesson.screens[1]!.blocks.map((item) => item.type)).toEqual(["text"]);
  });

  it("D/Y kontrolü: önermedeki işlem yanlışken 'Doğru' anahtarı güvenle puanlanamaz", () => {
    const tf = { type: "trueFalse", prompt: "4 × 5 = 25 olur.", options: ["Doğru", "Yanlış"], answerIndex: 0, explanation: "Çarpım hesaplanır." };
    expect(unsafeStoredCheck(tf)).toBe(true);
    expect(unsafeStoredCheck({ ...tf, answerIndex: 1, corrected: "4 × 5 = 20 olur." })).toBe(false);
  });

  it("üretimde yanlış hesap düzeltme turuna gider", () => {
    const broken = { ...MCQ, answerIndex: 0, explanation: "Sonuç 3 × 12 = 30 birimdir." };
    const issues = lessonStructureIssues(lessonWith(broken) as unknown as LessonV3, {});
    expect(issues.some((issue) => issue.problem.startsWith(KEY_CONSISTENCY_PREFIX) && issue.severity === "high")).toBe(true);
  });
});

const quizRow = (partial: Partial<QuizQuestion> = {}) => ({
  text: "Fark 3, çarpan 12 ise sonuç kaç birimdir?",
  options: INTERMEDIATE.options,
  correct: ["3 birim"],
  multi: false,
  explanation: INTERMEDIATE.explanation,
  optionWhy: INTERMEDIATE.optionWhy,
  ...partial,
});

describe("test (konu testi, dinleme kontrolü, deneme): kayıtlı soru ve yeni üretim", () => {
  it("kayıtlı soru okunurken anahtar hizalanır; puan ve ekran sayımı aynı kararı verir", () => {
    const question = normalizeQuizQuestion(quizRow())!;
    expect(question.correct).toEqual(["36 birim"]);
    expect(scoreQuizAnswers([question], { "0": "36 birim" }).score).toBe(1);
    expect(activityVerdicts({ type: "quiz", questions: [quizRow()] }, { "0": "36 birim" })).toEqual(["dogru"]);
  });

  it("hesabı yanlış kayıtlı soru puanlanmaz (herkese tam puan, açıklama notu)", () => {
    const question = normalizeQuizQuestion(quizRow({ correct: ["36 birim"], explanation: "Sonuç 3 × 12 = 30 birimdir." }))!;
    expect(question).toMatchObject({ voided: true, voidNote: STORED_KEY_VOID_NOTE });
  });

  it("yeni üretimde çelişen anahtar ve yanlış hesap yapı denetimine takılır", () => {
    const keyed = quizStructureIssues(quizRow() as QuizQuestion);
    expect(keyed.some((issue) => issue.includes("Açıklama 36 sonucuna varıyor"))).toBe(true);
    const arithmetic = quizStructureIssues(quizRow({ correct: ["36 birim"], explanation: "Sonuç 3 × 12 = 30 birimdir." }) as QuizQuestion);
    expect(arithmetic.some((issue) => issue.startsWith(KEY_CONSISTENCY_PREFIX))).toBe(true);
  });
});

describe("D/Y, kart, sınav sabahı ve sözlü sınav", () => {
  it("D/Y: yanlış işlemli önerme 'Doğru' olamaz; kayıtlı eski önerme 'Yanlış' okunur", () => {
    const item = { text: "Sekizin üç katı 8 × 3 = 26 eder.", correct: true, explanation: "Çarpım hesaplanır.", misconceptionTag: "çarpım" };
    expect(trueFalseStructureIssues(item).some((issue) => issue.startsWith(KEY_CONSISTENCY_PREFIX))).toBe(true);
    expect(storedTrueFalseKey(item)).toBe(false);
    expect(activityVerdicts({ type: "true_false", items: [item] }, { "0": false })).toEqual(["dogru"]);
    expect(storedTrueFalseKey({ ...item, text: "Sekizin üç katı 8 × 3 = 24 eder." })).toBe(true);
  });

  it("kart: arka yüzdeki yanlış işlem yakalanır", () => {
    expect(cardStructureIssues({ front: "Sekizin üç katı kaçtır", back: "8 × 3 = 26" }).some((issue) => issue.startsWith(KEY_CONSISTENCY_PREFIX))).toBe(true);
    expect(cardStructureIssues({ front: "Sekizin üç katı kaçtır", back: "8 × 3 = 24" })).toEqual([]);
  });

  it("sınav sabahı: yanlış işlemli satır basılmaz", () => {
    expect(fitCramText("Sekizin üç katı 8 × 3 = 26 eder.")).toBeNull();
    expect(fitCramText("Sekizin üç katı 8 × 3 = 24 eder.")).toBe("Sekizin üç katı 8 × 3 = 24 eder.");
  });

  it("sözlü sınav: örnek cevap ya da beklenen noktada yanlış işlem yakalanır", () => {
    const item = {
      prompt: "Sekizin üç katını nasıl bulursun?",
      rubricCriteria: ["çarpımı kurar"],
      expectedPoints: ["8 × 3 = 26"],
      modelAnswer: "Sekizi üçle çarparım: 8 × 3 = 24 eder.",
    };
    expect(oralStructureIssues(item).some((issue) => issue.startsWith(KEY_CONSISTENCY_PREFIX))).toBe(true);
    expect(oralStructureIssues({ ...item, expectedPoints: ["8 × 3 = 24"] })).toEqual([]);
  });
});
