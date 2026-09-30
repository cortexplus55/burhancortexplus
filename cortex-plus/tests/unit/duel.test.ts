import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DUEL_QUESTIONS,
  DUEL_RULES,
  cleanDisplayName,
  duelRules,
  duelCode,
  publicQuestions,
  questionPoints,
  scoreDuel,
  toDuelQuestions,
  type DuelQuestion,
} from "@/lib/learning/duel";

const q = (answer: number): DuelQuestion => ({ text: "Soru", options: ["a", "b", "c", "d"], answer });

describe("düello (Astra kuralları, 30 Eylül 2026)", () => {
  it("kurallar Astra'daki üç madde", () => {
    expect(DUEL_RULES[0]).toBe("Her biri için 20 saniyede 7 soru yanıtla.");
    expect(DUEL_RULES[1]).toMatch(/10 puan.*en fazla 5 ek puan.*ikiye katlanır/);
    expect(DUEL_RULES[2]).toMatch(/hesap gerekmiyor/);
    // Doğrulamadan 7'den az soru geçerse kural gerçek sayıyı söyler.
    expect(duelRules(5)[0]).toBe("Her biri için 20 saniyede 5 soru yanıtla.");
  });

  it("puan: doğru 10 + hız bonusu (0–5), süre dolunca 0, son soru ×2", () => {
    expect(questionPoints(true, 0, false)).toBe(15);
    expect(questionPoints(true, 10_000, false)).toBe(13);
    expect(questionPoints(true, 19_999, false)).toBe(10);
    expect(questionPoints(true, 20_000, false)).toBe(0);
    expect(questionPoints(false, 0, false)).toBe(0);
    expect(questionPoints(true, 0, true)).toBe(30);
  });

  it("turun puanı sunucuda cevap anahtarıyla hesaplanıyor", () => {
    const questions = [q(0), q(1), q(2)];
    const result = scoreDuel(questions, [
      { choice: 0, ms: 0 },
      { choice: 3, ms: 1000 },
      { choice: 2, ms: 0 },
    ]);
    expect(result.correct).toBe(2);
    expect(result.score).toBe(15 + 0 + 30);
    expect(result.perQuestion.map((p) => p.answer)).toEqual([0, 1, 2]);
    // Eksik cevap süre dolmuş sayılır.
    expect(scoreDuel(questions, []).score).toBe(0);
  });

  it("tek doğrulu soruları alıyor, çoklu doğruyu atıyor, en fazla 7", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      text: `S${i}`,
      options: ["a", "b", "c", "d"],
      correct: [i === 2 ? "zz" : "b"],
      multi: i === 1,
    }));
    const out = toDuelQuestions(many);
    expect(out).toHaveLength(DUEL_QUESTIONS);
    expect(out.every((item) => item.answer === 1)).toBe(true);
    expect(out.map((item) => item.text)).not.toContain("S1");
    expect(out.map((item) => item.text)).not.toContain("S2");
  });

  it("tarayıcıya giden sorularda cevap yok", () => {
    const shown = publicQuestions([q(2)]);
    expect(shown[0]).toEqual({ text: "Soru", options: ["a", "b", "c", "d"] });
    expect(JSON.stringify(shown)).not.toContain("answer");
  });

  it("kod ve misafir adı temiz", () => {
    expect(duelCode()).toMatch(/^[a-z0-9]{8}$/);
    expect(cleanDisplayName("  Ada\u0000 <b>  ")).toBe("Ada b");
    expect(cleanDisplayName("A")).toBeNull();
    expect(cleanDisplayName("x".repeat(40))).toHaveLength(24);
  });

  it("düello kurmak tablo yoksa kredi düşmeden duruyor; oyun ucu herkese açık ama sınırlı", () => {
    const create = readFileSync("src/app/api/learning/exam-prep/duel/route.ts", "utf8");
    expect(create.indexOf('from("prep_duels").select("id").limit(1)')).toBeLessThan(
      create.indexOf("generateExamQuiz({"),
    );
    // Hak yalnızca düello kurulunca düşer; kurulamazsa iade edilir.
    expect(create).toContain("deferCommit: true");
    // 8 adaydan 7 sağlam soru çıkmıyordu; düello 12 aday istiyor.
    expect(create).toContain("maxQuestions: DUEL_CANDIDATES");
    // Düello gerekçeyi göstermiyor; gerekçe kapısı soruyu düşürmesin.
    expect(create).toContain("hiddenRationale: true");
    // "Kosinüs teoreminin amacı nedir?" gibi iki doğrulu soru canlıya çıktı.
    expect(create).toMatch(/yoruma açık soru yazma/);
    expect(create.indexOf("commitCredits(service, reservationId)")).toBeGreaterThan(
      create.indexOf('from("prep_duels").insert('),
    );
    expect(create.split("refundCredits(service, reservationId)").length - 1).toBe(2);
    const run = readFileSync("src/app/api/duels/[code]/run/route.ts", "utf8");
    expect(run).toContain('guestLimit(request, { scope: "duel-run"');
    expect(run).toContain("scoreDuel(questions, parsed.data.answers)");
    const page = readFileSync("src/app/duello/[code]/page.tsx", "utf8");
    expect(page).toContain("questions={publicQuestions(questions)}");
  });
  it("ayrıştırıcı varsayılan 8 soru tutar, düello için 12 alabilir", async () => {
    const { parseQuizQuestions } = await import("@/lib/learning/exam-quiz");
    const questions = Array.from({ length: 12 }, (_, i) => ({
      text: `Soru ${i + 1}: 2 + ${i} kaçtır?`,
      options: [`${2 + i}`, `${3 + i}`, `${4 + i}`, `${5 + i}`],
      correct: `${2 + i}`,
      multi: false,
    }));
    expect(parseQuizQuestions({ questions })?.length).toBe(8);
    expect(parseQuizQuestions({ questions }, 12)?.length).toBe(12);
  });
});
