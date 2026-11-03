import { describe, expect, it } from "vitest";
import { cleanMathGlyphs } from "@/lib/curriculum/math-glyphs";
import { oralDraftsFromPool } from "@/lib/content-pool/oral-from-pool";
import type { LessonBody } from "@/lib/content-pool/schema";
import { readNoteRuleWarnings } from "@/lib/learning/note-rule-check";
import { SOURCE_CONFLICT_RULE } from "@/lib/learning/teacher-lesson";

describe("genel düzeltmeler (4 Kasım 2026)", () => {
  it("ikilenmiş italik harfleri düzeltir", () => {
    expect(cleanMathGlyphs("𝑥𝑥 + 𝑦𝑦 = 𝑧𝑧")).toBe("x + y = z");
    expect(cleanMathGlyphs("düz metin")).toBe("düz metin");
  });

  it("sözlü hata sorusu hatayı adıyla verir ve yalnız onun düzeltmesini bekler", () => {
    const lesson = {
      sections: [
        { heading: "Konu A", explanation: "Birinci açıklama.", key_points: ["Birinci nokta"] },
        {
          heading: "Konu B",
          explanation: "İkinci açıklama.",
          key_points: ["nokta 1", "nokta 2"],
          common_mistakes: ["a + b ifadesini a · b sanmak. Doğrusu: a + b toplamdır", "İki terimi karıştırmak"],
        },
      ],
      cards: [],
    } as unknown as LessonBody;
    const mistake = oralDraftsFromPool([lesson], 2)[1]!;
    expect(mistake.prompt).toContain("a + b ifadesini a · b sanmak");
    expect(mistake.expectedPoints).toEqual(["a + b toplamdır"]);
    expect(mistake.rubricCriteria).toEqual(["a + b toplamdır"]);
  });
});

describe("not denetimi: LaTeX OCR metninde model uyarısı", () => {
  const ocr = "Tanım: \\(E = m \\cdot c^3\\)\nAyrıca: \\(x < y\\)";
  it("LaTeX OCR metninde modelin bulduğu yanlış formül atılmaz", () => {
    const out = readNoteRuleWarnings({ items: [{ found: "E = m · c^3", standard: "E = m · c²", confidence: "yuksek" }] }, ocr);
    expect(out).toEqual([{ id: "model", found: "E = m · c^3", standard: "E = m · c²" }]);
  });
  it("notta olmayan eşitlik yine atılır", () => {
    expect(readNoteRuleWarnings({ items: [{ found: "F = m/a", standard: "F = m·a", confidence: "yuksek" }] }, ocr)).toEqual([]);
  });
  it("çelişki kuralı belgedeki sayısal kuralları korur ve konuya özel örnek taşımaz", () => {
    expect(SOURCE_CONFLICT_RULE).toMatch(/sayısal kurallar/);
    expect(SOURCE_CONFLICT_RULE).not.toMatch(/\d/);
  });
});

describe("ders tahtası: ';' ve sınıflama etiketi", () => {
  it("bağıntısız cümle ve 'a < b: durum' sırası bölünmez", async () => {
    const { layoutBoard } = await import("@/lib/learning/lesson-board");
    const t =
      "**Toplam** S = a·b·c bağıntısıyla hesaplanır; **sıra önemsizdir**. Değer küçükse ilk durum, büyükse son durum: **a < b: birinci; a = b: ikinci; a > b: üçüncü**.";
    const lines = layoutBoard(t).map((l) => l.text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("sıra önemsizdir");
    expect(lines[1]).toContain("a < b: birinci; a = b: ikinci; a > b: üçüncü");
  });
});
