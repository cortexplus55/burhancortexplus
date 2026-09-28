import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  payments: [] as Row[],
  plans: [] as Row[],
  refunds: [] as Row[],
  credit_ledger: [] as Row[],
  credit_wallets: [] as Row[],
  subscriptions: [] as Row[],
  notifications: [] as Row[],
  rpc: vi.fn(),
  user: null as { id: string } | null,
  adminRow: null as { role: string } | null,
  creditFailOnce: false,
  __subUpdateError: undefined as string | undefined,
}));

function matches(row: Row, filters: [string, unknown][]) {
  return filters.every(([k, v]) => row[k] === v);
}

function tableApi(name: keyof typeof db) {
  const filters: [string, unknown][] = [];
  let writePayload: Row | null = null;
  let op: "select" | "update" | "insert" = "select";

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return api;
    },
    in: () => api,
    order: () => api,
    limit: () => api,
    update: (payload: Row) => {
      op = "update";
      writePayload = payload;
      return api;
    },
    insert: (payload: Row) => {
      op = "insert";
      writePayload = payload;
      return api;
    },
    maybeSingle: async () => {
      if (op === "insert" && writePayload) {
        const row = {
          id: `id-${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date().toISOString(),
          ...writePayload,
        };
        (db[name] as Row[]).push(row);
        return { data: row, error: null };
      }
      if (op === "update" && writePayload) {
        const rows = db[name] as Row[];
        const idx = rows.findIndex((r) => matches(r, filters));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...writePayload };
        return { data: idx >= 0 ? rows[idx] : null, error: null };
      }
      const found = (db[name] as Row[]).find((r) => matches(r, filters)) ?? null;
      return { data: found, error: null };
    },
    then: (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void,
    ) => {
      try {
        if (op === "insert" && writePayload) {
          const row = {
            id: `id-${Math.random().toString(36).slice(2, 8)}`,
            created_at: new Date().toISOString(),
            ...writePayload,
          };
          (db[name] as Row[]).push(row);
          resolve({ data: [row], error: null });
          return;
        }
        if (op === "update" && writePayload) {
          const rows = db[name] as Row[];
          let error: { message: string } | null = null;
          for (let i = 0; i < rows.length; i++) {
            if (matches(rows[i], filters)) {
              if (name === "subscriptions" && db.__subUpdateError) {
                error = { message: db.__subUpdateError };
                break;
              }
              rows[i] = { ...rows[i], ...writePayload };
            }
          }
          resolve({ data: null, error });
          return;
        }
        const rows = (db[name] as Row[]).filter((r) => matches(r, filters));
        resolve({ data: rows, error: null });
      } catch (e) {
        reject?.(e);
      }
    },
  };
  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: db.adminRow,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return tableApi(table as keyof typeof db);
    },
  }),
  createServiceClient: () => ({
    rpc: db.rpc,
    from: (table: string) => tableApi(table as keyof typeof db),
  }),
}));

vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/smtp", () => ({ verifySmtpConnection: vi.fn() }));

const paytr = vi.hoisted(() => ({
  requestPaytrRefund: vi.fn(),
  queryPaytrStatus: vi.fn(),
}));
vi.mock("@/lib/payments/paytr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/paytr")>(
    "@/lib/payments/paytr",
  );
  return {
    ...actual,
    requestPaytrRefund: paytr.requestPaytrRefund,
    queryPaytrStatus: paytr.queryPaytrStatus,
  };
});

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";

function resetDb() {
  db.payments = [];
  db.plans = [];
  db.refunds = [];
  db.credit_ledger = [];
  db.credit_wallets = [];
  db.subscriptions = [];
  db.notifications = [];
  db.__subUpdateError = undefined;
  db.creditFailOnce = false;
  db.rpc.mockReset();
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "apply_payment_refund") {
      return {
        data: null,
        error: { code: "42883", message: "function does not exist" },
      };
    }
    if (name === "credit_adjust_balance") {
      if (db.creditFailOnce) {
        db.creditFailOnce = false;
        return { data: null, error: { message: "insufficient_balance" } };
      }
      const key = String(args.p_idempotency_key);
      const existing = db.credit_ledger.find((r) => r.idempotency_key === key);
      if (existing) return { data: existing.balance_after, error: null };
      const wallet = db.credit_wallets.find((w) => w.user_id === args.p_user_id);
      if (!wallet) return { data: null, error: { message: "wallet_not_found" } };
      const delta = Number(args.p_delta);
      const next = Number(wallet.balance) + delta;
      if (next < 0) return { data: null, error: { message: "insufficient_balance" } };
      wallet.balance = next;
      db.credit_ledger.push({
        id: `led-${db.credit_ledger.length}`,
        user_id: args.p_user_id,
        delta,
        balance_after: next,
        entry_type: args.p_entry_type,
        idempotency_key: key,
        metadata: { reason: args.p_reason },
      });
      return { data: next, error: null };
    }
    return { data: null, error: null };
  });
}

function seedCreditPack(balance = 150, purchased = 150) {
  db.payments = [
    {
      id: PAYMENT_ID,
      status: "paid",
      user_id: USER_ID,
      beneficiary_user_id: USER_ID,
      plan_id: "plan-credit",
      merchant_oid: "cpcreditpack01",
      amount_try: 15000,
    },
  ];
  db.plans = [
    {
      id: "plan-credit",
      credit_amount: 150,
      is_premium: false,
      tier: null,
      period_days: null,
      name: "ek-kredi-150",
    },
  ];
  db.credit_ledger = [
    {
      id: "led-purchase",
      user_id: USER_ID,
      delta: purchased,
      entry_type: "purchase",
      idempotency_key: "pay_cpcreditpack01",
    },
  ];
  db.credit_wallets = [{ user_id: USER_ID, balance, reserved: 0 }];
}

function seedPlusPaymentActiveSigma(opts?: {
  paymentStatus?: string;
  periodEnd?: string;
}) {
  db.payments = [
    {
      id: PAYMENT_ID,
      status: opts?.paymentStatus ?? "paid",
      user_id: USER_ID,
      beneficiary_user_id: USER_ID,
      plan_id: "plan-plus",
      merchant_oid: "cpplusold0001",
      amount_try: 59900,
    },
  ];
  db.plans = [
    {
      id: "plan-plus",
      credit_amount: 0,
      is_premium: true,
      tier: "plus",
      period_days: 30,
      name: "Plus",
    },
  ];
  db.credit_wallets = [
    {
      user_id: USER_ID,
      balance: 0,
      reserved: 0,
      free_allowance_remaining: 400,
    },
  ];
  db.subscriptions = [
    {
      id: "sub-1",
      user_id: USER_ID,
      plan_id: "plan-sigma",
      status: "active",
      current_period_end:
        opts?.periodEnd ??
        new Date(Date.now() + 10 * 86400000).toISOString(),
    },
  ];
}

function appliedRefundCount() {
  return db.refunds.filter((r) => {
    try {
      return JSON.parse(String(r.reason)).state === "applied";
    } catch {
      return false;
    }
  }).length;
}

function applyingRefundCount() {
  return db.refunds.filter((r) => {
    try {
      return JSON.parse(String(r.reason)).state === "applying";
    } catch {
      return false;
    }
  }).length;
}

const {
  markPaymentRefunded,
  recordExternalRefund,
  reconcilePaymentWithPaytr,
} = await import("@/app/admin/actions");
const { applyPaymentRefund } = await import("@/lib/payments/refund");
const { createServiceClient } = await import("@/lib/supabase/server");

beforeEach(() => {
  db.user = { id: ACTOR_ID };
  db.adminRow = { role: "admin" };
  resetDb();
  paytr.requestPaytrRefund.mockReset();
  paytr.queryPaytrStatus.mockReset();
});

describe("B1 resume after partial failure", () => {
  it("kredi adımı bir kez düşerse applied yazılmaz; retry tamamlar", async () => {
    seedCreditPack(150);
    db.creditFailOnce = true;
    const service = createServiceClient();

    const first = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "ref-b1",
      actorId: ACTOR_ID,
    });
    expect(first.ok).toBe(false);
    expect(first.errorStep).toBe("credit_adjust_balance");
    expect(appliedRefundCount()).toBe(0);
    expect(applyingRefundCount()).toBe(1);
    expect(db.credit_wallets[0].balance).toBe(150);
    expect(db.payments[0].status).toBe("paid");

    const second = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "ref-b1",
      actorId: ACTOR_ID,
    });
    expect(second.ok).toBe(true);
    expect(second.noop).not.toBe(true);
    expect(second.reversed).toBe(150);
    expect(db.credit_wallets[0].balance).toBe(0);
    expect(appliedRefundCount()).toBe(1);
    expect(db.payments[0].status).toBe("refunded");
  });
});

describe("B2/B3 reconcile by amount delta", () => {
  it("reference_no yokken reconcile ×2 → tek uygulama (B2)", async () => {
    seedCreditPack(150);
    paytr.queryPaytrStatus.mockResolvedValue({
      ok: true,
      status: "success",
      returns: [{ returnAmountTry: 50, referenceNo: undefined, raw: {} }],
      raw: {},
    });

    const a = await reconcilePaymentWithPaytr(PAYMENT_ID);
    const b = await reconcilePaymentWithPaytr(PAYMENT_ID);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(appliedRefundCount()).toBe(1);
    expect(db.credit_wallets[0].balance).toBe(100);
    expect(db.payments[0].status).toBe("paid");
  });

  it("kaydet sonra kontrol et çift saymaz (B3)", async () => {
    seedCreditPack(150);
    const recorded = await recordExternalRefund({
      paymentId: PAYMENT_ID,
      amountKurus: 7500,
      // ref yok — eski bug random üretirdi
    });
    expect(recorded.ok).toBe(true);
    expect(db.credit_wallets[0].balance).toBe(75);

    paytr.queryPaytrStatus.mockResolvedValue({
      ok: true,
      status: "success",
      returns: [{ returnAmountTry: 75, referenceNo: undefined, raw: {} }],
      raw: {},
    });

    const recon = await reconcilePaymentWithPaytr(PAYMENT_ID);
    expect(recon.ok).toBe(true);
    expect(recon.appliedCount).toBe(0);
    expect(appliedRefundCount()).toBe(1);
    expect(db.credit_wallets[0].balance).toBe(75);
    expect(db.payments[0].status).toBe("paid");
  });
});

describe("B5 legacy refunded payment", () => {
  it("eski refunded Plus kaydı yeni aboneliği iptal etmez", async () => {
    seedPlusPaymentActiveSigma({ paymentStatus: "refunded" });
    // refunds yok → legacy
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 59900,
      source: "admin",
      providerRef: "legacy-plus",
      actorId: ACTOR_ID,
    });
    expect(result.ok).toBe(true);
    expect(result.cancelSubscription).toBe(false);
    expect(db.subscriptions[0].status).toBe("active");
    expect(db.credit_wallets[0].free_allowance_remaining).toBe(400);
  });

  it("Plus→Sigma sonrası eski ödeme iadesi hâlâ aktif aboneliği geri alır", async () => {
    seedPlusPaymentActiveSigma({ paymentStatus: "paid" });
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 59900,
      source: "admin",
      providerRef: "plus-old",
      actorId: ACTOR_ID,
    });
    expect(result.ok).toBe(true);
    expect(result.cancelSubscription).toBe(true);
    expect(db.subscriptions[0].status).toBe("cancelled");
  });
});

describe("markPaymentRefunded locks", () => {
  it("T9: Promise.all çift çağrı → PayTR en fazla 1 (gerçek yarış)", async () => {
    seedCreditPack(150);
    paytr.requestPaytrRefund.mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ok: true, status: "success", raw: {} }),
            30,
          ),
        ),
    );

    const results = await Promise.all([
      markPaymentRefunded(PAYMENT_ID),
      markPaymentRefunded(PAYMENT_ID),
    ]);

    expect(paytr.requestPaytrRefund.mock.calls.length).toBeLessThanOrEqual(1);
    const oks = results.filter((r) => r.ok).length;
    expect(oks).toBeLessThanOrEqual(1);
  });

  it("T10: PayTR başarısız → defter değişmez", async () => {
    seedCreditPack(150);
    paytr.requestPaytrRefund.mockResolvedValue({
      ok: false,
      status: "error",
      errMsg: "test mode",
      raw: {},
    });
    const result = await markPaymentRefunded(PAYMENT_ID);
    expect(result.ok).toBe(false);
    expect(db.credit_wallets[0].balance).toBe(150);
    expect(db.payments[0].status).toBe("paid");
  });

  it("geçersiz tutar reddedilir", async () => {
    seedCreditPack(150);
    const result = await markPaymentRefunded(PAYMENT_ID, Number.NaN as unknown as number);
    expect(result.ok).toBe(false);
    expect(paytr.requestPaytrRefund).not.toHaveBeenCalled();
  });
});

describe("idempotency + errors", () => {
  it("T8: aynı ref iki kez → ikinci noop", async () => {
    seedCreditPack(150);
    const service = createServiceClient();
    const first = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "ref-same",
      actorId: ACTOR_ID,
    });
    expect(first.ok).toBe(true);
    const second = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "ref-same",
      actorId: ACTOR_ID,
    });
    expect(second.noop).toBe(true);
    expect(
      db.credit_ledger.filter((l) =>
        String(l.idempotency_key).startsWith("payment_refund:"),
      ),
    ).toHaveLength(1);
  });

  it("T15 wallet_not_found → applied yazılmaz", async () => {
    seedCreditPack(150);
    db.rpc.mockImplementation(async (name: string) => {
      if (name === "apply_payment_refund") {
        return {
          data: null,
          error: { code: "42883", message: "does not exist" },
        };
      }
      if (name === "credit_adjust_balance") {
        return { data: null, error: { message: "wallet_not_found" } };
      }
      return { data: null, error: null };
    });
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "err-wallet",
      actorId: ACTOR_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.partialFailure).toBe(true);
    expect(appliedRefundCount()).toBe(0);
    expect(applyingRefundCount()).toBe(1);
  });
});

describe("T16 spent credits", () => {
  it("120 bakiye / 150 satın alma → 120 reverse, 30 unrecovered", async () => {
    seedCreditPack(120, 150);
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "full-spent",
      actorId: ACTOR_ID,
    });
    expect(result.reversed).toBe(120);
    expect(result.unrecovered).toBe(30);
    expect(db.credit_wallets[0].balance).toBe(0);
    expect(db.payments[0].status).toBe("refunded");
  });
});
