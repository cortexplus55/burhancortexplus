import { describe, expect, it } from "vitest";
import { cleanMathGlyphs } from "@/lib/curriculum/math-glyphs";
import { oralDraftsFromPool } from "@/lib/content-pool/oral-from-pool";
import type { LessonBody } from "@/lib/content-pool/schema";

describe("Senaryo A (4 Kasım 2026)", () => {
  it("ikilenmiş italik harfleri düzeltir", () => {
    expect(cleanMathGlyphs("b) 𝑝𝑝 ⇒ 𝑞𝑞 ≡ 𝑝𝑝′ ∨ 𝑞𝑞 olduğu")).toBe("b) p ⇒ q ≡ p′ ∨ q olduğu");
    expect(cleanMathGlyphs("𝐴𝐴 ∪ 𝐴𝐴′ = 𝐸𝐸")).toBe("A ∪ A′ = E");
    expect(cleanMathGlyphs("düz metin")).toBe("düz metin");
  });

  it("sözlü hata sorusu hatayı adıyla verir ve yalnız onun düzeltmesini bekler", () => {
    const lesson = {
      sections: [
        { heading: "Önerme", explanation: "Önerme kesin hüküm bildiren ifadedir.", key_points: ["Önerme doğru ya da yanlıştır"] },
        {
          heading: "Bileşik önermeler",
          explanation: "Bağlaçlarla kurulur.",
          key_points: ["∧ ve", "∨ veya", "De Morgan kuralı"],
          common_mistakes: ["(p ∧ q)′ ifadesini p′ ∧ q′ sanmak. Doğrusu: (p ∧ q)′ ≡ p′ ∨ q′", "Ya da ile veya karıştırmak"],
        },
      ],
      cards: [],
    } as unknown as LessonBody;
    const drafts = oralDraftsFromPool([lesson], 2);
    const mistake = drafts[1]!;
    expect(mistake.prompt).toContain("(p ∧ q)′ ifadesini p′ ∧ q′ sanmak");
    expect(mistake.expectedPoints).toEqual(["(p ∧ q)′ ≡ p′ ∨ q′"]);
    expect(mistake.rubricCriteria).toEqual(["(p ∧ q)′ ≡ p′ ∨ q′"]);
  });
});

import { readNoteRuleWarnings } from "@/lib/learning/note-rule-check";
import { SOURCE_CONFLICT_RULE } from "@/lib/learning/teacher-lesson";

describe("Senaryo B1: el notu OCR'ında yanlış formül", () => {
  const ocr = "Kaldırma kuvveti: \\(Fk = Vbatan \\cdot dcisim \\cdot g\\)\nYüzer: \\(dc < ds\\)";
  it("LaTeX OCR metninde modelin bulduğu yanlış formül atılmaz", () => {
    const out = readNoteRuleWarnings(
      { items: [{ found: "Fk = Vbatan · dcisim · g", standard: "Fk = Vbatan · dsıvı · g", confidence: "yuksek" }] },
      ocr,
    );
    expect(out).toEqual([{ id: "model", found: "Fk = Vbatan · dcisim · g", standard: "Fk = Vbatan · dsıvı · g" }]);
  });
  it("notta olmayan eşitlik yine atılır", () => {
    expect(readNoteRuleWarnings({ items: [{ found: "F = m/a", standard: "F = m·a", confidence: "yuksek" }] }, ocr)).toEqual([]);
  });
  it("çelişki kuralı hocanın sayısal kurallarını korur", () => {
    expect(SOURCE_CONFLICT_RULE).toMatch(/g = 10/);
  });
});

describe("B5 ders tahtası: ';' ve sınıflama etiketi", () => {
  it("bağıntısız cümle ve 'dc < ds: yüzer' sırası bölünmez", async () => {
    const { layoutBoard } = await import("@/lib/learning/lesson-board");
    const t =
      "**Sıvı basıncı** P = d·g·h bağıntısıyla hesaplanır; **kap şekli önemsizdir**. Cismin yoğunluğu küçükse yüzer, büyükse batar: **dc < ds: yüzer; dc = ds: askıda; dc > ds: batar**.";
    const lines = layoutBoard(t).map((l) => l.text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("kap şekli önemsizdir");
    expect(lines[1]).toContain("dc < ds: yüzer; dc = ds: askıda; dc > ds: batar");
  });
});

describe("B8 klasik puanlama: eşdeğer kesir zinciri", () => {
  it("30/24 = 5/4 = 1,25 doğru sonuç tam puan alır", async () => {
    const { adjustScoredAnswer } = await import("@/lib/learning/mock-exam/grade");
    const m = "X'in eğimi 30 kPa ÷ 3 m = 10 kPa/m, Y'ninki 24 kPa ÷ 3 m = 8 kPa/m’dir. dₓ/dᵧ = 10/8 = 1,25’tir.";
    const r = adjustScoredAnswer({ answer: "d_X/d_Y = 30/24 = 5/4 = 1,25", expected: null, maxPoints: 10, modelAnswer: m, earned: 6.5 });
    expect(r.earned).toBe(10);
  });
  it("çıplak sonuç yine sınırlı kalır", async () => {
    const { adjustScoredAnswer } = await import("@/lib/learning/mock-exam/grade");
    const r = adjustScoredAnswer({ answer: "1,25", expected: 1.25, maxPoints: 10, modelAnswer: "d = 10/8 = 1,25", criteria: ["eğim d·g"], earned: 10 });
    expect(r.earned).toBeLessThan(10);
  });
});
