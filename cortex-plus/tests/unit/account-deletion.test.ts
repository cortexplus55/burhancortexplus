import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeUserData, processPendingDeletionRequests } from "@/lib/privacy/account-deletion";

function setup(failure?: string) {
  let hasDocument = true;
  const calls: { table: string; operation: string; filters: unknown[][] }[] = [];
  const remove = vi.fn(async () => ({ error: failure === "storage" ? { code: "unavailable" } : null }));
  const deleteUser = vi.fn(async () => ({ error: failure === "auth" ? { code: "unavailable" } : null }));
  const order = vi.fn();
  const service = {
    from(table: string) {
      const call = { table, operation: "", filters: [] as unknown[][] }; calls.push(call);
      const query = {
        select() { call.operation = "select"; return query; },
        update() { call.operation = "update"; return query; },
        delete() { call.operation = "delete"; return query; },
        eq(...args: unknown[]) { call.filters.push(args); return query; },
        is(...args: unknown[]) { call.filters.push(args); return query; },
        in(...args: unknown[]) { call.filters.push(args); return query; },
        limit() { return query; },
        order(...args: unknown[]) { order(...args); return query; },
        then(resolve: (value: unknown) => unknown) {
          if (failure === table) return Promise.resolve(resolve({ data: null, error: { code: "failed" } }));
          let data: unknown = null;
          if (table === "documents" && call.operation === "select") data = hasDocument ? [{ id: "doc", storage_path: "user/doc/file.pdf" }] : [];
          if (table === "documents" && call.operation === "delete") hasDocument = false;
          if (table === "data_deletion_requests" && call.operation === "select") data = [{ id: "request", user_id: "user" }];
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
    storage: { from: () => ({ remove }) },
    auth: { admin: { deleteUser } },
  } as unknown as SupabaseClient;
  return { service, calls, remove, deleteUser, order };
}

describe("durable account deletion", () => {
  it.each(["profiles", "subscriptions", "conversations", "documents", "storage", "auth"])("does not claim success when %s fails", async (step) => {
    const { service } = setup(step);
    expect((await purgeUserData(service, "user")).ok).toBe(false);
  });
  it("cleans owned content, including soft-deleted files, and preserves financial keys", async () => {
    const { service, calls, remove, deleteUser } = setup();
    expect(await purgeUserData(service, "user")).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(["user/doc/file.pdf"]);
    expect(deleteUser).toHaveBeenCalledWith("user", true);
    expect(calls.filter((c) => c.operation === "delete").every((c) => c.filters.some((f) => f[1] === "user"))).toBe(true);
    expect(calls.some((c) => ["payments", "credit_ledger", "credit_wallets"].includes(c.table))).toBe(false);
    expect(calls.find((c) => c.table === "documents" && c.operation === "select")?.filters).not.toContainEqual(["deleted_at", null]);
  });
  it("worker fails visibly if its queue cannot be read", async () => {
    await expect(processPendingDeletionRequests(setup("data_deletion_requests").service)).rejects.toThrow("data_deletion_queue_unavailable");
  });
  it("worker uses the real requested_at column and never marks a failed purge processed", async () => {
    const { service, calls, order } = setup("storage");
    expect(await processPendingDeletionRequests(service)).toBe(0);
    expect(order).toHaveBeenCalledWith("requested_at", { ascending: true });
    expect(calls.some((c) => c.table === "data_deletion_requests" && c.operation === "update")).toBe(false);
  });
});
