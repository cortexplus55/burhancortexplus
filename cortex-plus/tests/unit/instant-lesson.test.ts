import { afterEach, describe, expect, it } from "vitest";
import { clearInstantLesson, peekInstantLesson, previewFromSections, primeInstantLesson } from "@/lib/learning/instant-lesson";

describe("anında havuz dersi", () => {
  afterEach(() => clearInstantLesson());
  it("önizleme yalnız aynı düğümde ve 10 dk içinde okunur", () => {
    const preview = previewFromSections("Paragraf", [{ heading: "Ana fikir", explanation: "**Ana fikir** metnin özüdür.\n\nİkinci paragraf." }])!;
    expect(preview.paragraphs).toEqual(["Ana fikir metnin özüdür.", "İkinci paragraf."]);
    expect(primeInstantLesson({ prepId: "p", nodeId: "n", preview }, 0)).toBe(true);
    expect(peekInstantLesson("p", "x", 1)).toBeNull();
    expect(peekInstantLesson("p", "n", 1)?.heading).toBe("Ana fikir");
    expect(peekInstantLesson("p", "n", 11 * 60_000)).toBeNull();
  });
  it("geçersiz önizleme yazılmaz", () => {
    expect(primeInstantLesson({ prepId: "p", nodeId: "n", preview: { title: "a" } })).toBe(false);
    expect(previewFromSections("a", [])).toBeNull();
  });
});
