import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  oralStructureIssues,
  oralTeacherSystem,
  oralVerifySystem,
  parseOral,
  parseTrueFalse,
  teacherTrueFalseLoop,
  trueFalseStructureIssues,
  trueFalseSystem,
  trueFalseVerifySystem,
} from "@/lib/learning/teacher-practice";

/*
  Doğru/yanlış ve sözlü deneme öğretmen motoru (2 Ekim 2026). Altın denemede
  KPSS s.5–9'dan 8/8 önerme ve 3/3 sözlü soru ilk taslakta geçti (4 çağrı,
  0,005 $). Eski sözlü yol beklenen nokta yoksa kaynaktan cümle yapıştırıyordu.
*/
describe("doğru / yanlış", () => {
  it("önermeler oturur; soru biçimi, eksik düzeltme ve etiket yakalanır", () => {
    const items = parseTrueFalse({
      items: [
        { text: "Kurucu unsuru olmayan işlem hiç doğmamış sayılır.", correct: true, explanation: "Yoklukta işlem hiç doğmaz.", misconceptionTag: "yokluk" },
        { text: "Mutlak butlan nedir?", correct: false, explanation: "Soru biçiminde yazılmış önerme.", misconceptionTag: "x" },
        { text: "Nispi butlanda işlem kendiliğinden geçersizdir.", correct: false, explanation: "İptal hakkı gerekir; kendiliğinden geçersiz değildir." },
      ],
    })!;
    expect(items).toHaveLength(3);
    expect(trueFalseStructureIssues(items[0])).toEqual([]);
    expect(trueFalseStructureIssues(items[1]).join(" ")).toMatch(/Soru değil/);
    const third = trueFalseStructureIssues(items[2]).join(" ");
    expect(third).toMatch(/correctedStatement/);
    expect(third).toMatch(/misconceptionTag/);
  });

  it("istem gerçek hatayı ister; denetçi önce kendisi değerlendirir", () => {
    expect(trueFalseSystem("document")).toContain("öğrencinin GERÇEKTEN yaptığı hatayı");
    expect(trueFalseSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(trueFalseVerifySystem("document")).toContain("HER ÖNERMEYİ ÖNCE KENDİN DEĞERLENDİR");
  });

  it("döngü: hem doğru hem yanlış önerme var mı söylenir", async () => {
    const item = (index: number, correct: boolean) => ({
      text: `Önerme ${index}: yokluk ile butlan ayrımı böyledir.`,
      correct,
      explanation: "Gerekçe cümlesi yeterince uzun.",
      ...(correct ? {} : { correctedStatement: `Önerme ${index} doğru hâli.` }),
      misconceptionTag: "ayrım",
    });
    const ask = vi.fn(async (system: string) =>
      system.includes("denetçisisin") ? { issues: [] } : { items: Array.from({ length: 10 }, (_, i) => item(i, i % 2 === 0)) },
    );
    const loop = await teacherTrueFalseLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "…" }], count: 8 });
    expect(loop.items).toHaveLength(8);
    expect(loop.mixed).toBe(true);
  });
});

describe("sözlü deneme", () => {
  it("sorular oturur; puan etiketi ve kısa örnek cevap yakalanır", () => {
    const [good, bad] = parseOral({
      questions: [
        { prompt: "Kesin hükümsüzlük ile iptal edilebilirliği karşılaştırın.", rubricCriteria: ["Ayıran ölçütü söyler"], expectedPoints: ["Kesin hükümsüzlükte işlem baştan geçersizdir."], modelAnswer: "Kesin hükümsüzlükte işlem baştan geçersizdir; iptal edilebilirlikte iptal hakkı kullanılır." },
        { prompt: "Yokluğu açıklayın lütfen burada.", rubricCriteria: [], expectedPoints: ["2 puan"], modelAnswer: "Kısa." },
      ],
    })!;
    expect(oralStructureIssues(good)).toEqual([]);
    const issues = oralStructureIssues(bad).join(" ");
    expect(issues).toMatch(/puan etiketi/);
    expect(issues).toMatch(/rubricCriteria/);
    expect(issues).toMatch(/modelAnswer çok kısa/);
  });

  it("istem ve denetim", () => {
    expect(oralTeacherSystem("document")).toContain("Tek kelimelik ezber sorusu ve sayma sorusu yok");
    expect(oralVerifySystem("document")).toContain("Her soruyu önce kendin cevapla");
  });
});

describe("rota doğru/yanlış ve sözlüyü öğretmen motoruna yollar", () => {
  it("yalnız öğretmen motoru; doğru/yanlış çekirdek sayfadan, sözlü kaynak bloğundan", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('"podcast", "true_false"]);');
    expect(route).toContain("return teacherTrueFalsePayload(input, activity, core);");
    expect(route).toContain("return teacherOralPayload(input, activity, input.oralQuestionCount ?? Math.min(8, Math.max(3, quizCount)));");
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });
});
