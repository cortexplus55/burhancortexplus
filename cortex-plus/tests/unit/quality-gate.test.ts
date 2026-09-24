import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
vi.mock("@/lib/env", () => ({ env: { OPENAI_ADVANCED_MODEL: "review-model" } }));
import {
  EducationalVerificationError,
  verifyEducationalContent,
} from "@/lib/ai/quality-gate";

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
    await expect(verifyEducationalContent(input)).rejects.toMatchObject({
      repairAttempted: true,
    });
    expect(create).toHaveBeenCalledTimes(3);
    const repairCall = create.mock.calls[1]?.[0] as {
      messages?: { content?: string }[];
    };
    expect(repairCall.messages?.[0]?.content).toContain("Kaynak sayfalarda olmayan formül");
  });

  it("keeps a correct pascal conversion the reviewer calls wrong", async () => {
    const draft = "Örnekte 50000 Pa = 50 kPa yazılır.";
    const { input, create } = fixture([
      {
        approved: false,
        issues: [
          "50000 Pa = 50 kPa dönüşümü yanlış, 50 kPa hatalıdır çünkü 1 kPa = 1000 Pa.",
        ],
      },
    ]);
    const result = await verifyEducationalContent({ ...input, draft });
    expect(result.content).toBe(draft);
    expect(result.repairAttempted).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("still repairs a conversion the arithmetic check confirms is wrong", async () => {
    const { input, create } = fixture([
      { approved: false, issues: ["50000 Pa = 5 kPa dönüşümü yanlış."] },
      { content: "50000 Pa = 50 kPa." },
      { approved: true, issues: [] },
    ]);
    const result = await verifyEducationalContent({
      ...input,
      draft: "50000 Pa = 5 kPa yazılmış.",
    });
    expect(result.content).toBe("50000 Pa = 50 kPa.");
    expect(result.repairAttempted).toBe(true);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("ignores a missing intro section and a bold nit", async () => {
    const draft = '{"overview":"Basınç birim alana gelen kuvvettir."}';
    const { input, create } = fixture([
      {
        approved: false,
        issues: [
          "Giriş bölümü eksik, doğrudan kavram bölümleriyle başlamış.",
          "Anahtar terim koyu değil: Basınç. **iki yıldız** arasına al.",
        ],
      },
    ]);
    const result = await verifyEducationalContent({ ...input, draft });
    expect(result.content).toBe(draft);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("records repairAttempted when the repair still fails", async () => {
    const { input } = fixture([
      { approved: false, issues: ["Kaynakta olmayan formül: PV = nRT"] },
      { content: "yine PV = nRT" },
      { approved: false, issues: ["Kaynakta olmayan formül duruyor"] },
    ]);
    try {
      await verifyEducationalContent(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EducationalVerificationError);
      expect((error as EducationalVerificationError).repairAttempted).toBe(true);
    }
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

  it("accepts a lesson the reviewer only nits for style", async () => {
    const cosmetic = [
      "Çıktı geçerli JSON değil.",
      "Basınç formülünde semboller LaTeX formatına yanlış çevrildi.",
      "mutlak basınç gibi terimler ** ile işaretlenmeli.",
      "Çözüm adım adım ve gerekçeli olmalı; yalnızca sonucu yazma.",
      "En az 2 kontrol sorusu kalmalı; öğretmeyenler çıkarıldı.",
    ];
    const { input, create } = fixture([{ approved: false, issues: cosmetic }]);
    const result = await verifyEducationalContent(input);
    expect(result.content).toBe("ilk taslak");
    expect(result.repairAttempted).toBe(false);
    expect(result.recheckPassed).toBeNull();
    expect(result.issueSeverity.blocking).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects a source error after one repair and records recheck_passed false", async () => {
    const { input } = fixture([
      { approved: false, issues: ["Kaynakta olmayan formül PV = nRT."] },
      { content: "hâlâ PV = nRT" },
      { approved: false, issues: ["İdeal gaz yasası (PV = nRT) dokümanda yer almıyor."] },
    ]);
    await expect(verifyEducationalContent(input)).rejects.toMatchObject({
      repairAttempted: true,
      recheckPassed: false,
      issueSeverity: {
        blocking: expect.arrayContaining([expect.stringMatching(/PV = nRT|İdeal gaz/)]),
      },
    });
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
