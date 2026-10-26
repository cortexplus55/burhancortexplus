import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  firstAnswerErrorLine,
  gradeOralExam,
  oralAttemptScore,
  oralFirstAnswer,
  oralFirstAnswerKey,
  validFirstAnswerErrors,
  type OralQuestionDraft,
  type OralSemanticItem,
} from "@/lib/learning/oral-exam";
import { reconcileOralGrade } from "@/lib/learning/oral-review";
import { OralResults } from "@/components/parity/oral-exam-flow";

/**
 * P0-5 (25 Ekim 2026): ilk cevaptaki yanlış, takip sorusunda düzeltilse de tavan uygular,
 * Eksikler'e "İlk yanıtta … doğrusu …" yazılır; ekran ve yol aynı yüzdeyi okur. Ders-bağımsız.
 */

type Case = {
  subject: string;
  source: string;
  question: OralQuestionDraft;
  first: string;
  follow: string;
  wrong: string;
  correct: string;
};

const CASES: Case[] = [
  {
    subject: "Hukuk",
    source: "Borçlar hukukunda irade sakatlığı hata, hile ve ikrahtır.",
    question: {
      prompt: "İrade sakatlığı halleri nelerdir?",
      learningObjective: "İrade sakatlığı",
      expectedPoints: ["hata, hile ve ikrah"],
    },
    first: "İrade sakatlığı hata ve zamanaşımıdır.",
    follow: "Düzeltiyorum: hata, hile ve ikrah.",
    wrong: "zamanaşımıdır",
    correct: "hata, hile ve ikrah",
  },
  {
    subject: "Tarih",
    source: "Malazgirt Savaşı 1071 yılında Alparslan komutasında kazanıldı.",
    question: {
      prompt: "Malazgirt Savaşı hangi yıl ve kimin komutasında kazanıldı?",
      learningObjective: "Malazgirt Savaşı",
      expectedPoints: ["1071 yılında Alparslan komutasında"],
    },
    first: "Malazgirt Savaşı 1081 yılında Tuğrul Bey komutasında kazanıldı.",
    follow: "Pardon, 1071 yılında Alparslan komutasında.",
    wrong: "1081 yılında Tuğrul Bey",
    correct: "1071 yılında Alparslan komutasında",
  },
  {
    subject: "Matematik",
    source: "Dik üçgende hipotenüsün karesi dik kenarların kareleri toplamına eşittir.",
    question: {
      prompt: "Pisagor bağıntısı nedir?",
      learningObjective: "Pisagor bağıntısı",
      expectedPoints: ["hipotenüsün karesi dik kenarların kareleri toplamına eşittir"],
    },
    first: "Hipotenüs dik kenarların toplamına eşittir.",
    follow: "Yani hipotenüsün karesi dik kenarların kareleri toplamına eşittir.",
    wrong: "Hipotenüs dik kenarların toplamına eşittir",
    correct: "hipotenüsün karesi dik kenarların kareleri toplamına eşittir",
  },
];

function answersFor(row: Case): Record<string, unknown> {
  return { "0": `${row.first}\n${row.follow}`, [oralFirstAnswerKey(0)]: row.first };
}

function semanticsFor(row: Case, wrong = row.wrong): OralSemanticItem[] {
  return [
    {
      index: 0,
      points: (row.question.expectedPoints ?? []).map((point) => ({
        point,
        status: "covered" as const,
        quote: row.follow.replace(/^[^:,]*[:,]\s*/, "").replace(/\.$/, ""),
      })),
      errors: [{ wrong, correct: row.correct }],
    },
  ];
}

describe("rubriği karşılayan cevap tam puan alır", () => {
  for (const row of CASES) {
    it(`${row.subject}: takipte düzeltilen cevap %100, yanlış alarm yok`, () => {
      const report = gradeOralExam([row.question], answersFor(row), row.source, [], semanticsFor(row));
      const item = report.items[0]!;
      expect(item.ratio).toBeGreaterThanOrEqual(0.99);
      expect(report.pct).toBe(100);
      expect(item.firstAnswerErrors ?? []).toEqual([]);
      expect(item.gap ?? "").not.toContain("yanlış ifade edildi");
    });
  }

  it("modelin uydurduğu alıntı (ilk cevapta geçmeyen) yok sayılır, puan düşmez", () => {
    const row = CASES[0]!;
    const report = gradeOralExam(
      [row.question],
      answersFor(row),
      row.source,
      [],
      semanticsFor(row, "fotosentez klorofilde olur"),
    );
    expect(report.items[0]?.firstAnswerErrors ?? []).toEqual([]);
    expect(report.pct).toBe(100);
  });

  it("takip sorusu açılmadıysa ilk cevap birleşik cevaptır", () => {
    expect(oralFirstAnswer({ "0": "tek cevap" }, 0)).toBe("tek cevap");
    expect(oralFirstAnswer({ "0": "a\nb", "ilk:0": "a" }, 0)).toBe("a");
  });

  it("doğrulama: boş / aynı / puan etiketi doğrusu kabul edilmez, en çok iki yanlış", () => {
    const first = "Bir iki üç dört beş altı yedi sekiz.";
    expect(validFirstAnswerErrors(first, [{ wrong: "iki üç", correct: "" }])).toEqual([]);
    expect(validFirstAnswerErrors(first, [{ wrong: "iki üç", correct: "İki üç" }])).toEqual([]);
    expect(validFirstAnswerErrors(first, [{ wrong: "iki üç", correct: "tam puan" }])).toEqual([]);
    const many = validFirstAnswerErrors(first, [
      { wrong: "iki üç", correct: "x" },
      { wrong: "dört beş", correct: "y" },
      { wrong: "altı yedi", correct: "z" },
    ]);
    expect(many).toHaveLength(2);
  });
});

describe("ekran yüzdesi = yol düğümü yüzdesi (tek hesap)", () => {
  it("kayıt puanı raporun yüzdesidir; düğüm yüzdesi score/total ile aynı çıkar", () => {
    const row = CASES[1]!;
    const questions = [row.question, CASES[0]!.question];
    const answers = { ...answersFor(row), "1": "Hata, hile ve ikrah irade sakatlığıdır." };
    const report = gradeOralExam(questions, answers, `${row.source}\n${CASES[0]!.source}`, [], semanticsFor(row));
    const saved = oralAttemptScore(report);
    expect(saved.total).toBe(100);
    expect(saved.score).toBe(Math.round(report.pct));
    expect(Math.round((saved.score / saved.total) * 100)).toBe(Math.round(report.pct));
    expect(report.pct).toBe(100);
  });

  it("düğüm rotası kaydı oralAttemptScore'dan alır, yol kararı soru sayısıyla", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("scored = oralAttemptScore(report)");
    expect(route).not.toContain("score: report.fullCount");
    expect(route).toContain("İlk cevap (takip sorusundan önce)");
    expect(route).toMatch(/errors: z\s*\.array/);
  });

  it("cevap masası takip sorusundan önceki cevabı ayrıca verir, oturum ilk:<i> anahtarına yazar", () => {
    const desk = readFileSync("src/components/parity/oral-answer-desk.tsx", "utf8");
    expect(desk).toContain("onAdvance(out.answer, out.firstAnswer)");
    expect(desk).toContain("onFinish(out.answer, out.firstAnswer)");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("oralFirstAnswerKey(index)");
  });
});

describe("stüdyo notu: doğrulanmış ilk yanlış rubrik örtüşmesini de yener", () => {
  const question = {
    prompt: "İrade sakatlığı halleri nelerdir?",
    expectedPoints: ["hata, hile ve ikrah"],
  };
  const answers = {
    "0": "İrade sakatlığı hata ve zamanaşımıdır. Düzeltiyorum: hata, hile ve ikrah.",
    [oralFirstAnswerKey(0)]: "İrade sakatlığı hata ve zamanaşımıdır.",
  };

  it("yanlış doğrulanınca soru doğru sayılmaz, gerekçe eksik cümlesidir", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers,
      modelItems: [
        { index: 0, correct: true, gap: null, errors: [{ wrong: "zamanaşımıdır", correct: "hata, hile ve ikrah" }] },
      ],
    });
    expect(result.correctCount).toBe(1);
    expect(result.items[0]?.gap ?? "").not.toContain("yanlış ifade edildi");
  });

  it("uydurma alıntı yok sayılır: rubrik tutuyorsa doğru kalır", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers,
      modelItems: [{ index: 0, correct: true, gap: null, errors: [{ wrong: "mitokondri", correct: "x" }] }],
    });
    expect(result.correctCount).toBe(1);
  });
});

describe("sonuç ekranı ilk yanlışta 'belirgin bir eksik görünmüyor' demez", () => {
  const base = {
    topicLabel: "Konu",
    onReview: () => {},
    onRepeat: () => {},
    nextHref: "/x",
  };

  it("ilk yanlış varsa Eksikler'de cümlesi görünür", () => {
    const line = firstAnswerErrorLine({ wrong: "zamanaşımıdır", correct: "hata, hile ve ikrah" });
    const html = renderToStaticMarkup(
      createElement(OralResults, { ...base, pct: 50, weaknesses: [], firstAnswerErrors: [line] }),
    );
    expect(html).not.toContain("belirgin bir eksik görünmüyor");
    expect(html).toContain("İlk yanıtta «zamanaşımıdır» yanlış ifade edildi");
  });

  it("tam puan almayan denemede de 'eksik görünmüyor' yazılmaz", () => {
    const html = renderToStaticMarkup(createElement(OralResults, { ...base, pct: 60, weaknesses: [] }));
    expect(html).not.toContain("belirgin bir eksik görünmüyor");
  });
});
