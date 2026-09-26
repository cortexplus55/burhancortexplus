import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isFeatureEnabled } from "@/lib/admin/feature-flags";

function mockFrom(row: { enabled: boolean; metadata?: unknown } | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  };
}

describe("isFeatureEnabled", () => {
  it("returns false when the flag row is missing", async () => {
    expect(
      await isFeatureEnabled(mockFrom(null) as never, "pdf_learning_v2"),
    ).toBe(false);
  });

  it("returns the stored enabled value", async () => {
    expect(
      await isFeatureEnabled(
        mockFrom({ enabled: true }) as never,
        "pdf_learning_v2",
      ),
    ).toBe(true);
  });

  it("fails closed on query errors", async () => {
    expect(
      await isFeatureEnabled(
        mockFrom(null, { message: "boom" }) as never,
        "pdf_learning_v2",
      ),
    ).toBe(false);
  });

  it("enables pilot user when global flag is off", async () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    expect(
      await isFeatureEnabled(
        mockFrom({
          enabled: false,
          metadata: { pilot_user_ids: [uid] },
        }) as never,
        "adaptive_learning_enabled",
        uid,
      ),
    ).toBe(true);
  });

  it("keeps non-pilot users off when global flag is off", async () => {
    expect(
      await isFeatureEnabled(
        mockFrom({
          enabled: false,
          metadata: { pilot_user_ids: ["other"] },
        }) as never,
        "adaptive_learning_enabled",
        "me",
      ),
    ).toBe(false);
  });
});
