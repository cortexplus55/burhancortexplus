import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { poolLessonV3 } from "@/lib/content-pool/serve";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

describe("havuz sunumu", () => {
  it("havuz kodları 0 kredi, belge eki 15", () => {
    expect(CREDIT_PRICE_TABLE.POOL_LESSON_VIEW.credits).toBe(0);
    expect(CREDIT_PRICE_TABLE.POOL_CARDS.credits).toBe(0);
    expect(CREDIT_PRICE_TABLE.POOL_QUIZ.credits).toBe(0);
    expect(CREDIT_PRICE_TABLE.DOCUMENT_SUPPLEMENT_GENERATE.credits).toBe(15);
  });
  it("anlatımı V3 ders sınırlarına sığdırır", () => {
    const sections = Array.from({ length: 20 }, (_, i) => ({ outcome_code: `K${i}`, heading: `Başlık ${i}`, explanation: "Cümle. ".repeat(900), key_points: ["a", "b"] }));
    const l = poolLessonV3({ title: "T", overview: "o".repeat(3000), sections, summary: "Bir. İki. Üç.", cards: [] } as never, "Ünite");
    expect(l.screens.length).toBeLessThanOrEqual(16);
    expect(l.overview.length).toBeLessThanOrEqual(1500);
    for (const s of l.screens) for (const b of s.blocks as { text: string }[]) expect(b.text.length).toBeLessThanOrEqual(2500);
    expect(l.summary).toEqual(["Bir.", "İki.", "Üç."]);
  });
});

describe("havuz ekran özeti (lead)", () => {
  it("ilk cümleyi verir, uzunsa kısaltır, boşsa yok", async () => {
    const { screenLead } = await import("@/lib/content-pool/serve");
    expect(screenLead("**Öyküleme** olayları sırayla anlatmaktır. İkinci cümle.")).toBe("Öyküleme olayları sırayla anlatmaktır.");
    expect(screenLead("kısa")).toBeNull();
    expect(screenLead("a ".repeat(200))?.length ?? 0).toBeLessThanOrEqual(200);
  });
});
