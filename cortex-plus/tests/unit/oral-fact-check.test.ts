import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeOralExam } from "@/lib/learning/oral-exam";
import {
  confirmedFactHits,
  factContradictions,
  factWeaknessLine,
  ORAL_FACT_TIMEOUT_MS,
  parseFactFindings,
} from "@/lib/learning/oral-fact-check";

type FixtureQuestion = {
  prompt: string;
  learningObjective: string;
  expectedPoints: string[];
  answer: string;
  wrong: boolean;
};

const fixture = JSON.parse(readFileSync("tests/fixtures/oral-fact-fixture.json", "utf8")) as {
  subject: string;
  source: string;
  questions: FixtureQuestion[];
};

function gradeFixture(source: string, questions: FixtureQuestion[], findings = []) {
  return gradeOralExam(
    questions.map((question) => ({
      prompt: question.prompt,
      learningObjective: question.learningObjective,
      expectedPoints: question.expectedPoints,
    })),
    Object.fromEntries(questions.map((question, index) => [String(index), question.answer])),
    source,
    [],
    null,
    findings,
  );
}

describe("sözlü olgu denetimi her derste aynı kural", () => {
  it("tarih vakasında yanlış yıl %90'ın altında kalır ve eksiğe yazılır", () => {
    expect(fixture.questions).toHaveLength(3);
    expect(fixture.questions.filter((question) => question.wrong)).toHaveLength(1);
    const report = gradeFixture(fixture.source, fixture.questions);
    expect(report.pct).toBeLessThan(90);
    expect(report.pct).toBe(
      Math.round((report.items.reduce((sum, item) => sum + item.ratio, 0) / report.items.length) * 100),
    );
    const line = report.weaknesses.find((item) => item.includes("yanlış. Doğrusu:"));
    expect(line).toBeTruthy();
    expect(line).toContain("1808");
    expect(line).toContain("1876");
    expect(report.items[0]?.gap).toContain("yanlış. Doğrusu:");
    expect(report.items[1]?.ratio).toBe(1);
    expect(report.items[2]?.ratio).toBe(1);
  });

  it("yön çelişkisi de aynı tavanı uygular", () => {
    const report = gradeOralExam(
      [
        {
          prompt: "Sonraki adımda miktar ne olur?",
          learningObjective: "Yön",
          expectedPoints: ["Toplam miktar sonraki adımda değişmez."],
        },
        {
          prompt: "Kayıt nerede durur?",
          learningObjective: "Kayıt",
          expectedPoints: ["Kayıt defterde durur."],
        },
        {
          prompt: "Son adım nedir?",
          learningObjective: "Son adım",
          expectedPoints: ["Son adım onayıdır."],
        },
      ],
      {
        "0": "Toplam miktar sonraki adımda artar.",
        "1": "Kayıt defterde durur.",
        "2": "Son adım onayıdır.",
      },
      "Toplam miktar sonraki adımda değişmez. Kayıt defterde durur. Son adım onayıdır.",
    );
    expect(report.pct).toBeLessThan(90);
    expect(report.weaknesses.some((item) => item.includes("artar") && item.includes("değişmez"))).toBe(true);
  });

  it("doğru cevap model uydursa da 100 kalır", () => {
    const chemistry = gradeOralExam(
      [
        {
          prompt: "Sınırlayıcı bileşen nasıl bulunur?",
          learningObjective: "Sınırlayıcı bileşen",
          expectedPoints: ["mol sayısı stokiyometrik katsayıya bölünür"],
        },
      ],
      { "0": "Mol sayısı stokiyometrik katsayıya bölünür." },
      "Sınırlayıcı bileşen bulunur: mol sayısı stokiyometrik katsayıya bölünür. Verim %80.",
      [],
      null,
      [
        {
          index: 0,
          quote: "Mol sayısı stokiyometrik katsayıya bölünür.",
          correction: "Bu cümle kaynakta yoktur.",
        },
      ],
    );
    expect(chemistry.pct).toBe(100);
    expect(chemistry.weaknesses).toEqual([]);

    const law = gradeOralExam(
      [
        {
          prompt: "İrade sakatlığı halleri nelerdir?",
          learningObjective: "İrade sakatlığı",
          expectedPoints: ["hata, hile ve ikrah"],
        },
      ],
      { "0": "Hata, hile ve ikrah irade sakatlığıdır." },
      "Borçlar hukukunda irade sakatlığı hata, hile ve ikrahtır. İrade fesadı sözleşmeyi sakatlar.",
    );
    expect(law.pct).toBe(100);

    const math = gradeOralExam(
      [
        {
          prompt: "Üçgenin iç açıları toplamı kaç derecedir?",
          learningObjective: "İç açılar",
          expectedPoints: ["Üçgenin iç açıları toplamı 180 derecedir."],
        },
      ],
      { "0": "Üçgenin iç açıları toplamı 180 derecedir." },
      "Üçgenin iç açıları toplamı 180 derecedir.",
    );
    expect(math.pct).toBe(100);

    const english = gradeOralExam(
      [
        {
          prompt: "How is the present perfect formed?",
          learningObjective: "Present perfect",
          expectedPoints: ["The present perfect uses have plus the past participle."],
        },
      ],
      { "0": "The present perfect uses have plus the past participle." },
      "The present perfect uses have plus the past participle. It links a past action to the present.",
    );
    expect(english.pct).toBe(100);
  });

  it("aynı yön ve çok sayılı hesap cümlesi yanlış olgu sayılmaz", () => {
    expect(
      factContradictions({
        answer: "Toplam miktar sonraki adımda değişmez.",
        source: "Toplam miktar sonraki adımda değişmez.",
      }),
    ).toEqual([]);
    expect(
      factContradictions({
        answer: "Hesapta 88 bölü 44 sonucu 2 olur ve kalan 18 birimdir.",
        source: "Kütle 44 birim, hacim 18 birimdir.",
      }),
    ).toEqual([]);
    const hit = factContradictions({
      answer: "Kanun 1808 yılında yürürlüğe girdi.",
      source: "Kanun 1876 yılında yürürlüğe girdi.",
    });
    expect(hit).toHaveLength(1);
    expect(factWeaknessLine(hit[0]!)).toContain("yanlış. Doğrusu:");
  });

  it("model tek başına doğru cevabı düşürmez; çağrının tavanı 12 saniyedir", () => {
    const answer = "Mol sayısı stokiyometrik katsayıya bölünür.";
    const source = "Sınırlayıcı bileşen bulunur: mol sayısı stokiyometrik katsayıya bölünür. Verim %80.";
    expect(
      confirmedFactHits(answer, source, ["mol sayısı stokiyometrik katsayıya bölünür"], [
        { quote: answer, correction: "Kaynak bunu söylemez." },
      ]),
    ).toEqual([]);
    const clash = factContradictions({
      answer: "Toplam miktar sonraki adımda artar.",
      source: "Toplam miktar sonraki adımda değişmez.",
    });
    expect(
      confirmedFactHits("Toplam miktar sonraki adımda artar.", "Toplam miktar sonraki adımda değişmez.", undefined, [
        { quote: "başka bir cümle", correction: "yok" },
      ]),
    ).toEqual(clash);
    expect(ORAL_FACT_TIMEOUT_MS).toBe(12_000);
    expect(parseFactFindings({ findings: [{ quote: "kısa", correction: "yok" }] })).toEqual([]);
    const run = readFileSync("src/lib/learning/oral-fact-run.ts", "utf8");
    expect(run).toContain("timeout: ORAL_FACT_TIMEOUT_MS");
    expect(run).toContain("maxRetries: 0");
    expect(run).toContain('actionCode: "PRACTICE_EXAM_GRADE"');
    expect(run).toContain("reservationId: null");
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("score: report.pct, total: 100");
    expect(route).toContain('reason: "oral_fact_check"');
  });
});
