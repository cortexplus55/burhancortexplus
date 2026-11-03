import { describe, expect, it } from "vitest";
import { ttlMemo } from "@/lib/cache/ttl-memo";

describe("ttlMemo", () => {
  it("süre içinde tek okuma paylaşır, süre dolunca yeniler", async () => {
    let t = 0;
    let calls = 0;
    const get = ttlMemo<number>(1000, 10, () => t);
    const load = async () => ++calls;
    expect(await get("a", load)).toBe(1);
    expect(await get("a", load)).toBe(1);
    t = 1500;
    expect(await get("a", load)).toBe(2);
  });
  it("hatayı önbelleğe almaz", async () => {
    const get = ttlMemo<number>(1000);
    await expect(get("a", async () => { throw new Error("x"); })).rejects.toThrow();
    await Promise.resolve();
    expect(await get("a", async () => 5)).toBe(5);
  });
});
