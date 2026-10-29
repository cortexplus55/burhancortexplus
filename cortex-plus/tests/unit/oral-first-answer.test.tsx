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
  oralFollowAnswer,
  oralFollowQuestion,
  oralFollowQuestionKey,
  type OralQuestionDraft,
  type OralSemanticItem,
} from "@/lib/learning/oral-exam";
import { reconcileOralGrade } from "@/lib/learning/oral-review";
import { OralResults } from "@/components/parity/oral-exam-flow";

/**
 * P0-5 (25 Ekim 2026) → 29 Ekim 2026 kararı: ilk cevabın notunu yalnız hakem verir. Kod tavan
 * uygulamaz, "İlk yanıtta … doğrusu …" satırını üretmez; hakemin notunu yalnız biçimler ve tam puan
 * almayan soruda gösterir. Ekran ve yol aynı yüzdeyi okur. Ders-bağımsız.
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

/** Hakem noktayı covered saydı; nota rağmen (yanlış alarm) puan değişmez. */
function coveredBy(row: Case, wrong = row.wrong): OralSemanticItem[] {
  return [
    {
      index: 0,
      points: (row.question.expectedPoints ?? []).map((point) => ({
        point,
        status: "covered" as const,
        quote: row.follow.replace(/^[^:,]*[:,]\s*/, "").replace(/\.$/, ""),
      })),
      firstAnswerIssue: { wrong, correct: row.correct },
    },
  ];
}

/** Hakem ilk cevaptaki çelişkiyi puanladı: nokta missing, not yazılı. */
function missedBy(row: Case): OralSemanticItem[] {
  return [
    {
      index: 0,
      points: (row.question.expectedPoints ?? []).map((point) => ({ point, status: "missing" as const, quote: "" })),
      firstAnswerIssue: { wrong: row.wrong, correct: row.correct },
    },
  ];
}

describe("hakemin covered dediği cevap tam puan alır; kod not basmaz", () => {
  for (const row of CASES) {
    it(`${row.subject}: hakem covered → %100, nota rağmen etiket yok`, () => {
      const report = gradeOralExam([row.question], answersFor(row), row.source, [], coveredBy(row));
      const item = report.items[0]!;
      expect(item.ratio).toBeGreaterThanOrEqual(0.99);
      expect(report.pct).toBe(100);
      expect(item.firstAnswerNote).toBeUndefined();
      expect(item.gap ?? "").not.toContain("yanlış ifade edildi");
      expect(report.weaknesses).toEqual([]);
    });

    it(`${row.subject}: hakem missing + not → oran hakemin, Eksikler'in başında hakemin satırı`, () => {
      const report = gradeOralExam([row.question], answersFor(row), row.source, [], missedBy(row));
      const item = report.items[0]!;
      const line = firstAnswerErrorLine({ wrong: row.wrong, correct: row.correct });
      expect(item.ratio).toBe(0);
      expect(item.verdict).toBe("yanlis");
      expect(item.firstAnswerNote).toBe(line);
      expect(item.gap).toBe(line);
      expect(report.weaknesses[0]).toBe(line);
    });
  }

  it("hakemin alıntısı cevapta geçmese de kod puanı düşürmez (not yalnız bilgi)", () => {
    const row = CASES[0]!;
    const report = gradeOralExam([row.question], answersFor(row), row.source, [], coveredBy(row, "fotosentez klorofilde olur"));
    expect(report.items[0]?.firstAnswerNote).toBeUndefined();
    expect(report.pct).toBe(100);
  });

  it("takip sorusu açılmadıysa ilk cevap birleşik cevaptır; takip anahtarları ayrı okunur", () => {
    expect(oralFirstAnswer({ "0": "tek cevap" }, 0)).toBe("tek cevap");
    expect(oralFirstAnswer({ "0": "a\nb", "ilk:0": "a" }, 0)).toBe("a");
    expect(oralFollowAnswer({ "0": "a\nb", "ilk:0": "a" }, 0)).toBe("b");
    expect(oralFollowAnswer({ "0": "tek cevap" }, 0)).toBe("");
    expect(oralFollowQuestionKey(2)).toBe("takip:2");
    expect(oralFollowQuestion({ "takip:2": " Neden? " }, 2)).toBe("Neden?");
    expect(oralFollowQuestion({}, 2)).toBe("");
  });

  it("firstAnswerErrorLine yalnız biçimler: boş alanlı not satır vermez", () => {
    expect(firstAnswerErrorLine({ wrong: "1081", correct: "1071" })).toBe(
      "İlk yanıtta «1081» yanlış ifade edildi; doğrusu «1071» olmalıdır.",
    );
    expect(firstAnswerErrorLine({ wrong: "", correct: "1071" })).toBe("");
    expect(firstAnswerErrorLine({ wrong: "1081", correct: "  " })).toBe("");
    expect(firstAnswerErrorLine(null)).toBe("");
  });
});

describe("ekran yüzdesi = yol düğümü yüzdesi (tek hesap)", () => {
  it("kayıt puanı raporun yüzdesidir; düğüm yüzdesi score/total ile aynı çıkar", () => {
    const row = CASES[1]!;
    const questions = [row.question, CASES[0]!.question];
    const answers = { ...answersFor(row), "1": "Hata, hile ve ikrah irade sakatlığıdır." };
    const report = gradeOralExam(questions, answers, `${row.source}\n${CASES[0]!.source}`, [], coveredBy(row));
    const saved = oralAttemptScore(report);
    expect(saved.total).toBe(100);
    expect(saved.score).toBe(Math.round(report.pct));
    expect(Math.round((saved.score / saved.total) * 100)).toBe(Math.round(report.pct));
    expect(report.pct).toBe(100);
  });

  it("düğüm rotası kaydı oralAttemptScore'dan alır; hakem istemi soru başına kapalı blok, kaynak özeti yok", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("scored = oralAttemptScore(report)");
    expect(route).not.toContain("score: report.fullCount");
    expect(route).toContain("İlk cevap:");
    expect(route).toContain("Takip sorusu:");
    expect(route).toContain("Takip cevabı:");
    expect(route).toContain("Rubrik:");
    expect(route).toContain("ORAL_JUDGE_RULES");
    expect(route).toContain("firstAnswerIssue");
    expect(route).not.toContain("Kaynak özeti");
    expect(route).not.toMatch(/errors: z\s*\.array/);
    expect(route).not.toContain("oral-fact-check");
  });

  it("cevap masası takip sorusundan önceki cevabı ayrıca verir, oturum ilk:<i> ve takip:<i> anahtarlarına yazar", () => {
    const desk = readFileSync("src/components/parity/oral-answer-desk.tsx", "utf8");
    expect(desk).toContain("onAdvance(out.answer, out.firstAnswer)");
    expect(desk).toContain("onFinish(out.answer, out.firstAnswer)");
    expect(desk).toContain("onProbe?.(next.question)");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("oralFirstAnswerKey(index)");
    expect(session).toContain("oralFollowQuestionKey(index)");
    expect(session).not.toContain("firstAnswerErrors");
  });
});

describe("stüdyo notu: hakemin kararı aynen, not yalnız gerekçe", () => {
  const question = {
    prompt: "İrade sakatlığı halleri nelerdir?",
    expectedPoints: ["hata, hile ve ikrah"],
  };
  const answers = {
    "0": "İrade sakatlığı hata ve zamanaşımıdır. Düzeltiyorum: hata, hile ve ikrah.",
    [oralFirstAnswerKey(0)]: "İrade sakatlığı hata ve zamanaşımıdır.",
  };
  const issue = { wrong: "zamanaşımıdır", correct: "hata, hile ve ikrah" };

  it("hakem doğru dediyse not puanı düşürmez, gerekçe yok", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers,
      modelItems: [{ index: 0, correct: true, gap: null, firstAnswerIssue: issue }],
    });
    expect(result.correctCount).toBe(1);
    expect(result.items[0]?.gap).toBeNull();
  });

  it("hakem yanlış dediyse ve rubrik tutmuyorsa gerekçe hakemin satırıdır", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers: { "0": "Yalnızca zamanaşımı.", [oralFirstAnswerKey(0)]: "Yalnızca zamanaşımı." },
      modelItems: [{ index: 0, correct: false, gap: "Haller eksik.", firstAnswerIssue: issue }],
    });
    expect(result.correctCount).toBe(0);
    expect(result.items[0]?.gap).toBe(firstAnswerErrorLine(issue));
  });

  it("uydurma not rubriği karşılayan cevabı düşürmez (yükseltme kalır)", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers,
      modelItems: [{ index: 0, correct: false, gap: null, firstAnswerIssue: { wrong: "mitokondri", correct: "x" } }],
    });
    expect(result.correctCount).toBe(1);
  });
});

describe("sonuç ekranı Eksikler'i raporun satırlarıyla çizer", () => {
  const base = {
    topicLabel: "Konu",
    onReview: () => {},
    onRepeat: () => {},
    nextHref: "/x",
  };

  it("hakemin ilk cevap notu weaknesses'ın başındaysa görünür, 'eksik görünmüyor' yazılmaz", () => {
    const line = firstAnswerErrorLine({ wrong: "zamanaşımıdır", correct: "hata, hile ve ikrah" });
    const html = renderToStaticMarkup(createElement(OralResults, { ...base, pct: 50, weaknesses: [line] }));
    expect(html).not.toContain("belirgin bir eksik görünmüyor");
    expect(html).toContain("İlk yanıtta «zamanaşımıdır» yanlış ifade edildi");
  });

  it("tam puan almayan denemede de 'eksik görünmüyor' yazılmaz", () => {
    const html = renderToStaticMarkup(createElement(OralResults, { ...base, pct: 60, weaknesses: [] }));
    expect(html).not.toContain("belirgin bir eksik görünmüyor");
  });
});
