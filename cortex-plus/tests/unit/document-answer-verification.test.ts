import { describe, expect, it } from "vitest";
import { normalizeForMatch, verifyDocumentAnswer } from "@/lib/ai/document-answer-verification";

describe("normalizeForMatch — PDF metni ile model alıntısı eşleşir", () => {
  const source =
    '1897\'de Ahmet Midhat Efendi,   Sabah   gazetesinde "Dekadanlar" başlıklı yazısını yayımladı. Dekadan,\nFransızcada "çöküş dönemi sanatçısı" anlamına gelir.';
  it("tipografik tırnak, çoklu boşluk ve satır sonu farkı eşleşmeyi bozmaz", () => {
    const quote = "Sabah gazetesinde “Dekadanlar” başlıklı yazısını yayımladı. Dekadan, Fransızcada “çöküş dönemi sanatçısı” anlamına gelir";
    expect(normalizeForMatch(source)).toContain(normalizeForMatch(quote));
  });
  it("kesme işareti varyantı ve büyük-küçük harf eşitlenir", () => {
    expect(normalizeForMatch(source)).toContain(normalizeForMatch("1897’DE AHMET MİDHAT EFENDİ"));
  });
  it("satır sonu tirelemesi birleştirilir", () => {
    expect(normalizeForMatch("dilin gün-\ndelik olandan")).toContain(normalizeForMatch("dilin gündelik olandan"));
  });
  it("kaynakta olmayan içerik yine eşleşmez", () => {
    expect(normalizeForMatch(source)).not.toContain(normalizeForMatch("Sabah gazetesinde 1898'de"));
  });
});

describe("verifyDocumentAnswer (no LLM paths)", () => {
  it("rejects document claims when evidence is empty", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "X nedir?",
      answer: "Belgeden: foo [1]",
      evidence: [],
      strict: true,
    });
    expect(result.ok).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it("accepts general-only answer without citations in mixed mode", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "X nedir?",
      answer: "Genel bilgiden: fotosentez bitkilerde ışıkla glikoz üretimidir.",
      evidence: [{ reference: 1, documentId: "d", documentName: "a.pdf", pageNumber: 1, chunkId: null, content: "x" }],
      strict: false,
    });
    expect(result.ok).toBe(true);
  });
});
