/**
 * H2 (15 Kasım 2026, Burhan D2 onayı, sınırlarıyla): şık ayrılabilirliği yalnız doğrulama katmanında, salt kod, bayrak
 * arkasında (`quiz.option_check`). Hatalı soru metni değişmez; elenir, yerine yedek gelir, sayaç günlüğe yazılır.
 * Örnekler farklı derslerden; üretim koduna ders sözcüğü girmez.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPTION_SEPARABILITY_PREFIX,
  QUIZ_OPTION_CHECK_FLAG,
  brokenNeitherNor,
  optionSeparabilityIssues,
  reorderedOptionPair,
} from "@/lib/learning/option-separability";
import { UNSALVAGEABLE_PROBLEM, quizStructureIssues } from "@/lib/learning/teacher-quiz";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

const read = (path: string) => readFileSync(path, "utf8");

/** Canlı G8'in biçimi: doğru çeldiriciler yalnız olumsuzlukla ayrılıyor; C "ne … ne de" + olumsuz fiil. */
const G8 = [
  "Enerji hem yoktan var edilebilir hem de yok edilebilir.",
  "Enerji yoktan var edilemez, ancak var olan enerji yok edilebilir.",
  "Enerji ne yoktan var edilebilir ne de yok edilemez.",
  "Enerji yoktan var edilebilir, ancak var olan enerji yok edilemez.",
  "Enerji yoktan var edilemez ve var olan enerji yok edilemez.",
];

describe('"ne … ne de" yapısında olumsuz fiil', () => {
  it("G8'in C şıkkı yakalanır; olumsuzlukla ayrılan doğru çeldiriciler yakalanmaz", () => {
    expect(G8.filter(brokenNeitherNor)).toEqual([G8[2]]);
    expect(optionSeparabilityIssues(G8)).toHaveLength(1);
  });

  it("öbür derslerde de: olumsuz fiil bozuk, olumlu fiil doğru", () => {
    expect(brokenNeitherNor("Hücre ne bölünür ne de büyümez.")).toBe(true);
    expect(brokenNeitherNor("Hücre ne bölünür ne de büyür.")).toBe(false);
    expect(brokenNeitherNor("Antlaşma ne imzalandı ne de onaylanmadı.")).toBe(true);
    expect(brokenNeitherNor("Antlaşma ne imzalandı ne de onaylandı.")).toBe(false);
    expect(brokenNeitherNor("Bu durumda ne yapılmalı?")).toBe(false); // tek "ne"
  });
});

describe("aynı sözcüklerin yalnız sırası değişmiş iki şık", () => {
  it("yakalanır; sözcüğü farklı şık yakalanmaz", () => {
    expect(reorderedOptionPair(["Osmanlı ve Safevi", "Safevi ile Osmanlı", "Memlük ve Safevi"])).toEqual([
      "Osmanlı ve Safevi",
      "Safevi ile Osmanlı",
    ]);
    expect(reorderedOptionPair(["Mitokondri ve ribozom", "Mitokondri ve lizozom", "Golgi ve ribozom"])).toBeNull();
    // Birebir aynı şık bu denetimin işi değil (duplicateOptionPair).
    expect(reorderedOptionPair(["Kuvvet ve hız", "Kuvvet ve hız"])).toBeNull();
    // Tek sözcüklük şık sıralanamaz.
    expect(reorderedOptionPair(["İvme", "Hız"])).toBeNull();
    // Cümle şıklarında sıra anlamı değiştirir: aynı sözcüklerle zıt iki doğru çeldirici yakalanmaz (G8 B ve D).
    expect(reorderedOptionPair([G8[1]!, G8[3]!])).toBeNull();
    expect(reorderedOptionPair(["Kuvvet artar, ivme azalır", "İvme artar, kuvvet azalır"])).toBeNull();
  });
});

describe("test motoruna bağlantı", () => {
  const question: QuizQuestion = {
    text: "Enerjinin korunumu ilkesine göre hangisi doğrudur?",
    options: G8,
    correct: [G8[4]!],
    multi: false,
    explanation: "Enerji yoktan var edilemez, var olan yok edilemez; yalnız biçim değiştirir.",
  } as QuizQuestion;

  it("bayrak kapalıyken bugünkü kapı (yeni sorun yok)", () => {
    const off = quizStructureIssues(question, { optionCount: 5 });
    expect(off.some((text) => text.startsWith(OPTION_SEPARABILITY_PREFIX))).toBe(false);
  });

  it("bayrak açıkken soru elenir ve son çare kurtarmada geri konmaz", () => {
    const on = quizStructureIssues(question, { optionCount: 5, optionCheck: true });
    const issue = on.find((text) => text.startsWith(OPTION_SEPARABILITY_PREFIX));
    expect(issue).toBeTruthy();
    expect(UNSALVAGEABLE_PROBLEM.test(issue!)).toBe(true);
  });

  it("bayrak okuması, sayaç ve günlük: metin değişmez, yalnız elenir", () => {
    expect(QUIZ_OPTION_CHECK_FLAG).toBe("quiz.option_check");
    const run = read("src/lib/learning/teacher-quiz-run.ts");
    expect(run).toContain("isFeatureEnabled(service, QUIZ_OPTION_CHECK_FLAG, input.userId).catch(() => false)");
    expect(run).toContain("optionCheck: { flagged: loop.optionFlagged }");
    // Model çağrısı eklenmedi: kural salt kod.
    expect(read("src/lib/learning/option-separability.ts")).not.toMatch(/openai|chat\.completions|generateJson/);
  });
});
