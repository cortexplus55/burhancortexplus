import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { warmupCards, warmupTips } from "@/lib/learning/generation-warmup";

describe("üretim beklerken zihin ısıtma", () => {
  it("aynı konu aynı kart ve refleks sırasını verir; model çağırmaz", () => {
    const topic = "Mitoz ve mayoz";
    expect(warmupCards(topic)).toHaveLength(4);
    expect(warmupCards(topic)[0]!.front).toContain("Mitoz ve mayoz");
    expect(warmupCards(topic)).toEqual(warmupCards(topic));
    expect(warmupTips(topic)).toHaveLength(6);
  });

  it("konu boşsa genel kart yazar", () => {
    expect(warmupCards("")[0]!.front).toContain("bu konu");
  });

  it("konuyla ilgisiz hazır refleks sorusu yok (10 Kasım 2026)", () => {
    const lib = readFileSync("src/lib/learning/generation-warmup.ts", "utf8");
    expect(lib).not.toContain("warmupReflex");
    expect(lib).not.toMatch(/const REFLEX\b/);
    const view = readFileSync("src/components/parity/generation-warmup.tsx", "utf8");
    expect(view).toContain('...(reflex ? ([["reflex", "Refleks"]] as const) : [])');
  });
});
