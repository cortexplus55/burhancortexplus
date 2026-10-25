import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonDiagramView } from "@/components/parity/lesson-diagram";
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
    expect(DIAGRAM_LAYOUT_RULE).toContain("shape");
    expect(DIAGRAM_LAYOUT_RULE).toContain("filled");
    expect(DIAGRAM_LAYOUT_RULE).not.toMatch(/mitoz|mayoz|punnett|soy ağacı|kan grubu/i);
  });

  it("ilişki ağacı kare ve daireyi doldurur; bozuk şekil dersi düşürmez", () => {
    const tree = lessonDiagramSchema.parse({
      layout: "tree",
      caption: "İlişki ağacının dalları",
      root: {
        label: "Kök",
        children: [
          { label: "Daire", shape: "circle", filled: false },
          { label: "Kare", shape: "square", filled: true },
        ],
      },
    });
    if (tree.layout !== "tree") return;
    const placed = layoutStructuredDiagram(tree);
    expect(placed.nodes.map((node) => node.shape)).toEqual([undefined, "circle", "square"]);
    expect(placed.nodes[2]?.filled).toBe(true);
    const html = renderToStaticMarkup(createElement(LessonDiagramView, { diagram: tree, id: "agac" }));
    expect(html).toContain("<ellipse");
    expect(html).toContain('rx="2"');
    expect(html).toContain('rx="8"');

    const loose = lessonDiagramSchema.parse({
      layout: "tree",
      caption: "İlişki ağacının dalları",
      root: { label: "Kök", shape: "triangle", filled: "yes", children: [{ label: "Dal" }] },
    });
    if (loose.layout !== "tree") return;
    expect(loose.root.shape).toBeUndefined();
    expect(loose.root.filled).toBeUndefined();
  });

  it("kaynak bir süreç, kısa tablo ya da ilişki ağacı taşıyorsa eksik şema yüksektir", () => {
    const bare = { screens: [{ blocks: [{ type: "text", text: "Metin." }] }] } as unknown as LessonV3;
    const flowPages = [{ text: "Hazırlık → Uygulama → Kontrol" }];
    const flowGap = structuredDiagramIssue(bare, flowPages);
    expect(flowGap?.severity).toBe("high");
    expect(flowGap?.problem.startsWith("[kapsam]")).toBe(true);
    expect(flowGap?.problem).toContain("flow");

    const matrixPages = [{ text: "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |" }];
    expect(structuredDiagramIssue(bare, matrixPages)?.problem).toContain("matrix");

    const treePages = [{ text: "□ Anne\n● Çocuk" }];
    expect(structuredDiagramIssue(bare, treePages)?.problem).toContain("tree");

    const withFlow = {
      screens: [{
        blocks: [{
          type: "diagram",
          diagram: { layout: "flow", caption, nodes: [{ id: "a", label: "Hazırlık" }, { id: "b", label: "Kontrol" }] },
        }],
      }],
    } as unknown as LessonV3;
    expect(structuredDiagramIssue(withFlow, flowPages)).toBeNull();
  });
});
