import { describe, expect, it } from "vitest";
import { optionLetter, OPTION_LETTERS } from "@/components/ui/option-card";
import { SURFACE_COPY } from "@/lib/ui/surface-copy";
import { fluencyIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";

/** sRGB relative luminance (WCAG). */
function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  const channels = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design tokens contrast", () => {
  it("muted text on surface-2 meets AA for normal text", () => {
    expect(contrast("#a3a3a3", "#1a1a1a")).toBeGreaterThanOrEqual(4.5);
  });

  it("white on action blue meets AA", () => {
    expect(contrast("#ffffff", "#3d5afe")).toBeGreaterThanOrEqual(4.5);
  });

  it("dark on brand gold meets AA", () => {
    expect(contrast("#050505", "#f4ae0b")).toBeGreaterThanOrEqual(4.5);
  });

  it("body text on bg meets AA", () => {
    expect(contrast("#fafafa", "#050505")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("option letters", () => {
  it("maps 0..3 to A..D", () => {
    expect(OPTION_LETTERS).toEqual(["A", "B", "C", "D"]);
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(3)).toBe("D");
  });
});

describe("surface copy fluency", () => {
  it("standard strings pass fluency and repair", () => {
    for (const value of Object.values(SURFACE_COPY)) {
      expect(fluencyIssues(value)).toEqual([]);
      expect(repairTurkishSurface(value)).toBe(value);
    }
  });
});
