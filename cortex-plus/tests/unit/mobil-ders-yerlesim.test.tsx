import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagramCard, flowSteps } from "@/components/parity/diagram-card";

const read = (path: string) => readFileSync(path, "utf8");

const card = {
  type: "diagram_card" as const,
  diagramKind: "process_network" as const,
  title: "Niceleyiciyi söze çevir",
  items: [
    { label: "Niceleyiciyi oku", detail: "∀: her; ∃: bazı" },
    { label: "Kümeyi oku", detail: "Elemanların hangi kümeden seçildiğini belirle" },
    { label: "Koşulu oku" },
    { label: "Sözel ifadeyi kur", highlight: true },
  ],
};

describe("mobil ders yerleşimi (1 Kasım 2026)", () => {
  it("süreç akışı numaralı HTML liste; açıklama adımın altında, sabit genişlikli sütun yok", () => {
    const html = renderToStaticMarkup(createElement(DiagramCard, { card, id: "f" }));
    expect(html).toContain('<ol class="als-flow"');
    expect(html).toContain('data-diagram="process_network"');
    expect((html.match(/class="als-flow-step/g) ?? []).length).toBe(4);
    expect(html).toContain("Elemanların hangi kümeden seçildiğini belirle");
    expect(html).not.toContain("als-diagram-label");
    expect(html).not.toContain("max-width");
    expect(flowSteps(card as never).map((s) => s.detail)).toEqual(["∀: her; ∃: bazı", "Elemanların hangi kümeden seçildiğini belirle", null, null]);
  });

  it("CSS: kelime ortasından kırma yok; dar ekranda kartlar alt alta, sıradaki adım düğmeleri sarılır", () => {
    const diagram = read("src/styles/diagram-card.css");
    expect(diagram).not.toContain("break-all");
    expect(diagram).toMatch(/\.als-flow-text \{[\s\S]*word-break: normal;[\s\S]*overflow-wrap: anywhere/);
    expect(diagram).toMatch(/@container \(min-width: 640px\)/);
    const lesson = read("src/styles/exam-lesson-steps.css");
    expect(lesson).toMatch(/Mobil sadelik turu[\s\S]*\.als-card-grid \{[\s\S]*flex-direction: column/);
    const shell = read("src/styles/parity-shell.css");
    expect(shell).toMatch(/\.cp-path-next-actions \{\s*flex-wrap: wrap;/);
  });
});
