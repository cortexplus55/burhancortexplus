import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isFeatureEnabled } from "@/lib/admin/feature-flags";

describe("isFeatureEnabled", () => {
  it("returns false when the flag row is missing", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    expect(await isFeatureEnabled(service as never, "pdf_learning_v2")).toBe(
      false,
    );
  });

  it("returns the stored enabled value", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { enabled: true },
              error: null,
            }),
          }),
        }),
      }),
    };
    expect(await isFeatureEnabled(service as never, "pdf_learning_v2")).toBe(
      true,
    );
  });

  it("fails closed on query errors", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "boom" },
            }),
          }),
        }),
      }),
    };
    expect(await isFeatureEnabled(service as never, "pdf_learning_v2")).toBe(
      false,
    );
  });
});
