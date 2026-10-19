import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS } from "@/lib/parity/tools";

/*
  19 Ekim 2026: Araçlar'daki test ve kart kartları yalnız konu yazdıran eski sayfalara (/quizler,
  /flashcardlar) gidiyordu; belge seçebilen stüdyolar ayrı adresteydi. Doğru/yanlış stüdyosu listede
  yoktu. Ücretsiz günlük haktan büyük araçlar ücretsiz hesapta "Plus" rozetli.
*/
describe("Araçlar kısayolları", () => {
  it("test, kartlar ve doğru/yanlış belge seçebilen stüdyolara gider", () => {
    const href = (id: string) => TOOLS.find((tool) => tool.id === id)?.href;
    expect(href("quiz")).toBe("/studio/quiz");
    expect(href("flashcard")).toBe("/studio/flashcard");
    expect(href("dogru-yanlis")).toBe("/studio/dogru-yanlis");
    for (const tool of TOOLS.filter((t) => t.href.startsWith("/studio/"))) {
      expect(existsSync(`src/app${tool.href}/page.tsx`), tool.href).toBe(true);
    }
  });

  it("ücretsiz hesapta fotoğraf, podcast ve sözlü Plus rozetli", () => {
    const hub = readFileSync("src/components/parity/tools-hub.tsx", "utf8");
    expect(hub).toContain(`"soru-coz": "IMAGE_SOLUTION"`);
    expect(hub).toContain(`podcast: "PODCAST_GENERATE"`);
    expect(hub).toContain(`sozlu: "ORAL_EXAM_GENERATE"`);
    expect(hub).toContain(`<span className="tool-kind is-plus">Plus</span>`);
  });
});
