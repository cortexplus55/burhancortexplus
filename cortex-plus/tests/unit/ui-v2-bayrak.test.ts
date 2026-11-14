import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/* Faz 4B: `ui.v2.*` bayrakları. Canlıda veritabanı satırı, önizlemede açık, yerelde ortam değişkeni ya da çerez. */

const flagRead = vi.fn(async () => false);
vi.mock("@/lib/admin/feature-flags", () => ({ isFeatureEnabled: (...args: unknown[]) => flagRead(...(args as [])) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
let cookie: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined) }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  cookie = undefined;
  flagRead.mockReset();
  flagRead.mockResolvedValue(false);
});

describe("uiV2", () => {
  it("canlıda yalnız veritabanı satırı (çerez ve ortam değişkeni yok sayılır)", async () => {
    const { uiV2 } = await import("@/lib/ui-v2/flags");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UI_V2", "all");
    cookie = "all";
    expect(await uiV2("ders", "u1")).toBe(false);
    expect(flagRead).toHaveBeenCalledWith({}, "ui.v2.ders", "u1");
    flagRead.mockResolvedValueOnce(true);
    expect(await uiV2("ders", "u1")).toBe(true);
  });
  it("önizlemede açık", async () => {
    const { uiV2 } = await import("@/lib/ui-v2/flags");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await uiV2("tekrar")).toBe(true);
  });
  it("yerelde kapalı; UI_V2 ya da cx-ui-v2 çerezi açar", async () => {
    const { uiV2 } = await import("@/lib/ui-v2/flags");
    vi.stubEnv("VERCEL_ENV", "");
    expect(await uiV2("ders")).toBe(false);
    vi.stubEnv("UI_V2", "ders,tekrar");
    expect(await uiV2("ders")).toBe(true);
    expect(await uiV2("pay")).toBe(false);
    vi.stubEnv("UI_V2", "");
    cookie = "pay";
    expect(await uiV2("pay")).toBe(true);
  });
});

describe("ders sayfası: bayrak kapalıyken sarmalayıcı yok", () => {
  it("sarmalayıcı yalnız uiKeys doluysa; kurallar yalnız [data-ui~=ders] altında", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain('uiV2("ders", user.id)');
    expect(page).toMatch(/uiKeys\.length \? \(\s*<div className="cx-ui-scope" data-ui=\{uiKeys\.join\(" "\)\}>/);
    const css = readFileSync("src/styles/ui-v2-ders.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css.match(/^[^@{}\n][^{]*\{/gm) ?? [];
    for (const selector of selectors) {
      if (selector.trim().startsWith(".cx-ui-scope")) continue;
      expect(selector, selector).toContain('[data-ui~="ders"]');
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/backdrop-filter:\s*blur/);
  });
});
