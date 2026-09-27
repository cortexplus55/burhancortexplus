import { describe, expect, it, vi } from "vitest";
import { analyzePages } from "@/lib/documents/page-analysis";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: async () => ({ ok: false, error: "provider_unavailable" }),
  isPremiumUser: async () => true,
}));

import { buildTopicMapLLM } from "@/lib/documents/topic-map-llm";

describe("document-owned chapter map when the model is unavailable", () => {
  it("retains all ten pediatrics chapters and their physical pages", async () => {
    const chapters = [
      "Büyüme ve Gelişme", "Yenidoğan Dönemi",
      "Beslenme, Vitaminler ve Malnütrisyon", "Solunum Sistemi",
      "Gastroenteroloji ve Dehidratasyon", "Enfeksiyon Hastalıkları",
      "Hematoloji ve Onkoloji", "Nefroloji", "Kardiyoloji",
      "Pediatrik Aciller ve Aşı Mantığı",
    ];
    const analyses = analyzePages(chapters.map((chapter, index) =>
      `${index + 1}. ${chapter}\nBu sayfa ${chapter} konusunu anlatır. ` +
      "Temel kavramlar, ilişkiler ve örnekler sayfanın içeriğinde yer alır.",
    ));
    const result = await buildTopicMapLLM(
      {} as never, "doc", "user", "Pediatri_10_Sayfa.pdf", analyses,
    );
    expect(result?.topics).toHaveLength(10);
    expect(result?.topics.map((topic) => topic.title)).toEqual(chapters);
    expect(result?.topics[8].pageNumbers).toEqual([9]);
    expect(result?.topics[9].pageNumbers).toEqual([10]);
  });
});
