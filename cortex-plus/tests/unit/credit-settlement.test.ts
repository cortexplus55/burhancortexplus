import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits } from "@/lib/credits/service";
describe("credit settlement errors", () => {
  it.each([commitCredits, refundCredits])("does not silently accept an RPC failure", async (settle) => {
    const service = { rpc: vi.fn().mockResolvedValue({ error: { code: "unavailable", message: "private provider response" } }) } as unknown as SupabaseClient;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(settle(service, "reservation")).rejects.toThrow(/credit_(commit|refund)_failed/);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private provider response");
    } finally { log.mockRestore(); }
  });
});
