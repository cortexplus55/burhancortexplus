import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagramCard } from "@/components/parity/diagram-card";
import { blockAlias, lessonV3Schema, type DiagramKind } from "@/lib/learning/lesson-v3";
import { PARAMETRIC_DIAGRAM_RULE, parametricDiagramIssue } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

const kinds: DiagramKind[] = ["number_line", "balance_scale", "function_curve", "timeline", "process_network"];

function card(kind: DiagramKind) {
  return {
    type: "diagram_card" as const,
    diagramKind: kind,
    title: `${kind} şeması`,
    caption: "Konunun çizimi",
    items: [
      { label: "A", value: kind === "number_line" ? -2 : 1, highlight: true },
      { label: "B", value: 4, detail: "bağ" },
      { label: "C", value: 9 },
    ],
  };
}

describe("paket 1 svg şema", () => {
  it.each(kinds.filter((kind) => kind !== "process_network"))("%s gerçek svg üretir", (kind) => {
    const html = renderToStaticMarkup(createElement(DiagramCard, { card: card(kind), id: kind }));
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 600 220"');
    expect(html).toContain(`data-diagram="${kind}"`);
    if (kind === "number_line" || kind === "timeline") {
      expect(html).toContain("<line");
      expect(html).toContain("<circle");
    }
    if (kind === "balance_scale") {
      expect(html).toContain("<polygon");
      expect(html).toContain("<path");
    }
    if (kind === "function_curve") {
      expect(html).toContain("<path");
      expect(html).toContain("<line");
    }
  });

  it("sol ve sağ kefeyi ayırır; flow takma adı diyagram kalır", () => {
    const parsed = lessonV3Schema.safeParse({
      format: 3,
      title: "Denklem",
      objective: "İki tarafı eşitlemek",
      overview: "Terazi denklemi",
      screens: [
        {
          heading: "Eşitlik",
          blocks: [
            { type: "text", text: "İki taraf da aynı değeri taşır." },
            { type: "diagram_card", title: "Terazi", leftSide: { label: "2x" }, rightSide: { label: "6" } },
          ],
        },
      ],
      summary: ["Sol", "Sağ", "Eşit"],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const block = parsed.data.screens[0]!.blocks.find((item) => item.type === "diagram_card");
    expect(block && block.type === "diagram_card" ? block.diagramKind : null).toBe("balance_scale");
    if (block?.type === "diagram_card") expect(block.items.map((item) => item.label)).toEqual(["2x", "6"]);

    const aliased = blockAlias({
      type: "diagram_card",
      card: {
        layout: "flow",
        caption: "Azot döngüsünün halkası",
        nodes: [
          { id: "a", label: "Azot" },
          { id: "b", label: "Nitrat" },
        ],
      },
    }) as { type: string };
    expect(aliased.type).toBe("diagram");
  });

  it("parametrik kart yoksa orta önem yazar", () => {
    const bare = { screens: [{ blocks: [{ type: "text" }] }] } as unknown as LessonV3;
    expect(parametricDiagramIssue(bare)?.severity).toBe("medium");
    expect(parametricDiagramIssue(bare)?.problem.startsWith("Parametrik şema eksik")).toBe(true);
    expect(PARAMETRIC_DIAGRAM_RULE).toContain("number_line");
    expect(PARAMETRIC_DIAGRAM_RULE).toContain("process_network");
    const withCard = {
      screens: [{ blocks: [{ type: "diagram_card", diagramKind: "timeline", items: [] }] }],
    } as unknown as LessonV3;
    expect(parametricDiagramIssue(withCard)).toBeNull();
  });
});
