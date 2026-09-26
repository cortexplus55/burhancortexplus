import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  adminRow: null as { role: string } | null,
  rpc: vi.fn(),
}));

function chain(result: unknown) {
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get: (_t, key) => (key === "maybeSingle" ? async () => result : () => proxy),
  });
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => chain({ data: state.adminRow, error: null }),
  }),
  createServiceClient: () => ({ rpc: state.rpc }),
}));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/smtp", () => ({ verifySmtpConnection: vi.fn() }));
vi.mock("@/lib/payments/paytr", () => ({ requestPaytrRefund: vi.fn() }));

const { adjustCredits } = await import("@/app/admin/actions");

const target = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  state.user = { id: "55555555-5555-4555-8555-555555555555" };
  state.adminRow = { role: "admin" };
  state.rpc.mockReset();
});

describe("adjustCredits", () => {
  it("yönetici olmayan çağıramaz: 403 ve veritabanına hiç gidilmez", async () => {
    state.adminRow = null;
    expect(await adjustCredits({ userId: target, delta: 5 })).toEqual({
      ok: false,
      status: 403,
      error: "Yetkisiz işlem.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("oturum yoksa da 403", async () => {
    state.user = null;
    const result = await adjustCredits({ userId: target, delta: 5 });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("+5 grant türüyle gider ve yeni bakiyeyi söyler", async () => {
    state.rpc.mockResolvedValue({ data: 8, error: null });
    const result = await adjustCredits({ userId: target, delta: 5 });
    expect(state.rpc).toHaveBeenCalledWith(
      "credit_adjust_balance",
      expect.objectContaining({ p_user_id: target, p_delta: 5, p_entry_type: "grant" }),
    );
    expect(result).toEqual({ ok: true, message: "Kredi eklendi. Yeni bakiye: 8." });
  });

  it("-3 adjustment türüyle gider", async () => {
    state.rpc.mockResolvedValue({ data: 0, error: null });
    const result = await adjustCredits({ userId: target, delta: -3 });
    expect(state.rpc).toHaveBeenCalledWith(
      "credit_adjust_balance",
      expect.objectContaining({ p_delta: -3, p_entry_type: "adjustment" }),
    );
    expect(result).toEqual({ ok: true, message: "Kredi düşüldü. Yeni bakiye: 0." });
  });

  it("sıfırın altı anlamlı bir metinle reddedilir", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "insufficient_balance" } });
    expect(await adjustCredits({ userId: target, delta: -99 })).toEqual({
      ok: false,
      error: "Bakiye sıfırın altına inemez.",
    });
  });

  it("sıfır tutar veritabanına gitmeden reddedilir", async () => {
    expect(await adjustCredits({ userId: target, delta: 0 })).toMatchObject({ ok: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
