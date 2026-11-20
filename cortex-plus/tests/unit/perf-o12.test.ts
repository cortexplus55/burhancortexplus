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
    // Faz 2: profilin iki okuması tek select'te birleşti. Faz 6 (20 Kasım 2026): hatırlatma tercihi artık profilden
    // değil bildirim tercihi deposundan okunur; o okuma da aynı paralel turda (Promise.all içinde).
    expect(src).not.toMatch(/select\("[^"]*study_reminder_email[^"]*"\)/);
    expect(src).toMatch(/Promise\.all\(\[[\s\S]*loadNotificationPreferences\(service, user\.id\),\s*\]\)/);
  });
});
