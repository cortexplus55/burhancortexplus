import { describe, expect, it } from "vitest";
import { flatMapNeedsOneshotRegen } from "@/lib/documents/pdf-learning-v2";

describe("flatMapNeedsOneshotRegen", () => {
  it("flags unused flat maps with many nodes (founder 111 junk)", () => {
    const nodes = Array.from({ length: 50 }, () => ({ parent_id: null as string | null }));
    expect(
      flatMapNeedsOneshotRegen({ status: "ready", inUse: false, nodes }),
    ).toBe(true);
  });

  it("keeps hierarchical maps", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "ready",
        inUse: false,
        nodes: [
          { parent_id: null },
          { parent_id: "u1" },
          { parent_id: "u1" },
        ],
      }),
    ).toBe(false);
  });

  it("never regenerates maps already used by an exam", () => {
    const nodes = Array.from({ length: 50 }, () => ({ parent_id: null as string | null }));
    expect(
      flatMapNeedsOneshotRegen({ status: "ready", inUse: true, nodes }),
    ).toBe(false);
  });

  it("leaves short flat maps alone", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "ready",
        inUse: false,
        nodes: Array.from({ length: 8 }, () => ({ parent_id: null as string | null })),
      }),
    ).toBe(false);
  });

  it("skips pending / failed statuses", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "pending",
        inUse: false,
        nodes: Array.from({ length: 50 }, () => ({ parent_id: null as string | null })),
      }),
    ).toBe(false);
  });
});
