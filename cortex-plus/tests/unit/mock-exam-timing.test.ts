import { describe, expect, it } from "vitest";
import { createTimer } from "@/lib/learning/mock-exam/timing";

describe("createTimer", () => {
  it("adım sürelerini Server-Timing biçiminde verir", () => {
    let t = 100;
    const timer = createTimer(() => t);
    t = 130;
    timer.mark("checks");
    t = 180;
    timer.mark("pool");
    expect(timer.header()).toBe("checks;dur=30, pool;dur=50, total;dur=80");
  });
});
