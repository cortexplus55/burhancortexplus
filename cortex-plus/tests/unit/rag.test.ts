import { describe, expect, it } from "vitest";
import { chunkText, extractText } from "@/lib/rag/pipeline";

describe("rag chunking", () => {
  it("returns an empty list for blank input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("keeps short text in a single chunk", () => {
    expect(chunkText("Türev kuralları özeti")).toHaveLength(1);
  });

  it("splits long text into overlapping chunks", () => {
    const chunks = chunkText("a".repeat(3000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(1200);
  });
});

describe("text extraction", () => {
  it("reads plain text files", async () => {
    const result = await extractText(Buffer.from("ders notu", "utf8"), "text/plain");
    expect(result.ok).toBe(true);
    expect(result.pages[0]).toContain("ders notu");
  });

  it("reports unsupported types instead of throwing", async () => {
    const result = await extractText(Buffer.from(""), "image/png");
    expect(result.ok).toBe(false);
    expect(result.pages).toEqual([]);
  });
});
