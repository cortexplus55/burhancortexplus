/**
 * RLS ownership expectations for adaptive tables (policy contract tests).
 * Runtime SQL RLS is in migration; here we assert API guard ownership pattern.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Adaptive prep ownership guard contract", () => {
  it("assertPrepOwner returns false for non-owner", async () => {
    const { assertPrepOwner } = await import("@/lib/adaptive/api-guard");
    const ctx = {
      userId: "user-a",
      service: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        }),
      },
    };
    const ok = await assertPrepOwner(ctx as never, "prep-of-b");
    expect(ok).toBe(false);
  });

  it("assertPrepOwner returns true for owner", async () => {
    const { assertPrepOwner } = await import("@/lib/adaptive/api-guard");
    const ctx = {
      userId: "user-a",
      service: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "prep-1" } }),
              }),
            }),
          }),
        }),
      },
    };
    const ok = await assertPrepOwner(ctx as never, "prep-1");
    expect(ok).toBe(true);
  });
});

describe("Adaptive RLS migration policy names", () => {
  it("documents select-own policies for all adaptive tables", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "supabase/migrations/20260927120000_adaptive_learning_engine.sql",
    );
    const sql = await fs.readFile(file, "utf8");
    for (const table of [
      "adaptive_master_plans",
      "adaptive_daily_plans",
      "adaptive_daily_plan_items",
      "adaptive_learning_sessions",
      "adaptive_learning_events",
      "adaptive_scheduled_reviews",
      "adaptive_jev_decisions",
    ]) {
      expect(sql).toContain(`${table}_select_own`);
      expect(sql).toContain(`ON public.${table}`);
      expect(sql).toContain("auth.uid() = user_id");
    }
  });
});
