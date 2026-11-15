/** #660 geri alma dosyası: iki fonksiyon göçten önceki gövdeleriyle birebir (15 Kasım 2026, Burhan: "geri alma SQL'i"). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

function body(text: string, signature: RegExp): string {
  const start = text.search(signature);
  const rest = text.slice(start);
  const tag = rest.match(/AS (\$[A-Za-z]*\$)/)![1];
  const from = rest.indexOf(tag) + tag.length;
  return rest.slice(from, rest.indexOf(tag, from));
}

describe("20261115_sinav_haftasi_geri_al.sql", () => {
  const rollback = read("supabase/rollback/20261115_sinav_haftasi_geri_al.sql");

  it("credit_reserve göçten önceki gövdeyle aynı", () => {
    const before = read("supabase/migrations/20261024123000_free_daily_zero.sql");
    const signature = /CREATE OR REPLACE FUNCTION public\.credit_reserve\(/;
    expect(body(rollback, signature)).toBe(body(before, signature));
    expect(body(rollback, signature)).not.toContain("v_sub_end");
  });

  it("finalize_paytr_payment göçten önceki gövdeyle aynı", () => {
    const before = read("supabase/migrations/20260923180000_paytr_subscription_tier_only.sql");
    const signature = /CREATE OR REPLACE FUNCTION public\.finalize_paytr_payment\(/;
    expect(body(rollback, signature)).toBe(body(before, signature));
    expect(body(rollback, signature)).toContain("date_trunc('day', now())");
  });

  it("tek işlem, yetkiler yeniden yazılır, veri değişmez", () => {
    expect(rollback).toMatch(/^begin;$/m);
    expect(rollback).toMatch(/^commit;$/m);
    expect(rollback).toContain("GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, text, integer) TO service_role;");
    // Fonksiyon gövdelerinin dışında veri ya da şema değiştiren komut yok (gövdedeki UPDATE fonksiyonun kendi işi).
    const outside = rollback.replace(/AS (\$[A-Za-z]*\$)[\s\S]*?\1/g, "").replace(/--[^\n]*/g, "");
    expect(outside).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER TABLE)\b/i);
  });
});
