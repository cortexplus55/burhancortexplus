import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  parseQuizIssues,
  parseTeacherQuiz,
  quizStructureIssues,
  quizSystem,
  quizVerifySystem,
} from "@/lib/learning/teacher-quiz";
import { minimumQuestions, teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";

/*
  Öğretmen test motoru (2 Ekim 2026). Altın denemede KPSS 5/5 ve Termodinamik
  5/7 soru geçti; denetçi "n = 0 hem izobarik hem politropik" gibi iki doğru
  savunulabilen soruları kendisi çözerek yakaladı.
*/
const raw = (text: string, correct = "Yokluk") => ({
  text,
  options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Tek taraflı bağlamazlık"],
  correct,
  multi: false,
  explanation: "Kurucu unsur eksikse işlem hiç doğmamıştır; diğerlerinde işlem doğmuştur.",
  optionWhy: [
    "Kurucu unsur eksik olduğu için işlem hiç doğmamıştır.",
    "Mutlak butlanda işlem doğmuş ama kesin geçersizdir.",
    "Nispi butlan irade sakatlığında iptal hakkı verir.",
    "Tek taraflı bağlamazlıkta işlem onaya kadar askıdadır.",
  ],
  misconceptionTag: "yokluk-butlan karışıklığı",
  learningObjective: "Kurucu unsur eksikliğini yoklukla eşleştirir.",
});

describe("öğretmen test motoru: biçim ve yapı", () => {
  it("model çıktısı soru tipine oturur; metne dokunulmaz", () => {
    const parsed = parseTeacherQuiz({ questions: [raw("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?")] });
    expect(parsed?.[0].correct).toEqual(["Yokluk"]);
    expect(parsed?.[0].text).toBe("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?");
    expect(parseTeacherQuiz({ items: [] })).toBeNull();
  });

  it("sağlam soru yapı denetiminden geçer", () => {
    const [question] = parseTeacherQuiz({ questions: [raw("Nikâh memuru olmadan yapılan evlilik hangi durumdadır?")] })!;
    expect(quizStructureIssues(question)).toEqual([]);
  });

  it("eski kusurlar yakalanır: hepsi şıkkı, sayma sorusu, cevabı veren kök, eksik gerekçe, hesapla çelişen anahtar", () => {
    const hepsi = parseTeacherQuiz({
      questions: [{ ...raw("Hangisi hükümsüzlük türüdür?"), options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Hepsi"] }],
    })![0];
    expect(quizStructureIssues(hepsi).join(" ")).toMatch(/Hepsi/);
    const counting = parseTeacherQuiz({ questions: [raw("Hükümsüzlük kaç ana başlıkta incelenir?")] })![0];
    expect(quizStructureIssues(counting).join(" ")).toMatch(/Sayma/);
    const giveaway = parseTeacherQuiz({ questions: [raw("Tek taraflı bağlamazlık nedir, hangisi tek taraflı bağlamazlıktır?", "Tek taraflı bağlamazlık")] })![0];
    expect(quizStructureIssues(giveaway).join(" ")).toMatch(/cevabı veriyor/);
    const noWhy = parseTeacherQuiz({ questions: [{ ...raw("Nikâh memuru olmadan yapılan evlilik?"), optionWhy: ["tek satır gerekçe yazıldı"] }] })![0];
    expect(quizStructureIssues(noWhy).join(" ")).toMatch(/optionWhy/);
    const exponent = parseTeacherQuiz({
      questions: [{ ...raw("(3⁴)² ifadesinin değeri hangisidir?", "3¹²"), options: ["3⁸", "3¹²", "3⁶", "3¹⁶"] }],
    })![0];
    expect(quizStructureIssues(exponent).join(" ")).toMatch(/hesapla çelişiyor/);
  });

  it("denetçi sorunları soru sırasıyla okunur; ciddiyet yoksa yüksek", () => {
    expect(parseQuizIssues({ issues: [{ question: 2, problem: "İki doğru şık" }, { question: "x", problem: "y" }, { question: 1, severity: "low", problem: "kolay" }] })).toEqual([
      { question: 2, severity: "high", problem: "İki doğru şık", fix: undefined },
      { question: 1, severity: "low", problem: "kolay", fix: undefined },
    ]);
  });

  it("istem: kaynak kuralı, kardeş çeldirici, kendi çözümü; belgesizde doğruluk kuralı; denetçi önce çözer", () => {
    const system = quizSystem("document");
    expect(system).toContain("KAYNAK KURALI (kesin)");
    expect(system).toContain("kardeş terimler");
    expect(system).toContain("Yazmadan önce her soruyu kendin çöz");
    expect(quizSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(quizSystem("document", "gaps")).toContain("TUZAK SORULARI");
    expect(quizVerifySystem("document")).toContain("HER SORUYU ÖNCE KENDİN ÇÖZ");
    expect(quizVerifySystem("topic")).toContain("Belgesi olmayan");
  });
});

describe("öğretmen test motoru: döngü", () => {
  const draft = (n: number) => ({ questions: Array.from({ length: n }, (_, i) => raw(`Soru ${i + 1}: nikâh memuru olmadan yapılan evlilik?`)) });
  const input = { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], count: 5 };

  it("yedekli taslak: denetçinin elediği sorular yerine yedekler geçer, düzeltme turu gerekmez", async () => {
    const calls: string[] = [];
    const ask = vi.fn(async (system: string) => {
      calls.push(system.slice(0, 40));
      if (system.includes("denetçisisin")) return { issues: [{ question: 1, problem: "İki doğru şık" }, { question: 4, problem: "Anahtar yanlış" }] };
      return draft(7);
    });
    const loop = await teacherQuizLoop(ask, input);
    expect(loop.questions).toHaveLength(5);
    expect(loop.rounds).toBe(0);
    expect(loop.questions.map((q) => q.text)).not.toContain("Soru 2: nikâh memuru olmadan yapılan evlilik?");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("yeterli soru kalmazsa yalnız sorunlu sorular düzeltmeye gider", async () => {
    let verify = 0;
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin")) {
        verify += 1;
        return verify === 1 ? { issues: [0, 1, 2, 3].map((question) => ({ question, problem: "Anahtar yanlış" })) } : { issues: [] };
      }
      if (system.startsWith("Sen aynı testi yazan")) return draft(4);
      return draft(7);
    });
    const loop = await teacherQuizLoop(ask, input);
    expect(loop.rounds).toBe(1);
    expect(loop.questions).toHaveLength(5);
  });

  it("asgari soru sayısı", () => {
    expect(minimumQuestions(5)).toBe(3);
    expect(minimumQuestions(8)).toBe(6);
  });
});

describe("rota test düğümünü öğretmen motoruna yollar", () => {
  it("konu testi ve tuzak soruları, bayrakla; çekirdek sayfa ya da belgesiz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('const TEACHER_QUIZ_KINDS = new Set<PlanNodeKind>(["quiz", "gaps"]);');
    expect(route).toContain('env.QUIZ_ENGINE === "teacher"');
    expect(route).toContain("return teacherQuizPayload(input, activity, input.lessonCore ?? null, Math.max(5, quizCount));");
    expect(readFileSync("src/lib/env.ts", "utf8")).toContain('QUIZ_ENGINE: z.enum(["teacher", "legacy"]).default("teacher")');
  });
});
