import { describe, expect, it } from "vitest";
import { normalizeGeneratedQuizQuestion, normalizeQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { mathNoOptionMatches } from "@/lib/learning/math-key";
import {
  answerCountIssue,
  duplicateOptionPair,
  enumeratedCountIssue,
  optionKey,
  singleAnswerIntegrityIssues,
} from "@/lib/learning/question-integrity";
import { parseTeacherQuiz, quizStructureIssues } from "@/lib/learning/teacher-quiz";
import { screenStructureIssues } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Paket I #6 (30 Ekim 2026). Stres testinde (Muhasebe vizesi, Veri Yapıları finali): ders içi soruda iki şık aynı
  ve hiçbir şık doğru değil; yazılı denemede kök tek cevap istiyor, anahtarda iki doğru (kod soruyu sessizce çok
  cevaplıya çeviriyordu); "dört işlev" denip beş öğe sayılıyor. Kurallar ders adına bağlı değil: örnekler farklı
  derslerden.
*/

const why = (n: number) => Array.from({ length: n }, (_, index) => `Bu şık ${index + 1}. gerekçeyle açıklanır.`);

function mcq(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    text: "Bir hücrede protein sentezi nerede gerçekleşir?",
    options: ["Ribozom", "Lizozom", "Golgi cisimciği", "Koful", "Sentrozom"],
    correct: ["Ribozom"],
    multi: false,
    explanation: "Protein sentezi ribozomda gerçekleşir; öbür organeller başka işler yapar.",
    optionWhy: why(5),
    ...overrides,
  };
}

describe("aynı şık: yazım farkı aynılığı gizlemez", () => {
  it("ok, boşluk, büyük harf ve sondaki nokta yok sayılır", () => {
    expect(optionKey("A → B → C.")).toBe(optionKey("a->b->c"));
    expect(duplicateOptionPair(["s → a → b", "s → b → a", "S->A->B", "a → s"])).toEqual(["s → a → b", "S->A->B"]);
  });

  it("gerçekten farklı şıklar aynı sayılmaz", () => {
    expect(duplicateOptionPair(["O(n²)", "O(2ⁿ)", "O(n log n)", "O(n)"])).toBeNull();
    expect(duplicateOptionPair(["Aktif hesap", "Pasif hesap", "Gelir hesabı", "Gider hesabı"])).toBeNull();
  });
});

describe("kök ile doğru sayısı", () => {
  it("kök tek cevap istiyorsa iki doğru kabul edilmez", () => {
    expect(answerCountIssue("Aşağıdakilerden hangisi bir varlık hesabıdır?", 2)).toMatch(/tek cevap istiyor/);
    expect(answerCountIssue("Dijkstra algoritmasının çalışma süresi nedir?", 2)).toMatch(/tek cevap istiyor/);
  });

  it("çok cevaplı kök ve Türkçe 'I ve II' kalıbı sorun değildir", () => {
    expect(answerCountIssue("Aşağıdakilerden hangileri bir varlık hesabıdır?", 2)).toBeNull();
    expect(answerCountIssue("Yukarıdakilerden hangileri doğrudur?", 1)).toBeNull();
    expect(answerCountIssue("Aşağıdakilerden hangisi doğrudur?", 1)).toBeNull();
  });

  it("'hangi ikisi' başka sayıda doğruyla çelişir", () => {
    expect(answerCountIssue("Aşağıdaki organellerden hangi ikisi zarlıdır?", 3)).toMatch(/2 doğru istiyor, 3/);
    expect(answerCountIssue("Aşağıdaki organellerden hangi üçü zarlıdır?", 3)).toBeNull();
  });
});

describe("metin N öğe diyor, başka sayıda sayıyor", () => {
  it("iki noktadan sonraki listeyi sayar", () => {
    expect(
      enumeratedCountIssue("Muhasebenin dört temel işlevi vardır: kaydetme, sınıflandırma, özetleme, raporlama ve yorumlama."),
    ).toMatch(/4 öğe diyor, 5/);
    expect(enumeratedCountIssue("Muhasebenin dört temel işlevi vardır: kaydetme, sınıflandırma, özetleme ve raporlama.")).toBeNull();
    expect(enumeratedCountIssue("Üç aşaması vardır: hazırlık (plan ve bütçe), uygulama ve değerlendirme.")).toBeNull();
  });

  it("kökteki I-II-III maddelerini sayar", () => {
    expect(
      enumeratedCountIssue("Aşağıdaki üç ifadeden hangileri doğrudur?\nI. Yığın LIFO çalışır.\nII. Kuyruk FIFO çalışır.\nIII. Dizi sabit boyutludur.\nIV. Bağlı liste ardışıktır."),
    ).toMatch(/3 öğe diyor, 4/);
    expect(
      enumeratedCountIssue("I. Yığın LIFO çalışır.\nII. Kuyruk FIFO çalışır.\nYukarıdaki iki ifadeden hangileri doğrudur?"),
    ).toBeNull();
  });

  it("düz yazıdaki sayıya dokunmaz", () => {
    expect(enumeratedCountIssue("Kalp dört odacıktan oluşur ve kan iki dolaşımla taşınır.")).toBeNull();
    expect(enumeratedCountIssue("Oran 2:3 olarak verilmiştir.")).toBeNull();
  });
});

describe("hesap: hiçbir şık tutmuyor", () => {
  it("kökteki tek hesabın sonucu hiçbir şıkta yoksa yakalanır", () => {
    const check = { type: "mcq", prompt: "2³ + 4 kaçtır?", options: ["10", "14", "16", "6"], answerIndex: 0 };
    expect(mathNoOptionMatches(check)).toBe(true);
    expect(singleAnswerIntegrityIssues(check)).toContain("Hiçbir şık kökteki hesabın sonucunu vermiyor.");
    expect(mathNoOptionMatches({ ...check, options: ["10", "12", "16", "6"] })).toBe(false);
  });
});

describe("yeni üretim sessizce çok cevaplıya dönmez", () => {
  it("model tek cevaplı dedi, iki doğru işaretledi: soru tek cevaplı kalır ve yapı denetimine takılır", () => {
    const parsed = parseTeacherQuiz({
      questions: [
        {
          text: "Aşağıdakilerden hangisi bir varlık hesabıdır?",
          options: ["Kasa", "Banka", "Satıcılar", "Sermaye", "Alınan krediler"],
          correct: ["Kasa", "Banka"],
          multi: false,
          explanation: "Kasa ve banka varlıktır.",
          optionWhy: why(5),
        },
      ],
    });
    expect(parsed?.[0]?.multi).toBe(false);
    const issues = quizStructureIssues(parsed![0]!, { multi: true, optionCount: 5 });
    expect(issues.some((issue) => issue.includes("Tek doğru şık olmalı"))).toBe(true);
  });

  it("model çok cevaplı bildirmedi ama kök tek cevap istiyor: çok cevaplı soru yine reddedilir", () => {
    const parsed = parseTeacherQuiz({
      questions: [
        {
          text: "Aşağıdakilerden hangisi bir varlık hesabıdır?",
          options: ["Kasa", "Banka", "Satıcılar", "Sermaye", "Alınan krediler"],
          correct: ["Kasa", "Banka"],
          explanation: "Kasa ve banka varlıktır; satıcılar, sermaye ve krediler kaynak tarafındadır.",
          optionWhy: why(5),
        },
      ],
    });
    expect(parsed?.[0]?.multi).toBe(true);
    const issues = quizStructureIssues(parsed![0]!, { multi: true, optionCount: 5 });
    expect(issues.some((issue) => issue.includes("tek cevap istiyor"))).toBe(true);
  });

  it("kayıtlı soruları okuyan yerlerde davranış aynı (varsayılan)", () => {
    const stored = normalizeQuizQuestion({ text: "Hangileri zarlıdır?", options: ["Mitokondri", "Ribozom", "Golgi"], correct: ["Mitokondri", "Golgi"] });
    expect(stored?.multi).toBe(true);
    const strict = normalizeGeneratedQuizQuestion(
      { text: "Hangisi zarlıdır?", options: ["Mitokondri", "Ribozom", "Golgi"], correct: ["Mitokondri", "Golgi"] },
      false,
    );
    expect(strict?.multi).toBe(false);
    const undeclared = normalizeGeneratedQuizQuestion(
      { text: "Hangileri zarlıdır?", options: ["Mitokondri", "Ribozom", "Golgi"], correct: ["Mitokondri", "Golgi"] },
      undefined,
    );
    expect(undeclared?.multi).toBe(true);
    // `.map(normalizeQuizQuestion)` dizini ikinci argüman olarak geçirir; imza tek argümanlı kalmalı.
    expect(normalizeQuizQuestion.length).toBe(1);
  });

  it("tek doğrulu soruda aynı şık yazım farkıyla da yakalanır", () => {
    const question = mcq({
      text: "Dijkstra algoritmasında S'den D'ye en kısa yol hangisidir?",
      options: ["S → A → D", "S → B → D", "S → C → D", "S→A→D.", "S → B → C → D"],
      correct: ["S → B → D"],
    });
    expect(quizStructureIssues(question, { optionCount: 5 }).some((issue) => issue.startsWith("Aynı şık iki kez"))).toBe(true);
  });
});

describe("ders içi soru testle aynı denetimi alır", () => {
  const screen = (check: Record<string, unknown>) =>
    ({
      heading: "En kısa yol",
      concept: "Dijkstra",
      blocks: [
        { type: "text", text: "Dijkstra algoritması her adımda en küçük uzaklığa sahip düğümü kesinleştirir ve komşularını günceller." },
        { type: "check", check },
      ],
    }) as unknown as LessonV3["screens"][number];

  it("aynı iki şık ve hiçbir şıkkın tutmadığı hesap yüksek önemde yazılır", () => {
    const duplicate = screenStructureIssues(
      screen({
        type: "mcq",
        prompt: "S'den D'ye en kısa yol hangisidir?",
        options: ["S → A → D", "S → B → D", "S → C → D", "S->A->D"],
        answerIndex: 1,
        explanation: "S → B → D toplam 5 ile en kısadır.",
        optionWhy: why(4),
      }),
      0,
      { pages: [] },
    );
    expect(duplicate.some((issue) => issue.severity === "high" && issue.problem.startsWith("Aynı şık iki kez"))).toBe(true);

    const noKey = screenStructureIssues(
      screen({
        type: "mcq",
        prompt: "2³ + 4 kaçtır?",
        options: ["10", "14", "16", "6"],
        answerIndex: 0,
        explanation: "Önce üs alınır, sonra toplanır.",
        optionWhy: why(4),
      }),
      0,
      { pages: [] },
    );
    expect(noKey.some((issue) => issue.severity === "high" && issue.problem.includes("Hiçbir şık"))).toBe(true);
  });

  it("sayı tutarsızlığı derste düşük önemdedir", () => {
    const issues = screenStructureIssues(
      screen({
        type: "trueFalse",
        prompt: "Muhasebenin dört temel işlevi vardır: kaydetme, sınıflandırma, özetleme, raporlama ve yorumlama.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Kaynakta dört işlev sayılır.",
        corrected: "Muhasebenin dört temel işlevi kaydetme, sınıflandırma, özetleme ve raporlamadır.",
      }),
      0,
      { pages: [] },
    );
    const counted = issues.filter((issue) => issue.problem.includes("öğe diyor"));
    expect(counted.length).toBe(1);
    expect(counted[0]!.severity).toBe("low");
  });
});
