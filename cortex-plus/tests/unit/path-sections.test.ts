import { describe, expect, it } from "vitest";
import { buildPathSections, sectionMasteryPct, sectionStatusLine } from "@/lib/learning/path-sections";
import type { PathSectionNode } from "@/lib/learning/path-sections";

function node(
  id: string,
  kind: PathSectionNode["kind"],
  sortOrder: number,
  status: string,
  topicTitle?: string,
): PathSectionNode {
  return { id, kind, sortOrder, status, sessionMeta: topicTitle ? { topicTitle } : null };
}

describe("çalışma yolu bölümleri", () => {
  it("konu anahtarı önekle birleşmez; biten ve kilitli kartlar ayrı kalır", () => {
    const sections = buildPathSections(
      [
        node("a1", "lesson", 0, "done", "A"),
        node("a2", "quiz", 1, "done", "A"),
        node("ab1", "lesson", 2, "locked", "AB"),
        node("b1", "lesson", 3, "ready", "B"),
      ],
      "b1",
    );
    expect(sections.map((section) => section.title)).toEqual(["A", "AB", "B"]);
    expect(sections.map((section) => section.nodes.length)).toEqual([2, 1, 1]);
    expect(sections[0]).toMatchObject({ complete: true, active: false, locked: false });
    expect(sections[1]).toMatchObject({ locked: true, active: false });
    expect(sections[2]).toMatchObject({ active: true, complete: false });
  });

  it("konusuz ilk ders Bugün başla, sonrakiler Öğren ve Pratik Yap", () => {
    const sections = buildPathSections(
      [node("l1", "lesson", 0, "done"), node("p1", "podcast", 1, "ready"), node("l2", "lesson", 2, "locked")],
      "p1",
    );
    expect(sections.map((section) => section.title)).toEqual(["Bugün başla", "Öğren ve Pratik Yap"]);
    expect(sections[1]?.nodes.map((item) => item.id)).toEqual(["p1", "l2"]);
  });

  it("durum satırı adım sayısı, kilit ve tamamlanma yüzdesi yazar", () => {
    const nodes = [node("a", "quiz", 0, "done", "Hücre"), node("b", "oral", 1, "done", "Hücre")];
    const section = buildPathSections(nodes, null)[0]!;
    expect(sectionStatusLine(section, sectionMasteryPct(nodes, { a: 80, b: 60 }))).toBe("2 adım · Tamamlandı · %70");
    expect(sectionStatusLine({ ...section, complete: false, locked: true, active: false }, null)).toBe("2 adım · Kilitli");
    expect(sectionMasteryPct([{ id: "a", status: "ready" }], { a: 80 })).toBeNull();
  });
});
