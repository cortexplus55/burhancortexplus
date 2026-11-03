import { describe, expect, it } from "vitest";
import { oralDraftsFromPool } from "@/lib/content-pool/oral-from-pool";

const section = (heading: string) => ({
  heading,
  explanation: "Birinci cümle. İkinci cümle. Üçüncü cümle. Dördüncü cümle. Beşinci cümle.",
  key_points: ["Ana nokta bir uzun cümle", "Ana nokta iki"],
  common_mistakes: ["Sık hata"],
  worked_example: "Örnek",
});

describe("oralDraftsFromPool", () => {
  it("doğrulanmış bölümlerden model çağrısız soru yazar", () => {
    const lessons = [
      { sections: [section("A"), section("B"), section("C")] },
      { sections: [section("D"), section("E")] },
    ] as never;
    const drafts = oralDraftsFromPool(lessons, 5);
    expect(drafts.length).toBe(5);
    for (const d of drafts) {
      expect((d.prompt ?? "").length).toBeGreaterThan(10);
      expect(d.expectedPoints?.length).toBeGreaterThan(0);
      expect(d.modelAnswer).not.toContain("Beşinci");
      expect(d.hint).not.toBe(d.expectedPoints?.[0]);
    }
    expect(new Set(drafts.map((d) => d.prompt)).size).toBe(5);
  });
  it("bölüm yoksa boş döner", () => {
    expect(oralDraftsFromPool([] as never, 5)).toEqual([]);
  });
});
