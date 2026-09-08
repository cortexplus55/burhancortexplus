import { describe, expect, it } from "vitest";
import { trueFalseItemSchema, trueFalseItemsSchema } from "@/lib/learning/true-false";

describe("true/false teaching contract", () => {
  it.each(["Açı nedir?", "Fotosentez nasıl gerçekleşir?", "Osmanlı Devleti ne zaman kuruldu?"])("rejects an open question in any subject: %s", text => {
    expect(trueFalseItemSchema.safeParse({ text, correct: true, explanation: "Konuya ilişkin bir açıklama." }).success).toBe(false);
  });
  it("requires the corrected statement when the claim is false", () => {
    const item = { text: "180° bir tam açıdır.", correct: false, explanation: "Tam açı 360°; doğru açı 180° ölçüsündedir." };
    expect(trueFalseItemSchema.safeParse(item).success).toBe(false);
    expect(trueFalseItemSchema.safeParse({ ...item, correctedStatement: "360° bir tam açıdır." }).success).toBe(true);
  });
  it("rejects duplicate assertions", () => {
    const item = { text: "360° bir tam açıdır.", correct: true, explanation: "Bir tam tur 360° ölçüsündedir." };
    expect(trueFalseItemsSchema.safeParse([item, item, item, item]).success).toBe(false);
  });
});
