import { describe, expect, it } from "vitest";
import { warmupCards, warmupReflex, warmupTips } from "@/lib/learning/generation-warmup";

describe("üretim beklerken zihin ısıtma", () => {
  it("aynı konu aynı kart ve refleks sırasını verir; model çağırmaz", () => {
    const topic = "Mitoz ve mayoz";
    expect(warmupCards(topic)).toHaveLength(4);
    expect(warmupCards(topic)[0]!.front).toContain("Mitoz ve mayoz");
    expect(warmupCards(topic)).toEqual(warmupCards(topic));
    expect(warmupReflex(topic)).toEqual(warmupReflex(topic));
    expect(warmupTips(topic)).toHaveLength(6);
  });

  it("konu boşsa genel kart yazar", () => {
    expect(warmupCards("")[0]!.front).toContain("bu konu");
    expect(warmupReflex("TUS anatomi").options.length).toBe(4);
  });
});
