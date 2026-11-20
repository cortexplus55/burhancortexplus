// @vitest-environment jsdom
/**
 * Kırmızı Kalemli Hoca (Faz 7, 20 Kasım 2026): açık uçlu sorunun yeşil ("+N Puan · …") ve kırmızı ("−N Puan · Hoca
 * buradan kırar: …") satırları notlandırmanın zaten ürettiği veriden. Bekçi: kırmızı toplam = en yüksek − verilen;
 * yeşil toplam = verilen; uydurma kesinti yok (her kırmızı satır karşılanmamış bir ölçüte ya da notlandırmanın kendi
 * sınırına bağlı); ek model çağrısı yok; eski kayıtta blok yok. Örnekler konu-bağımsız yer tutucular.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  RED_PEN_NOTES,
  deriveRedPen,
  parseRedPen,
  splitEarnedNote,
  type RedPen,
  type RedPenCriterion,
} from "@/lib/learning/mock-exam/red-pen";
import { BARE_RESULT_NOTE, RESULT_CONFLICT_NOTE, SETUP_OK_ARITHMETIC_NOTE, SHORT_SOLUTION_FULL_CREDIT } from "@/lib/learning/mock-exam/score-notes";
import { analyzeWorkSteps, stepFeedbackLine } from "@/lib/learning/mock-exam/work-steps";
import { adjustScoredAnswer, gradeRubricAnswer } from "@/lib/learning/mock-exam/grade";
import { RedPenSheet } from "@/components/parity/red-pen-sheet";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const milli = (value: number) => Math.round(value * 1000);
const greenSum = (pen: RedPen) =>
  pen.earnedStepNotes.reduce((sum, note) => sum + milli(Number((splitEarnedNote(note).points ?? "0").replace(",", "."))), 0);
const redSum = (pen: RedPen) => pen.deductionAlerts.reduce((sum, row) => sum + milli(row.lostPoints), 0);

function expectBalanced(pen: RedPen, max: number, awarded: number, criteria: readonly RedPenCriterion[], capSteps: string[] = []) {
  expect(redSum(pen)).toBe(milli(max) - milli(awarded));
  // Yeşil satırlar ekranda en çok iki ondalıkla yazılır: satır başına en çok 0,005 yuvarlama.
  expect(Math.abs(greenSum(pen) - milli(awarded))).toBeLessThanOrEqual(5 * pen.earnedStepNotes.length);
  const missed = new Set(criteria.filter((row) => !row.met).map((row) => row.criterion));
  for (const row of pen.deductionAlerts) {
    expect(missed.has(row.step) || capSteps.includes(row.step), row.step).toBe(true);
    expect(row.lostPoints).toBeGreaterThan(0);
  }
}

afterEach(cleanup);

describe("deriveRedPen", () => {
  const criteria: RedPenCriterion[] = [
    { criterion: "Bağıntıyı doğru kurar", points: 4, met: true },
    { criterion: "Ara işlemi gösterir", points: 3, met: false },
    { criterion: "Sonucu birimiyle yazar", points: 3, met: false },
  ];

  it("ölçüt kadar puan: yeşil karşılanan, kırmızı karşılanmayan; toplamlar tutar", () => {
    const pen = deriveRedPen({ maxPoints: 10, awarded: 4, criteria });
    expect(pen.earnedStepNotes).toEqual(["+4 Puan · Bağıntıyı doğru kurar"]);
    expect(pen.deductionAlerts).toEqual([
      { step: "Ara işlemi gösterir", lostPoints: 3, teacherNote: RED_PEN_NOTES.missing },
      { step: "Sonucu birimiyle yazar", lostPoints: 3, teacherNote: RED_PEN_NOTES.missing },
    ]);
    expectBalanced(pen, 10, 4, criteria);
  });

  it("satır satır kısmi puan: kazanılan kısım yeşilde tek satır, ilk kırık satır ilk kırmızı ölçütün notu", () => {
    const steps = analyzeWorkSteps("2x + 3 = 11\n2x = 11 + 3\nx = 7");
    const note = stepFeedbackLine(steps)!;
    expect(note).toMatch(/1\. satıra kadar kurulumun doğru; 2\. satırda işaret hatası/);
    const pen = deriveRedPen({ maxPoints: 10, awarded: 6, criteria, steps, scoreNote: note });
    expect(pen.earnedStepNotes).toEqual(["+4 Puan · Bağıntıyı doğru kurar", "+2 Puan · 1. satıra kadar kurulumun doğru"]);
    expect(pen.deductionAlerts[0]).toMatchObject({ step: "Ara işlemi gösterir", lostPoints: 1 });
    expect(pen.deductionAlerts[0]!.teacherNote).toMatch(/^2\. satırda işaret hatası/);
    expect(pen.deductionAlerts[1]).toEqual({ step: "Sonucu birimiyle yazar", lostPoints: 3, teacherNote: RED_PEN_NOTES.missing });
    expectBalanced(pen, 10, 6, criteria);
  });

  it("kurulum notu: yeşil 'Kurulum doğru', kırık kısım ilk kırmızı satırda", () => {
    const pen = deriveRedPen({ maxPoints: 10, awarded: 7, criteria, scoreNote: SETUP_OK_ARITHMETIC_NOTE });
    expect(pen.earnedStepNotes.at(-1)).toBe("+3 Puan · Kurulum doğru");
    expect(pen.deductionAlerts[0]).toEqual({ step: "Sonucu birimiyle yazar", lostPoints: 3, teacherNote: "Son aritmetik adım hatalı." });
    expectBalanced(pen, 10, 7, criteria);
  });

  it("notlandırmanın sınırı (yalnız sonuç, çelişen sonuç): tek kırmızı satır, karşılanan ölçütler oranla paylaşır", () => {
    const allMet = criteria.map((row) => ({ ...row, met: true }));
    const bare = deriveRedPen({ maxPoints: 10, awarded: 6, criteria: allMet, scoreNote: BARE_RESULT_NOTE });
    expect(bare.deductionAlerts).toEqual([{ step: "Yöntem", lostPoints: 4, teacherNote: BARE_RESULT_NOTE }]);
    expectBalanced(bare, 10, 6, allMet, ["Yöntem"]);
    const conflict = deriveRedPen({ maxPoints: 10, awarded: 0, criteria: allMet, scoreNote: RESULT_CONFLICT_NOTE });
    expect(conflict.earnedStepNotes).toEqual([]);
    expect(conflict.deductionAlerts).toEqual([{ step: "Sonuç", lostPoints: 10, teacherNote: RESULT_CONFLICT_NOTE }]);
  });

  it("tam puan ve kısa çözüm: kırmızı yok; boş cevap: tek kırmızı satır; açıkça yanlış nokta kendi notunu taşır", () => {
    const full = deriveRedPen({ maxPoints: 10, awarded: 10, criteria: criteria.map((row) => ({ ...row, met: true })), scoreNote: SHORT_SOLUTION_FULL_CREDIT });
    expect(full.deductionAlerts).toEqual([]);
    expect(full.earnedStepNotes).toHaveLength(3);
    const blank = deriveRedPen({ maxPoints: 10, awarded: 0, criteria, blank: true });
    expect(blank).toEqual({ earnedStepNotes: [], deductionAlerts: [{ step: "Cevap", lostPoints: 10, teacherNote: RED_PEN_NOTES.blank }] });
    const wrong = deriveRedPen({
      maxPoints: 10,
      awarded: 4,
      criteria: criteria.map((row, index) => (index === 2 ? { ...row, contradicted: true } : row)),
    });
    expect(wrong.deductionAlerts[1]!.teacherNote).toBe(RED_PEN_NOTES.contradicted);
  });

  it("kesirli puanda toplam kaymaz; ölçüt puanı en yüksek puanı tutmasa da kırmızı toplam tutar", () => {
    const odd: RedPenCriterion[] = [
      { criterion: "Birinci nokta", points: 1, met: true },
      { criterion: "İkinci nokta", points: 1, met: false },
      { criterion: "Üçüncü nokta", points: 1, met: false },
    ];
    const pen = deriveRedPen({ maxPoints: 3, awarded: 1.667, criteria: odd, scoreNote: SETUP_OK_ARITHMETIC_NOTE });
    expectBalanced(pen, 3, 1.667, odd);
    const noPoints = deriveRedPen({ maxPoints: 1, awarded: 0, criteria: [{ criterion: "Ana nokta", points: 0, met: false }] });
    expect(redSum(noPoints)).toBe(1000);
    expect(noPoints.deductionAlerts[0]!.step).toBe(RED_PEN_NOTES.generalStep);
  });

  it("gerçek notlandırma zinciriyle: gradeRubricAnswer + adjustScoredAnswer çıktısı dengeli", () => {
    const rubric = [
      { criterion: "Eşitliği kurar", points: 5 },
      { criterion: "Sonucu bulur", points: 5 },
    ];
    const answer = "2x + 3 = 11\n2x = 11 + 3\nx = 7";
    const graded = gradeRubricAnswer(answer, rubric, [{ criterion: "Eşitliği kurar", quote: "2x + 3 = 11" }]);
    const steps = analyzeWorkSteps(answer);
    const tuned = adjustScoredAnswer({ answer, expected: 4, maxPoints: graded.max, modelAnswer: "2x = 8, x = 4", criteria: rubric.map((r) => r.criterion), earned: graded.earned, steps });
    const rows = rubric.map((row) => ({ criterion: row.criterion, points: row.points, met: graded.met.includes(row.criterion) }));
    const pen = deriveRedPen({ maxPoints: graded.max, awarded: tuned.earned, criteria: rows, steps, scoreNote: tuned.step });
    expectBalanced(pen, graded.max, tuned.earned, rows);
    expect(pen.deductionAlerts.length).toBeGreaterThan(0);
  });
});

describe("kayıt ve ekran", () => {
  it("parseRedPen: eski kayıtta (alan yok) null; bozuk satırlar düşer", () => {
    expect(parseRedPen(null)).toBeNull();
    expect(parseRedPen({ met: ["x"], missed: [] })).toBeNull();
    expect(parseRedPen({ earnedStepNotes: [], deductionAlerts: [] })).toBeNull();
    expect(
      parseRedPen({
        earnedStepNotes: ["+2 Puan · Doğru", 7],
        deductionAlerts: [{ step: "Nokta", lostPoints: 3, teacherNote: "Not" }, { step: "", lostPoints: 1, teacherNote: "x" }, { step: "y", lostPoints: -1, teacherNote: "z" }],
      }),
    ).toEqual({ earnedStepNotes: ["+2 Puan · Doğru"], deductionAlerts: [{ step: "Nokta", lostPoints: 3, teacherNote: "Not" }] });
  });

  it("iki notlandırma yolu da satırları kayda yazar; tek model çağrısı kalır; inceleme okur ve çizer", () => {
    const gradeExam = read("src/lib/learning/mock-exam/grade-exam.ts");
    expect(gradeExam.match(/\.\.\.deriveRedPen\(/g)).toHaveLength(2);
    expect(gradeExam.match(/chat\.completions\.create\(/g)).toHaveLength(1);
    expect(read("src/lib/learning/mock-exam/red-pen.ts")).not.toMatch(/openai|chat\.completions|generateJson/);
    expect(read("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx")).toContain("parseRedPen(raw)");
    expect(read("src/components/parity/exam-question-review-client.tsx")).toContain("<RedPenSheet");
  });

  it("kâğıt: yeşil tik satırları ve halkalı kırmızı puanlar, toplam köşede", () => {
    render(
      <RedPenSheet
        redPen={{
          earnedStepNotes: ["+4 Puan · Bağıntıyı doğru kurar"],
          deductionAlerts: [{ step: "Sonucu birimiyle yazar", lostPoints: 2.5, teacherNote: RED_PEN_NOTES.missing }],
        }}
        earned={7.5}
        max={10}
      />,
    );
    const sheet = screen.getByRole("region", { name: "Kırmızı Kalemli Hoca" });
    expect(sheet.textContent).toContain("+4 Puan");
    expect(sheet.textContent).toContain("−2,5 Puan");
    expect(sheet.textContent).toContain("Hoca buradan kırar:");
    expect(sheet.textContent).toContain("7,5 / 10 Puan");
  });

  it("kâğıdın renk çiftleri AA'yı geçer (hesap, iki temada)", () => {
    const css = read("src/styles/red-pen.css");
    const value = (name: string, scope: string) => {
      const block = css.slice(css.indexOf(scope));
      return block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;
    };
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => {
        const c = parseInt(hex.slice(at, at + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    for (const paper of [value("--redpen-paper", ".cp-redpen {"), value("--redpen-paper", ".dark .cp-redpen {")]) {
      for (const ink of ["--redpen-ink", "--redpen-ink-soft", "--redpen-red", "--redpen-green"]) {
        expect(ratio(value(ink, ".cp-redpen {"), paper), `${ink} / ${paper}`).toBeGreaterThanOrEqual(4.5);
      }
      // Satır zeminleri üzerinde de.
      expect(ratio(value("--redpen-red", ".cp-redpen {"), value("--redpen-red-weak", ".cp-redpen {"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(value("--redpen-green", ".cp-redpen {"), value("--redpen-green-weak", ".cp-redpen {"))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
