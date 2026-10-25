import { describe, expect, it } from "vitest";
import { lessonV3Schema, blockAlias } from "@/lib/learning/lesson-v3";
import { diagramIssues, layoutStructuredDiagram, lessonDiagramSchema } from "@/lib/learning/lesson-diagram";
import { DIAGRAM_LAYOUT_RULE, TEACHER_SYSTEM, structuredDiagramIssue, verifySystem } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

const caption = "Hücre döngüsünün evreleri";

describe("evrensel görsel şema", () => {
  it("flow, matrix ve tree yerleşir; koordinat modelden gelmez", () => {
    const flow = lessonDiagramSchema.parse({
      layout: "flow",
      caption,
      nodes: [
        { id: "g1", label: "G1" },
        { id: "s", label: "S" },
        { id: "m", label: "Mitoz" },
      ],
    });
    expect(flow.layout).toBe("flow");
    if (flow.layout !== "flow") return;
    const placed = layoutStructuredDiagram(flow);
    expect(placed.nodes).toHaveLength(3);
    expect(placed.edges.length).toBeGreaterThan(0);
    expect(diagramIssues(flow)).toEqual([]);

    const matrix = lessonDiagramSchema.parse({
      layout: "matrix",
      caption: "İşaretlerin çarpım tablosu",
      columns: ["+", "−"],
      rows: ["+", "−"],
      cells: [
        { r: 0, c: 0, label: "+" },
        { r: 0, c: 1, label: "−" },
        { r: 1, c: 0, label: "−" },
        { r: 1, c: 1, label: "+" },
      ],
    });
    if (matrix.layout !== "matrix") return;
    expect(layoutStructuredDiagram(matrix).cells).toHaveLength(4);

    const tree = lessonDiagramSchema.parse({
      layout: "tree",
      caption: "Devlet biçimlerinin dallanması",
      root: { label: "Devlet", children: [{ label: "Monarşi" }, { label: "Cumhuriyet" }] },
    });
    if (tree.layout !== "tree") return;
    expect(layoutStructuredDiagram(tree).edges).toHaveLength(2);
  });

  it("diagram_card takma adı diyagrama iner; bozuk blok dersi düşürmez", () => {
    const aliased = blockAlias({
      type: "diagram_card",
      card: { layout: "cycle", caption: "Azot döngüsünün halkası", nodes: [{ id: "a", label: "Azot" }, { id: "b", label: "Nitrat" }] },
    }) as { type: string };
    expect(aliased.type).toBe("diagram");
    const parsed = lessonV3Schema.safeParse({
      format: 3,
      title: "Azot",
      objective: "Döngüyü ayırt etmek",
      overview: "Azot döngüsü",
      screens: [{
        heading: "Döngü",
        blocks: [
          { type: "text", text: "Azot toprakta ve havada dolaşır." },
          { type: "diagram_card", diagram: { layout: "nope" } },
          {
            type: "diagram",
            diagram: {
              layout: "cycle",
              caption: "Azot döngüsünün halkası",
              nodes: [{ id: "a", label: "Azot" }, { id: "b", label: "Nitrat" }],
            },
          },
        ],
      }],
      summary: ["Azot", "Nitrat", "Döngü"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const types = parsed.data.screens[0]!.blocks.map((block) => block.type);
    expect(types).toContain("diagram");
    expect(types).not.toContain("diagram_card");
  });

  it("şema kotası orta önemdedir ve yazar ile denetçi aynı kuralı okur", () => {
    const bare = { screens: [{ blocks: [{ type: "text" }] }] } as unknown as LessonV3;
    expect(structuredDiagramIssue(bare)?.severity).toBe("medium");
    expect(structuredDiagramIssue(bare)?.problem.startsWith("Yapılandırılmış şema eksik")).toBe(true);
    const withFlow = {
      screens: [{
        blocks: [{
          type: "diagram",
          diagram: { layout: "flow", caption, nodes: [{ id: "a", label: "G1" }, { id: "b", label: "S" }] },
        }],
      }],
    } as unknown as LessonV3;
    expect(structuredDiagramIssue(withFlow)).toBeNull();
    expect(TEACHER_SYSTEM).toContain(DIAGRAM_LAYOUT_RULE);
    expect(verifySystem("document")).toContain(DIAGRAM_LAYOUT_RULE);
    expect(verifySystem("topic")).toContain(DIAGRAM_LAYOUT_RULE);
    expect(DIAGRAM_LAYOUT_RULE).not.toMatch(/matematik|fizik|tarih/i);
  });
});
