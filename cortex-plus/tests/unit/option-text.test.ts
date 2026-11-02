import { describe, expect, it } from "vitest";
import { splitTargetTime, stripOptionLetters } from "@/lib/learning/option-text";
import { blueprintBlocks, blueprintChecks } from "@/lib/content-pool/blueprint";
import { itemSchema, type LessonBody } from "@/lib/content-pool/schema";

// 2 Kasım 2026 canlı ALES sözel dersinde kayıtlı soru (iki şık da kuralları sağlıyordu).
const ales = {
  stem: "A, B ve C; 1, 2 ve 3 numaralı yerlere birer kez yerleştirilecektir. A, 1. yerde olamaz. B, C’den önce gelmelidir. Buna göre hangi eşleştirme zorunludur?",
  answer: "B",
  options: ["A) A-1, B-2, C-3", "B) B-1, A-2, C-3", "C) B-1, C-2, A-3", "D) C-1, B-2, A-3", "E) A-2, C-1, B-3"],
  seconds: 60,
  explanation: "B, C’den önce olmalıdır; bu yüzden C, 1. yerde olamaz.",
};

describe("Şık harfi ve hedef süre", () => {
  it("tüm şıklar sıralı imliyse harf atılır; içerikteki harf korunur", () => {
    expect(stripOptionLetters(ales.options)).toEqual(["A-1, B-2, C-3", "B-1, A-2, C-3", "B-1, C-2, A-3", "C-1, B-2, A-3", "A-2, C-1, B-3"]);
    expect(stripOptionLetters(["a. P", "b. Q", "c. R"])).toEqual(["P", "Q", "R"]);
    expect(stripOptionLetters(["(A) P", "(B) Q"])).toEqual(["P", "Q"]);
    // Sırasız ya da kısmi im: dokunulmaz.
    expect(stripOptionLetters(["A) P", "Q", "C) R"])).toEqual(["A) P", "Q", "C) R"]);
    expect(stripOptionLetters(["B) P", "A) Q"])).toEqual(["B) P", "A) Q"]);
    expect(stripOptionLetters(["A-1, B-2", "B-1, A-2"])).toEqual(["A-1, B-2", "B-1, A-2"]);
  });
  it("hedef süre satırı kökten ayrılır", () => {
    expect(splitTargetTime("⏱ Hedef süre: 45 sn\nİlk sırada kim var?")).toEqual({ seconds: 45, prompt: "İlk sırada kim var?" });
    expect(splitTargetTime("İlk sırada kim var?")).toEqual({ seconds: null, prompt: "İlk sırada kim var?" });
  });
  it("iskelet sorusu ekrana harfsiz şıkla, cevap harfi doğru dizine eşlenerek gelir", () => {
    const check = blueprintBlocks({ check: ales }, "akil").find((b) => b.type === "check") as { check: { options: string[]; answerIndex: number; prompt: string } };
    expect(check.check.options[0]).toBe("A-1, B-2, C-3");
    expect(check.check.answerIndex).toBe(1);
    expect(splitTargetTime(check.check.prompt).seconds).toBe(60);
  });
  it("soru bankası şıkları da harfsiz kaydedilir", () => {
    const item = itemSchema.parse({ outcome_code: "X.1", difficulty: "easy", stem: "Hangisi doğrudur sorusu?", choices: ["A) P", "B) Q", "C) R", "D) S", "E) T"], answer: 0, explanation: "Açıklama metni burada." });
    expect(item.choices).toEqual(["P", "Q", "R", "S", "T"]);
  });
  it("iskelet soruları denetçiye aday olarak çıkarılır", () => {
    const lesson = { sections: [{ outcome_code: "ALES.DAZ.7.b ", blueprint: { check: ales } }, { outcome_code: "X", blueprint: {} }] } as unknown as LessonBody;
    expect(blueprintChecks(lesson)).toEqual([{ outcome_code: "ALES.DAZ.7.b", stem: ales.stem, choices: stripOptionLetters(ales.options), answer: 1, explanation: ales.explanation }]);
  });
});
