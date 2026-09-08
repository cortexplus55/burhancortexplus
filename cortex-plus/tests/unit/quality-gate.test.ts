import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
vi.mock("@/lib/env", () => ({ env: { OPENAI_ADVANCED_MODEL: "review-model" } }));
import { verifyEducationalContent } from "@/lib/ai/quality-gate";

function fixture(values: unknown[]) {
  const create = vi.fn();
  for (const value of values) create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  return { create, input: { client, context: "Tarih sorusu", draft: "ilk taslak", format: "metin" } };
}
describe("educational quality gate", () => {
  it("returns an approved draft and review usage", async () => {
    const { input } = fixture([{ approved: true, issues: [] }]);
    expect(await verifyEducationalContent(input)).toEqual({ content: "ilk taslak", tokensIn: 10, tokensOut: 5 });
  });
  it("rechecks a correction instead of trusting the repair", async () => {
    const { input, create } = fixture([{ approved: false, issues: ["tarih yanlış"] }, { content: "düzeltilmiş" }, { approved: true, issues: [] }]);
    expect((await verifyEducationalContent(input)).content).toBe("düzeltilmiş");
    expect(create).toHaveBeenCalledTimes(3);
  });
  it("never returns a draft rejected twice", async () => {
    const { input, create } = fixture([{ approved: false, issues: ["hata"] }, { content: "hatalı düzeltme" }, { approved: false, issues: ["hata sürüyor"] }]);
    await expect(verifyEducationalContent(input)).rejects.toThrow("doğrulanamadı");
    expect(create).toHaveBeenCalledTimes(3);
  });
  it("fails closed on a malformed reviewer response", async () => {
    const { input } = fixture([{ approved: "yes" }]);
    await expect(verifyEducationalContent(input)).rejects.toThrow();
  });
  it("repairs an invalid activity even when the model approves it", async () => {
    const { input, create } = fixture([{ approved: true, issues: [] }, { content: "geçerli önerme" }, { approved: true, issues: [] }]);
    const validate = (content: string) => content === "geçerli önerme" ? [] : ["Açık uçlu soru doğru/yanlış önermesi değildir."];
    expect((await verifyEducationalContent({ ...input, validate })).content).toBe("geçerli önerme");
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[1][0].messages[0].content).toContain("Açık uçlu soru");
  });
  it("rejects a still-invalid repair even if both model reviews approve", async () => {
    const { input } = fixture([{ approved: true, issues: [] }, { content: "yine hatalı" }, { approved: true, issues: [] }]);
    await expect(verifyEducationalContent({ ...input, validate: () => ["format yanlış"] })).rejects.toThrow("doğrulanamadı");
  });
});
