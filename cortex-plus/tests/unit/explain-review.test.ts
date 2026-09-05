import { describe, expect, it } from "vitest";
import {
  MIN_WORDS,
  buildExplainPrompt,
  explainSchema,
  isLongEnough,
  wordCount,
} from "@/lib/learning/explain-review";

describe("anlatarak öğren — uzunluk eşiği", () => {
  it("kelimeleri boşluğa göre sayar, satır sonu da boşluktur", () => {
    expect(wordCount("bir iki üç")).toBe(3);
    expect(wordCount("bir\niki\t üç  dört")).toBe(4);
    expect(wordCount("   ")).toBe(0);
  });

  it("kısa anlatımı geçirmez", () => {
    // Üç kelimelik anlatımı modele göndermek hem parayı hem öğrencinin
    // zamanını harcar; dönecek cevap zaten "daha çok anlat" olurdu.
    expect(isLongEnough("fotosentez işte")).toBe(false);
  });

  it("eşiğe ulaşan anlatımı geçirir", () => {
    const text = Array.from({ length: MIN_WORDS }, (_, i) => `kelime${i}`).join(" ");
    expect(isLongEnough(text)).toBe(true);
  });
});

describe("anlatarak öğren — istem", () => {
  const prompt = buildExplainPrompt("Fotosentez", "Bitkiler güneşten enerji alır.");

  it("konuyu ve anlatımı taşır", () => {
    expect(prompt).toContain("Konu: Fotosentez");
    expect(prompt).toContain("Bitkiler güneşten enerji alır.");
  });

  it("not vermemesini açıkça söyler", () => {
    // Puan verilirse öğrenci puana bakıp geçiyor; bu özelliğin işi
    // neyi anlamadığını göstermek.
    expect(prompt).toContain("Not verme, puan verme");
  });

  it("övgü cümlesi istemez", () => {
    expect(prompt).toContain("Övgü cümlesi kurma");
  });
});

describe("anlatarak öğren — model yanıtı", () => {
  it("eksiksiz yanıtı kabul eder", () => {
    const parsed = explainSchema.safeParse({
      verdict: "kismen",
      summary: "Ana fikri kurmuşsun ama enerji dönüşümünü atlamışsın.",
      gaps: [{ point: "güneşten enerji alır", why: "Enerjinin neye çevrildiği yok." }],
      missed: ["klorofil"],
      followUp: "Bitki karanlıkta neden fotosentez yapamaz?",
    });
    expect(parsed.success).toBe(true);
  });

  it("eksik listeleri boş dizi sayar", () => {
    const parsed = explainSchema.safeParse({
      verdict: "anladin",
      summary: "Tamam.",
      followUp: "Peki gece ne olur?",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.gaps).toEqual([]);
      expect(parsed.data.missed).toEqual([]);
    }
  });

  it("tanımsız bir karar tipini reddeder", () => {
    const parsed = explainSchema.safeParse({
      verdict: "harika",
      summary: "x",
      followUp: "y",
    });
    expect(parsed.success).toBe(false);
  });

  it("sınama sorusu olmadan geçmez", () => {
    // Soru, bu özelliğin öğrettiği kısım; eksikse sonuç ekranı bir
    // değerlendirme değil, bir yorum olurdu.
    const parsed = explainSchema.safeParse({
      verdict: "anladin",
      summary: "Tamam.",
    });
    expect(parsed.success).toBe(false);
  });
});
