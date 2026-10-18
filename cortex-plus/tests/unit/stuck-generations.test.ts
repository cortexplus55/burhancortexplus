import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Takılı üretimi kapatma (18 Ekim 2026, plan 4.3). Kapatma yalnız `creating` kayıtlara dokunur,
  askıdaki rezervasyonu iade eder, bitmiş oturuma ve hazır önceden-yazıma dokunmaz.
*/
const refunds = vi.hoisted(() => ({ ids: [] as string[], fail: false }));
vi.mock("@/lib/credits/service", () => ({
  refundCredits: async (_service: unknown, id: string) => {
    if (refunds.fail) throw new Error("credit_refund_failed");
    refunds.ids.push(id);
  },
}));

import { listStuckGenerations, resetStuckGeneration } from "@/lib/learning/stuck-generations";

type Row = Record<string, unknown>;
type State = {
  jobs: Row[];
  attempts: Row[];
  prefetch: Row[];
  reservations: Row[];
  log: string[];
};

function table(state: State, name: string): Row[] {
  if (name === "exam_prep_generation_jobs") return state.jobs;
  if (name === "exam_prep_node_attempts") return state.attempts;
  if (name === "exam_prep_prefetch") return state.prefetch;
  if (name === "credit_reservations") return state.reservations;
  throw new Error(`unexpected table ${name}`);
}

/** Küçük sahte PostgREST: eq/lt süzgeçleri, update/delete uygulanır, select ile satır döner. */
function client(state: State): SupabaseClient {
  return {
    from(name: string) {
      const rows = table(state, name);
      const filters: ((row: Row) => boolean)[] = [];
      let mode: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      const matching = () => rows.filter((row) => filters.every((f) => f(row)));
      const run = () => {
        const hit = matching();
        if (mode === "update") {
          hit.forEach((row) => Object.assign(row, patch));
          state.log.push(`update ${name} ${hit.length}`);
        }
        if (mode === "delete") {
          hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
          state.log.push(`delete ${name} ${hit.length}`);
        }
        return hit.map((row) => ({ ...row }));
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          filters.push((row) => row[col] === value);
          return builder;
        },
        lt: (col: string, value: string) => {
          filters.push((row) => String(row[col]) < value);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        update: (values: Row) => {
          mode = "update";
          patch = values;
          return builder;
        },
        delete: () => {
          mode = "delete";
          return builder;
        },
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => void) => resolve({ data: run(), error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const old = new Date(Date.now() - 30 * 60_000).toISOString();
const fresh = new Date(Date.now() - 2 * 60_000).toISOString();

function seed(): State {
  return {
    jobs: [
      { id: "job-old", user_id: "u1", exam_prep_id: "p1", node_id: "n1", attempt_id: "a1", client_request_id: "c1", credit_idempotency_key: "key-1", status: "creating", updated_at: old },
      { id: "job-fresh", user_id: "u1", exam_prep_id: "p1", node_id: "n2", attempt_id: "a2", client_request_id: "c2", credit_idempotency_key: "key-2", status: "creating", updated_at: fresh },
      { id: "job-done", user_id: "u1", exam_prep_id: "p1", node_id: "n3", attempt_id: "a3", client_request_id: "c3", credit_idempotency_key: "key-3", status: "ready", updated_at: old },
    ],
    attempts: [
      { id: "a1", status: "creating" },
      { id: "a3", status: "completed" },
    ],
    prefetch: [
      { node_id: "n1", user_id: "u1", status: "creating" },
      { node_id: "n1", user_id: "u1", status: "ready" },
    ],
    reservations: [
      { id: "r-pending", idempotency_key: "key-1", status: "pending" },
      { id: "r-committed", idempotency_key: "key-1", status: "committed" },
    ],
    log: [],
  };
}

describe("takılı üretimler", () => {
  beforeEach(() => {
    refunds.ids = [];
    refunds.fail = false;
  });

  it("yalnız 10 dakikadır creating kalan işler listelenir", async () => {
    const { rows, error } = await listStuckGenerations(client(seed()));
    expect(error).toBe(false);
    expect(rows.map((row) => row.id)).toEqual(["job-old"]);
    expect(rows[0].creditKey).toBe("key-1");
  });

  it("kapatma: iş ve oturum failed, yarım önceden-yazım silinir, hazır olan kalır, pending iade edilir", async () => {
    const state = seed();
    const result = await resetStuckGeneration(client(state), "job-old");
    expect(result).toEqual({ ok: true, attemptClosed: true, prefetchDropped: true, refunded: 1 });
    expect(state.jobs[0].status).toBe("failed");
    expect(state.jobs[0].error_code).toBe("admin_reset");
    expect(state.attempts[0].status).toBe("failed");
    expect(state.prefetch).toEqual([{ node_id: "n1", user_id: "u1", status: "ready" }]);
    expect(refunds.ids).toEqual(["r-pending"]);
  });

  it("bitmiş ya da bilinmeyen işe dokunmaz", async () => {
    const state = seed();
    expect(await resetStuckGeneration(client(state), "job-done")).toEqual({ ok: false, error: "not_stuck" });
    expect(await resetStuckGeneration(client(state), "job-none")).toEqual({ ok: false, error: "not_found" });
    expect(state.attempts[1].status).toBe("completed");
    expect(refunds.ids).toEqual([]);
  });

  it("iade düşerse kapatma yine tamamlanır, sayaç gerçeği söyler", async () => {
    refunds.fail = true;
    const state = seed();
    const result = await resetStuckGeneration(client(state), "job-old");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.refunded).toBe(0);
    expect(state.jobs[0].status).toBe("failed");
  });
});
