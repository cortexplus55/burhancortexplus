import { describe, expect, it } from "vitest";
import { chainHolds, looksStrippedStep, recoverStrippedStep, repairStoredSteps } from "@/lib/learning/step-repair";
import { normalizeQuizQuestion } from "@/lib/learning/exam-quiz";
import { clipWeakSpotText } from "@/lib/learning/cram-sheet";

describe("işlem zinciri (binlik ayraçlı)", () => {
  it.each([
    ["12.000 + 38.000 = 50.000 TL.", true],
    ["000 + 38.000 = 50.000 TL.", false],
    ["50.000 − 9.000 = 41.000 TL.", true],
    ["1.250,50 + 1 = 1.251,50 TL", true],
    ["4 × 2.500 = 10.000", true],
    ["Toplam maliyet hesaplanır", null],
  ] as const)("%s", (step, expected) => expect(chainHolds(step)).toBe(expected));
});

describe("bozuk adım tanıma: yanlış alarm yok", () => {
  it.each([
    "500 + 1.000 = 1.500 TL",
    "250 × 4 = 1.000",
    "120 km yol 2 saatte alınır",
    "12.000 + 38.000 = 50.000 TL.",
    "1.250,50 TL ödenir",
    "Satış tutarı 41.000 TL olur",
  ])("%s bozuk sayılmaz", (step) => expect(looksStrippedStep(step)).toBe(false));
  it.each(["000 + 38.000 = 50.000 TL.", "000 − 9.000 = 41.000 TL.", "000 TL vergi eklenir", "500 − 9.000 = 41.000 TL."])(
    "%s bozuk sayılır",
    (step) => expect(looksStrippedStep(step)).toBe(true),
  );
});

describe("kayıp sayı onarımı", () => {
  const context = "SMM: 12.000 TL stok, 38.000 TL alış, 9.000 TL iade. SMM kaç TL'dir?";
  it("canlıdaki örnek: işlemden tek aday", () => {
    expect(recoverStrippedStep("000 + 38.000 = 50.000 TL.", context)).toBe("12.000 + 38.000 = 50.000 TL.");
    expect(recoverStrippedStep("000 − 9.000 = 41.000 TL.", context)).toBe("50.000 − 9.000 = 41.000 TL.");
    expect(recoverStrippedStep("250.000 + 750.000 = 2.000.000", "")).toBe("1.250.000 + 750.000 = 2.000.000");
  });
  it("işlem yoksa bağlamda tek geçen sayı", () => {
    expect(recoverStrippedStep("000 TL vergi eklenir", "Vergi 3.000 TL'dir.")).toBe("3.000 TL vergi eklenir");
    expect(recoverStrippedStep("000 TL vergi eklenir", "3.000 TL ve 5.000 TL")).toBeNull();
    expect(recoverStrippedStep("000 TL vergi eklenir", "")).toBeNull();
  });
  it("onarılamayan adım varsa adımlar gizlenir, sağlamlar dokunulmaz", () => {
    expect(repairStoredSteps(["000 + 38.000 = 50.000 TL.", "000 − 9.000 = 41.000 TL."], context)).toEqual([
      "12.000 + 38.000 = 50.000 TL.",
      "50.000 − 9.000 = 41.000 TL.",
    ]);
    expect(repairStoredSteps(["000 TL vergi eklenir", "Toplam bulunur"], "")).toBeUndefined();
    const fine = ["500 + 1.000 = 1.500 TL", "1.500 × 2 = 3.000 TL"];
    expect(repairStoredSteps(fine, "")).toEqual(fine);
  });
  it("kayıtlı soru okunurken onarılır; açıklama kalır", () => {
    const question = normalizeQuizQuestion({
      text: "Dönem başı stok 12.000 TL, alış 38.000 TL, alış iadesi 9.000 TL. SMM kaç TL'dir?",
      options: ["41.000 TL", "50.000 TL", "29.000 TL", "59.000 TL"],
      correct: "41.000 TL",
      explanation: "SMM = DBS + Alış − İade.",
      steps: ["000 + 38.000 = 50.000 TL.", "000 − 9.000 = 41.000 TL."],
    });
    expect(question?.steps).toEqual(["12.000 + 38.000 = 50.000 TL.", "50.000 − 9.000 = 41.000 TL."]);
    const hidden = normalizeQuizQuestion({
      text: "Soru?",
      options: ["a", "b"],
      correct: "a",
      explanation: "Açıklama.",
      steps: ["000 TL eklenir", "Sonuç bulunur"],
    });
    expect(hidden?.steps).toBeUndefined();
    expect(hidden?.explanation).toBe("Açıklama.");
  });
});

describe("sınav sabahı: düzeltme ortasında üç nokta yok", () => {
  it("kısa düzeltme tam, zincir içinden bölünmez", () => {
    const prompt = "Muhasebenin temel işlevlerinin doğru sırası hangisidir? ".repeat(3).trim();
    const correction = "Kaydetme → sınıflandırma → özetleme → raporlama → analiz-yorumlama";
    const out = clipWeakSpotText(`${prompt} → Doğrusu: ${correction}`);
    expect(out.endsWith(`→ Doğrusu: ${correction}`)).toBe(true);
    expect(out.indexOf("…")).toBeLessThan(out.indexOf("Doğrusu"));
  });
  it("uzun düzeltme temiz sınırda biter", () => {
    const correction = Array.from({ length: 12 }, (_, i) => `adım${i + 1} uygulanır`).join(" → ");
    const out = clipWeakSpotText(`Soru metni → Doğrusu: ${correction}`);
    expect(out).toMatch(/uygulanır …$/);
    expect(out).not.toMatch(/→\s*…/);
  });
});
