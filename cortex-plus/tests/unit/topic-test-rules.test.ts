import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MULTI_DISTRACTOR_RULE,
  parseQuizIssues,
  parseTeacherQuiz,
  quizFixSystem,
  quizFixUserPrompt,
  quizSystem,
  quizUserPrompt,
  quizVerifySystem,
  quizVerifyUserPrompt,
  TOPIC_TEST_RULE,
  topicTestPoints,
} from "@/lib/learning/teacher-quiz";
import { examPointsBlock } from "@/lib/learning/exam-points";
import { publicQuizQuestion } from "@/lib/learning/exam-quiz";

/*
  Konu testi kuralları (20 Ekim 2026). Kör kıyasta Pediatri solunum testimiz kaynak tablosunun dört
  satırını aynı kalıpla sordu ("En olası tanı hangisidir?"), uyarı ve tedavi cümlelerini hiç sormadı.
  Kurallar yalnız yoldaki konu testinde (scope "topic_test"); yazar, düzeltme ve denetçi aynı metni okur.
*/
const base = {
  topicLabel: "Solunum sistemi",
  prepTitle: "Pediatri (TUS)",
  pages: [{ page: 4, text: "Bronşiolit: her hastaya rutin antibiyotik veya bronkodilatör yaklaşımı doğru değildir." }],
  count: 5,
};
const scoped = { ...base, scope: "topic_test" as const };

describe("kapsam: kurallar yalnız yoldaki konu testinde", () => {
  it("yazar, düzeltme ve denetçi aynı KONU TESTİ metnini okur; öbür yüzeyler görmez", () => {
    for (const mode of ["document", "topic"] as const) {
      expect(quizSystem(mode, "practice", true, "topic_test")).toContain(TOPIC_TEST_RULE);
      expect(quizFixSystem(mode, "practice", true, "topic_test")).toContain(TOPIC_TEST_RULE);
      expect(quizVerifySystem(mode, "topic_test")).toContain(TOPIC_TEST_RULE);
      expect(quizSystem(mode, "practice", true)).not.toContain("KONU TESTİ");
      expect(quizSystem(mode, "gaps")).not.toContain("KONU TESTİ");
      expect(quizFixSystem(mode, "practice", true)).not.toContain("KONU TESTİ");
      expect(quizVerifySystem(mode)).not.toContain("KONU TESTİ");
      expect(quizVerifySystem(mode)).not.toContain("H) Tablo");
    }
    // Belgesiz testte "kaynak" konunun yerleşik bilgisi.
    expect(quizVerifySystem("topic", "topic_test")).toContain("Belgesiz testte aşağıda 'kaynak' denen her yer");
  });

  it("kural metni: kapsam, kalıp sınırı, tablo satırı, vaka (uydurma yok), uyarı, ders, point alanı", () => {
    for (const piece of [
      "en çok 2 soruda",
      "TABLO SATIRI SORU DEĞİLDİR",
      "Tablo satırını ya da kaynak cümlesini kopyalamak vaka değildir",
      "Vakaya kaynakta olmayan bulgu, eşik, sayı",
      "en az bir soru bunlardan birini yoklar",
      "DERSTE SORULANLAR",
      "DERSTE GEÇEN TERİMLER",
      '"point"',
      "önce '(derste işlendi)' yazan maddeler",
    ]) {
      expect(TOPIC_TEST_RULE).toContain(piece);
    }
    expect(quizSystem("document", "practice", true, "topic_test")).toContain('her soruya "point" alanı ekle');
    expect(quizSystem("document", "practice", true)).not.toContain('"point" alanı');
  });

  it("denetçi: H-K maddeleri, C notu ve harf alanı yalnız konu testinde; eski sabitler yerinde", () => {
    for (const mode of ["document", "topic"] as const) {
      const verify = quizVerifySystem(mode, "topic_test");
      for (const piece of ["H) Tablo/cümle tekrarı", "I) Tekrar", "J) Kapsam", "K) Ders", "H-K 'high'", '"code"', "C değildir"]) {
        expect(verify).toContain(piece);
      }
      // Eski bekçiler: aynı cümleler korunuyor.
      expect(verify).toContain("A-G 'high'");
      expect(verify).toContain("HER SORUYU ÖNCE KENDİN");
      expect(quizVerifySystem(mode)).not.toContain('"code"');
    }
    expect(quizFixSystem("document", "practice", true, "topic_test")).toMatch(/^Sen aynı testi yazan öğretmensin/);
    expect(quizFixSystem("document", "practice", true, "topic_test")).toContain("Sorun [I] ya da [J] ise");
  });

  it("zorluk satırı değişmedi: vaka tanımı yalnız KONU TESTİ metninde (öbür yüzeylere taşınmaz)", () => {
    expect(quizUserPrompt({ ...base, difficulty: "orta" })).toContain("ZORLUK: orta — soruların yarısından çoğu kısa bir vakayla açılır");
    expect(quizUserPrompt({ ...base, difficulty: "orta" })).not.toContain("vaka değildir");
    expect(quizVerifySystem("document")).not.toContain("C notu");
  });
});

describe("çok cevaplı sorunun çeldiricisi (yazar ve denetçi aynı metin)", () => {
  it("başka kavramın ya da hastalığın tipik özelliği çeldirici değildir", () => {
    expect(MULTI_DISTRACTOR_RULE).toContain("Başka bir kavramın ya da hastalığın tipik özelliği çeldirici değildir");
    expect(quizSystem("document", "practice", true)).toContain(MULTI_DISTRACTOR_RULE);
    for (const mode of ["document", "topic"] as const) {
      expect(quizVerifySystem(mode)).toContain(MULTI_DISTRACTOR_RULE);
      expect(quizVerifySystem(mode)).toContain("çok cevaplı soruda yanlış şıkkın sorulan bağlamdan değil");
    }
    // Eski bekçi cümleleri.
    expect(quizSystem("document", "practice", true)).toContain("ÇOK CEVAPLI SORU: Bu testte tam bir soru çok cevaplıdır");
    expect(quizSystem("document", "practice", true)).toContain("2 ya da 3'ü doğru");
  });
});

describe("madde listesi numaralı; derste işlenenler önce", () => {
  const points = [
    "Krupta istirahatte stridor ve belirgin çekilme ağır hastalığı gösterir.",
    "Bronşiolitte rutin antibiyotik ya da bronkodilatör önerilmez; destek tedavisi esastır.",
    "Epiglottit düşünülüyorsa boğaz zorla muayene edilmez.",
  ];

  it("testte numara, öbür motorlarda madde imi", () => {
    const quiz = examPointsBlock(points, "quiz");
    expect(quiz).toContain(`1. ${points[0]}`);
    expect(quiz).toContain(`3. ${points[2]}`);
    expect(quiz).toContain("Soruların çoğu bu maddeleri yoklasın");
    expect(examPointsBlock(points, "lesson")).toContain(`* ${points[0]}`);
    expect(examPointsBlock(points, "lesson")).not.toContain("1. ");
  });

  it("ders metninde geçen madde öne alınır ve işaretlenir; ders yoksa sıra aynı", () => {
    const lesson = {
      checks: [],
      terms: [],
      key: "Labc",
      text: "Bronşiolitte tedavinin temeli destek tedavisidir; her hastaya rutin antibiyotik ya da bronkodilatör önerilmez.",
    };
    const ordered = topicTestPoints({ examPoints: points, lesson, scope: "topic_test" });
    expect(ordered[0]).toBe(`${points[1]} (derste işlendi)`);
    expect(ordered.slice(1)).toEqual([points[0], points[2]]);
    expect(topicTestPoints({ examPoints: points, scope: "topic_test" })).toEqual(points);
    // Kapsam dışı yüzey dersi okumaz.
    expect(topicTestPoints({ examPoints: points, lesson })).toEqual(points);
    const prompt = quizUserPrompt({ ...scoped, examPoints: points, lesson });
    expect(prompt).toContain(`1. ${points[1]} (derste işlendi)`);
  });
});

describe("istemler: ders, testte kalanlar, kabul edilenler", () => {
  const lesson = { checks: ["Koterminal açı nedir?"], terms: ["koterminal", "esas ölçü"], key: "Lk1", text: "Koterminal açı" };

  it("yazar dersin sorularını ve terimlerini kaynaktan önce görür; ders yoksa istem bugünkü gibi", () => {
    const prompt = quizUserPrompt({ ...scoped, lesson });
    expect(prompt).toContain("DERSTE SORULANLAR (öğrenci bunları derste çözdü; aynen ya da aynı kalıpla sorma):\n- Koterminal açı nedir?");
    expect(prompt).toContain("DERSTE GEÇEN TERİMLER: koterminal, esas ölçü");
    expect(prompt.indexOf("KAYNAK:")).toBeGreaterThan(prompt.indexOf("DERSTE"));
    expect(quizUserPrompt(scoped)).not.toContain("DERSTE");
    // Kapsam dışı yüzey dersi görmez.
    expect(quizUserPrompt({ ...base, lesson })).not.toContain("DERSTE");
  });

  it("denetçi numaralı maddeleri, dersi ve kabul edilen soruları görür; indeksler TEST'e göre", () => {
    const [kept] = parseTeacherQuiz({
      questions: [{ text: "Kalan soru hangisidir?", options: ["a1", "b1", "c1", "d1"], correct: "a1", point: 2 }],
    })!;
    const verify = quizVerifyUserPrompt([kept], { ...scoped, examPoints: ["xx madde", "yy madde"], lesson }, [kept]);
    expect(verify).toContain("1. xx madde");
    expect(verify).toContain("DERSTE SORULANLAR");
    expect(verify).toContain("TESTİN KABUL EDİLEN SORULARI");
    expect(verify.indexOf("TEST (JSON)")).toBeGreaterThan(verify.indexOf("TESTİN KABUL EDİLEN"));
    // Kapsam dışı: bugünkü istem.
    expect(quizVerifyUserPrompt([kept], base, [kept])).not.toContain("KABUL EDİLEN");
  });

  it("düzeltme kalan soruların kalıbını ve maddesini görür; ikinci geçiş testte olanları", () => {
    const [kept, bad] = parseTeacherQuiz({
      questions: [
        { text: "Kalan soru: bu yönetim biçimi hangisidir?", options: ["a1", "b1", "c1", "d1"], correct: "a1", point: "1" },
        { text: "Düzeltilecek soru hangisidir?", options: ["a2", "b2", "c2", "d2"], correct: "a2" },
      ],
    })!;
    const fix = quizFixUserPrompt([{ question: bad, problems: ["[I] kalıp"] }], scoped, [kept]);
    expect(fix).toContain("KALAN SORULAR");
    expect(fix).toContain(`${kept.text} (madde: 1)`);
    expect(quizFixUserPrompt([{ question: bad, problems: ["x"] }], base, [kept])).not.toContain("KALAN SORULAR");
    expect(quizUserPrompt({ ...scoped, avoid: [kept] })).toContain(`TESTTE ZATEN OLAN SORULAR (bunları, maddelerini ve kalıplarını tekrar etme):\n- ${kept.text}`);
    expect(quizUserPrompt({ ...base, avoid: [kept] })).not.toContain("TESTTE ZATEN");
  });
});

describe("denetçi harfi ve point alanı", () => {
  it("harf okunur (küçük harf da); tanınmayan harf yok sayılır; harfsiz sorun maddeyle başlıyorsa ondan", () => {
    const issues = parseQuizIssues({
      issues: [
        { question: 0, code: "h", problem: "x" },
        { question: 1, code: "Z", problem: "y" },
        { question: 2, problem: "J) uyarı sorulmamış" },
        { question: 3, problem: "Anahtar yanlış" },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual(["H", undefined, "J", undefined]);
  });

  it("point taşınır (sayı da), öğrenciye giden soruda yok", () => {
    const [question] = parseTeacherQuiz({ questions: [{ text: "Soru?", options: ["a", "b", "c", "d"], correct: "a", point: 3 }] })!;
    expect(question.point).toBe("3");
    expect(publicQuizQuestion(question)).not.toHaveProperty("point");
  });
});

describe("rota yalnız konu testine kapsam ve ders verir", () => {
  const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
  it("teacherQuizPayload: scope ve ders yalnız kind quiz; eski bekçi satırları yerinde", () => {
    expect(route).toContain('scope: input.kind === "quiz" ? "topic_test" : undefined,');
    expect(route).toContain('lesson: input.kind === "quiz" ? (input.lessonQuiz ?? undefined) : undefined,');
    expect(route).toContain('multi: input.kind === "quiz" && count >= 5,');
    expect(route).toContain("return teacherQuizPayload(input, activity, core, Math.max(5, quizCount));");
    expect(route).toContain("lessonQuizContext(topicLessons.lessons, topicLessons.missing)");
    expect(route).toContain("lessonKey: quizLesson?.key ?? null,");
    expect(route).toContain('reason: "pedagogy_salvaged"');
    // Motoru paylaşan öbür yüzeyler kapsam vermez.
    expect(readFileSync("src/lib/learning/exam-quiz-generate.ts", "utf8")).not.toContain("topic_test");
  });
});
