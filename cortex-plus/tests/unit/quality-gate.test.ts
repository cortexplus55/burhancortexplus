import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
vi.mock("@/lib/env", () => ({ env: { OPENAI_ADVANCED_MODEL: "review-model" } }));
import { verifyEducationalContent } from "@/lib/ai/quality-gate";

function fixture(values: unknown[]) {
  const create = vi.fn();
  for (const value of values) {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(value) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  }
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  return {
    create,
    input: { client, context: "Tarih sorusu", draft: "ilk taslak", format: "metin" },
  };
}

describe("educational quality gate", () => {
  it("returns an approved draft and review usage", async () => {
    const { input } = fixture([{ approved: true, issues: [] }]);
    const result = await verifyEducationalContent(input);
    expect(result.content).toBe("ilk taslak");
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(5);
    expect(result.repairAttempted).toBe(false);
  });

  it("rechecks a correction instead of trusting the repair", async () => {
    const { input, create } = fixture([
      { approved: false, issues: ["tarih yanlış"] },
      { content: "düzeltilmiş" },
      { approved: true, issues: [] },
    ]);
    expect((await verifyEducationalContent(input)).content).toBe("düzeltilmiş");
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("never returns a draft rejected twice", async () => {
    const { input, create } = fixture([
      { approved: false, issues: ["hata"] },
      { content: "hatalı düzeltme" },
      { approved: false, issues: ["hata sürüyor"] },
    ]);
    await expect(verifyEducationalContent(input)).rejects.toThrow("doğrulanamadı");
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("fails closed on a malformed reviewer response", async () => {
    const { input } = fixture([{ approved: "yes" }]);
    await expect(verifyEducationalContent(input)).rejects.toThrow();
  });

  it("repairs an invalid activity even when the model approves it", async () => {
    const { input, create } = fixture([
      { approved: true, issues: [] },
      { content: "geçerli önerme" },
      { approved: true, issues: [] },
    ]);
    const validate = (content: string) =>
      content === "geçerli önerme" ? [] : ["Açık uçlu soru doğru/yanlış önermesi değildir."];
    expect((await verifyEducationalContent({ ...input, validate })).content).toBe(
      "geçerli önerme",
    );
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[1][0].messages[0].content).toContain("Açık uçlu soru");
  });

  it("rejects a still-invalid repair even if both model reviews approve", async () => {
    const { input } = fixture([
      { approved: true, issues: [] },
      { content: "yine hatalı" },
      { approved: true, issues: [] },
    ]);
    await expect(
      verifyEducationalContent({ ...input, validate: () => ["format yanlış"] }),
    ).rejects.toThrow("doğrulanamadı");
  });

  it("does not auto-accept a repair that fails independent recheck", async () => {
    const { input, create } = fixture([
      { approved: false, issues: ["yapı"] },
      { content: '{"questions":[]}' },
      { approved: true, issues: [] },
    ]);
    await expect(
      verifyEducationalContent({
        ...input,
        draft: '{"questions":[{"text":"x","options":["a","b"],"correct":"a"}]}',
        independent: (content) => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(content);
          } catch {
            parsed = null;
          }
          const questions =
            parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
              ? ((parsed as { questions: unknown[] }).questions)
              : [];
          return {
            draft: content,
            parsed,
            pedagogyIssues:
              questions.length >= 1 ? [] : ["En az bir soru gerekli (recheck)."],
            minItems: 1,
          };
        },
      }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the reviewer is unavailable", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network down"));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    await expect(
      verifyEducationalContent({
        client,
        context: "ctx",
        draft: "{}",
        format: "json",
        failClosedOnUnavailable: true,
        independent: (content) => ({ draft: content, parsed: {} }),
      }),
    ).rejects.toMatchObject({ reason: "validator_unavailable" });
  });
});
