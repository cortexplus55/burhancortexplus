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

  it("yüzen simge düğmenin içindedir ve tıklamayı kesmez", () => {
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    const beam = home.indexOf('className="cp-path-beam"');
    const open = home.lastIndexOf("<button", beam);
    const close = home.indexOf("</button>", beam);
    expect(beam).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(beam);
    expect(home).toContain("levelNodeAria");
    expect(home).toContain("isLevelNode(node.id)");
    const css = readFileSync("src/styles/parity-shell.css", "utf8");
    const beamCss = css.slice(css.indexOf(".cp-path-beam {"), css.indexOf(".cp-path-beam-icon"));
    expect(beamCss).toContain("pointer-events: auto");
    expect(beamCss).not.toContain("pointer-events: none");
  });
});
