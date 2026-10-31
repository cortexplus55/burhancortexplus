import { describe, expect, it } from "vitest";
import { stripListMarker } from "@/lib/text/list-marker";
import { normalizeSteps } from "@/lib/learning/exam-quiz";
import { renderMarkdownToHtml } from "@/lib/markdown";
import {
  buildCramSheet,
  clipWeakSpotText,
  mistakeCramText,
  reviewItemCramText,
  trueFalseCorrection,
} from "@/lib/learning/cram-sheet";

describe("binlik ayraçlı sayılar liste numarası sanılmaz", () => {
  it.each([
    ["12.000 + 38.000 = 50.000 TL.", "12.000 + 38.000 = 50.000 TL."],
    ["50.000 − 9.000 = 41.000 TL.", "50.000 − 9.000 = 41.000 TL."],
    ["1.250,50 TL ödenir", "1.250,50 TL ödenir"],
    ["12. 000 TL", "12. 000 TL"],
    ["12) 000", "12) 000"],
    ["10 - 3 = 7", "10 - 3 = 7"],
    ["1. 12.000 + 38.000 = 50.000", "12.000 + 38.000 = 50.000"],
    ["2) Toplamı bul", "Toplamı bul"],
    ["3. adım: farkı al", "farkı al"],
    ["Adım 4: oranla", "oranla"],
    ["3. adımda oran bulunur", "adımda oran bulunur"],
  ])("%s", (input, expected) => {
    expect(stripListMarker(input)).toBe(expected);
  });

  it("çözüm adımları rakamı yemez", () => {
    expect(normalizeSteps(["12.000 + 38.000 = 50.000 TL.", "50.000 − 9.000 = 41.000 TL.", "3) 1.250,50 TL kalır"])).toEqual([
      "12.000 + 38.000 = 50.000 TL.",
      "50.000 − 9.000 = 41.000 TL.",
      "1.250,50 TL kalır",
    ]);
  });

  it("markdown: sayı satırları ve yapışık liste", () => {
    const html = renderMarkdownToHtml("Toplam:\n\n12.000 + 38.000 = 50.000 TL.\n50.000 − 9.000 = 41.000 TL.");
    expect(html).toContain("12.000 + 38.000");
    expect(html).toContain("50.000 − 9.000");
    const glued = renderMarkdownToHtml("Şöyle:1. Toplam 50.000 TL. 2. Fark 25.000 TL.");
    expect(glued).toContain("<ol");
    expect(glued).toContain("Toplam 50.000 TL.");
    expect(glued).toContain("Fark 25.000 TL.");
    const list = renderMarkdownToHtml("1. birinci\n2. ikinci");
    expect(list).toContain("<li>birinci</li>");
  });
});

describe("sınav sabahı: düzeltme hiç çıplak kalmaz", () => {
  const prompt = "Muhasebe Uygulama Genel Tebliği'ne göre hesap sınıfı sayısı 12'dir.";
  it("D/Y anahtarı cümleye çevrilir", () => {
    expect(trueFalseCorrection("Doğru")).toBe("Bu ifade doğrudur.");
    expect(trueFalseCorrection("Y")).toBe("Bu ifade yanlıştır.");
    expect(trueFalseCorrection("12")).toBeNull();
    expect(reviewItemCramText({ prompt, trueFalse: true, correct: ["Yanlış"] })).toBe(`${prompt} → Doğrusu: Bu ifade yanlıştır.`);
    expect(reviewItemCramText({ prompt, trueFalse: true, correct: ["Doğru"] })).toBe(`${prompt} → Doğrusu: Bu ifade doğrudur.`);
    expect(reviewItemCramText({ prompt, trueFalse: true, correct: [] })).toBeNull();
    expect(mistakeCramText(prompt, "Doğru")).toBe(`${prompt} → Doğrusu: Bu ifade doğrudur.`);
    expect(mistakeCramText(prompt, "B) 10")).toBe(`${prompt} → Doğrusu: B) 10`);
    expect(mistakeCramText(prompt, " ")).toBeNull();
  });

  it("uzun soru kırpılırken düzeltme korunur", () => {
    const long = `${"Uzun bir soru metni ".repeat(15)}→ Doğrusu: Bu ifade yanlıştır.`;
    const out = clipWeakSpotText(long);
    expect(out.length).toBeLessThanOrEqual(175);
    expect(out.endsWith("→ Doğrusu: Bu ifade yanlıştır.")).toBe(true);
  });

  it("boş düzeltmeli satır kâğıda girmez", () => {
    const sheet = buildCramSheet({ topics: [], lessons: [], weakSpots: [{ text: `${prompt} → Doğrusu:`, topic: null }, { text: `${prompt} →`, topic: null }] } as never);
    expect(sheet.weakSpots).toHaveLength(0);
  });
});
