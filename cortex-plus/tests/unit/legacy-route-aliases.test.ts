import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Eski kısa adresler 404 bırakılmamalı. Hedef korumalı olduğu için misafir
 * mevcut kapıdan `/giris?next=<kanonik>` görür; oturum varsa kanonik sayfa açılır.
 */
const ALIASES = [
  ["/sor", "/soru-coz"],
  ["/chat", "/ogretmen"],
  ["/podcast", "/studio/podcast"],
] as const;

describe("eski kısa rotalar", () => {
  const middleware = readFileSync("src/lib/supabase/middleware.ts", "utf8");
  const config = readFileSync("next.config.ts", "utf8");

  it.each(ALIASES)("%s → %s", (from, to) => {
    expect(middleware).toContain(`"${from}"`);
    expect(middleware).toContain(`"${to}"`);
    expect(config).toContain(`source: "${from}"`);
    expect(config).toContain(`destination: "${to}"`);
  });
});
