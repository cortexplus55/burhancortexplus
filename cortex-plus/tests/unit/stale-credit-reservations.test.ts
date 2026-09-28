import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STALE_REFUND_ACTION_CODES,
  refundStalePendingReservations,
  resetStaleCleanupCooldownForTests,
} from "@/lib/credits/service";

function mockService(rows: Array<{ id: string; action_code: string; status?: string }>) {
  const state = {
    inCodes: null as string[] | null,
    statusEq: null as string | null,
    rpcCalls: [] as string[],
  };
  const query: Record<string, unknown> = {};
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => {
      if (col === "status") state.statusEq = val;
      return chain;
    },
    in: (col: string, vals: string[]) => {
      if (col === "action_code") state.inCodes = vals;
      return chain;
    },
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    then: undefined as unknown,
  };
  // Thenable: await query resolves to { data, error }
  Object.assign(chain, {
    then(resolve: (v: { data: typeof rows; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  });
  const service = {
    from: (table: string) => {
      expect(table).toBe("credit_reservations");
      return chain;
    },
    rpc: vi.fn(async (fn: string, args: { p_reservation_id: string }) => {
      state.rpcCalls.push(`${fn}:${args.p_reservation_id}`);
      return { error: null };
    }),
  } as unknown as SupabaseClient;
  return { service, state };
}

describe("refundStalePendingReservations — allowlist", () => {
  beforeEach(() => {
    resetStaleCleanupCooldownForTests();
  });

  it("DOCUMENT_PAGE_PROCESS allowlist'te yok", () => {
    expect(STALE_REFUND_ACTION_CODES).not.toContain("DOCUMENT_PAGE_PROCESS");
    expect(STALE_REFUND_ACTION_CODES).toContain("STUDY_PLAN_GENERATE");
    expect(STALE_REFUND_ACTION_CODES).toContain("QUIZ_GENERATE");
    expect(STALE_REFUND_ACTION_CODES).toContain("AUDIO_SYNTHESIZE");
  });

  it("(a) bayat DOCUMENT_PAGE_PROCESS pending iade edilmez", async () => {
    const { service, state } = mockService([
      { id: "res-pdf", action_code: "DOCUMENT_PAGE_PROCESS", status: "pending" },
    ]);
    const n = await refundStalePendingReservations(service, {
      userId: "u1",
      force: true,
      olderThanMs: 1,
    });
    expect(state.inCodes).not.toBeNull();
    expect(state.inCodes).not.toContain("DOCUMENT_PAGE_PROCESS");
    expect(n).toBe(0);
    expect(state.rpcCalls).toEqual([]);
  });

  it("(b) bayat allowlist tek-istek rezervasyonu iade edilir", async () => {
    const { service, state } = mockService([
      { id: "res-lesson", action_code: "STUDY_PLAN_GENERATE", status: "pending" },
    ]);
    const n = await refundStalePendingReservations(service, {
      userId: "u1",
      force: true,
      olderThanMs: 1,
    });
    expect(state.statusEq).toBe("pending");
    expect(state.inCodes).toContain("STUDY_PLAN_GENERATE");
    expect(n).toBe(1);
    expect(state.rpcCalls).toEqual(["credit_refund:res-lesson"]);
  });

  it("(c) committed rezervasyonlara dokunulmaz", async () => {
    // Sorgu status=pending ile sınırlı; committed satır dönmez.
    const { service, state } = mockService([]);
    const n = await refundStalePendingReservations(service, {
      userId: "u1",
      force: true,
      olderThanMs: 1,
    });
    expect(state.statusEq).toBe("pending");
    expect(n).toBe(0);
    expect(state.rpcCalls).toEqual([]);
  });

  it("aynı kullanıcıda cooldown ikinci çağrıyı atlar", async () => {
    const { service, state } = mockService([
      { id: "res-1", action_code: "QUIZ_GENERATE", status: "pending" },
    ]);
    expect(
      await refundStalePendingReservations(service, { userId: "u-cool", olderThanMs: 1 }),
    ).toBe(1);
    expect(
      await refundStalePendingReservations(service, { userId: "u-cool", olderThanMs: 1 }),
    ).toBe(0);
    expect(state.rpcCalls).toEqual(["credit_refund:res-1"]);
  });
});
