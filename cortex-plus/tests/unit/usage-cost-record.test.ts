import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage, resetUsagePriceCache } from "@/lib/credits/service";

function fakeService() {
  const inserts: Record<string, unknown>[] = [];
  const service = {
    from(table: string) {
      if (table === "ai_model_prices") {
        return { select: async () => ({ data: [{ model: "m", input_per_1k: "0.001", output_per_1k: "0.002" }], error: null }) };
      }
      return { insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; } };
    },
  } as unknown as SupabaseClient;
  return { service, inserts };
}

describe("recordUsage cost", () => {
  beforeEach(() => resetUsagePriceCache());
  it("fills cost_usd_estimate from ai_model_prices for prefetch codes", async () => {
    const { service, inserts } = fakeService();
    await recordUsage(service, { userId: "u", actionCode: "LESSON_PREFETCH", model: "m", tokensIn: 1000, tokensOut: 1000 });
    await recordUsage(service, { userId: "u", actionCode: "CONTENT_PREFETCH", model: "m-fast", tokensIn: 1000, tokensOut: 0 });
    expect(inserts[0]!.cost_usd_estimate).toBe(0.003);
    expect(inserts[1]!.cost_usd_estimate).toBe(0.002);
  });
  it("keeps an explicit estimate and leaves unknown models null", async () => {
    const { service, inserts } = fakeService();
    await recordUsage(service, { userId: "u", actionCode: "LESSON_PREFETCH", model: "m", tokensIn: 1, tokensOut: 1, costUsdEstimate: 9 });
    await recordUsage(service, { userId: "u", actionCode: "LESSON_PREFETCH", model: "x", tokensIn: 1, tokensOut: 1 });
    expect(inserts[0]!.cost_usd_estimate).toBe(9);
    expect(inserts[1]!.cost_usd_estimate).toBeNull();
  });
});
