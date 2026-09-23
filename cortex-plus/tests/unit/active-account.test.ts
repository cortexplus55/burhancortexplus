import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAccountActive } from "@/lib/auth/active-account";

describe("active session gate", () => {
  it.each([true, false, null])("only explicit true permits entry (%s)", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await isAccountActive({ rpc } as unknown as SupabaseClient)).toBe(data === true);
    expect(rpc).toHaveBeenCalledWith("current_account_active");
  });
  it("does not treat an unavailable database as an active account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: { code: "unavailable" } });
    await expect(isAccountActive({ rpc } as unknown as SupabaseClient)).rejects.toThrow("account_status_unavailable");
  });
});
