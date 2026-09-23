import { describe, expect, it } from "vitest";
import { verifyDocumentAnswer } from "@/lib/ai/document-answer-verification";

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
