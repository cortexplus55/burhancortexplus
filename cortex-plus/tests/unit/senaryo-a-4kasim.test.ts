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
