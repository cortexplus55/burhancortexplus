import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLevelNode, levelNodeAria, shouldShowLevelNode } from "@/lib/learning/path-level";

describe("seviye tespiti düğümü", () => {
  it("tanı bitince sahte düğüm kalkar; açıkken etiket seviye tespitidir", () => {
    expect(shouldShowLevelNode(null, [{ status: "ready" }])).toBe(true);
    expect(shouldShowLevelNode(null, [{ status: "done" }])).toBe(false);
    expect(shouldShowLevelNode(null)).toBe(false);
    expect(shouldShowLevelNode("2026-10-25T12:00:00Z", [{ status: "ready" }])).toBe(false);
    expect(isLevelNode("__intro")).toBe(true);
    expect(isLevelNode("node-1")).toBe(false);
    expect(levelNodeAria("sırada")).toBe("Seviye tespiti, sırada");
    expect(levelNodeAria("sırada")).not.toContain("Konu testi");
  });

  it("düğümün simgesi düğmenin içindedir ve tıklamayı kesmez", () => {
    // 13 Kasım 2026 (3C): yüzen huzme kalktı; simge düz noktanın içinde, nokta düğmenin içinde.
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    const dot = home.indexOf("<PathNodeDot node={node} current={node.id === currentId} />");
    const open = home.lastIndexOf("<button", dot);
    const close = home.indexOf("</button>", dot);
    expect(dot).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(dot);
    expect(home).not.toContain("cp-path-beam");
    expect(home).toContain("levelNodeAria");
    expect(home).toContain("isLevelNode(node.id)");
    const css = readFileSync("src/styles/prep-home-cx.css", "utf8");
    expect(css).not.toMatch(/\.cx-node \{[^}]*pointer-events: none/);
  });
});
