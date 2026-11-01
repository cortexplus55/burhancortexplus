import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("O12 cheap perf wins", () => {
  it("landing page does not read cookies (stays ISR-cached)", () => {
    const src = readFileSync("src/app/page.tsx", "utf8");
    expect(src).not.toContain("@/lib/supabase/server");
    expect(src).toContain("export const revalidate = 300");
  });
  it("ayarlar reads run in parallel", () => {
    const src = readFileSync("src/app/ayarlar/page.tsx", "utf8");
    expect(src.match(/await supabase/g)).toBeNull();
    expect(src).toContain('select("study_reminder_email")');
  });
});
