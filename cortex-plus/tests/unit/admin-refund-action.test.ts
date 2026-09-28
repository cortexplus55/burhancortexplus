import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hafif bellek içi Supabase stub — applyPaymentRefund / admin action akışları için.
 * Zincir metodları thenable; select+maybeSingle ve list await destekler.
 */

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
        const row = { id: `id-${Math.random().toString(36).slice(2, 8)}`, ...writePayload };
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
              const errFlag = (db as { __subUpdateError?: string }).__subUpdateError;
              if (name === "subscriptions" && errFlag) {
                error = { message: errFlag };
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
  parsePaytrTryToKurus: (v: string | number | undefined) => {
    if (v == null) return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  },
}));
vi.mock("@/lib/payments/paytr", () => paytr);

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
  (db as { __subUpdateError?: string }).__subUpdateError = undefined;
  db.rpc.mockReset();
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "apply_payment_refund") {
      return {
        data: null,
        error: { code: "42883", message: "function does not exist" },
      };
    }
    if (name === "credit_adjust_balance") {
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

function seedPlusPaymentActiveSigma() {
  db.payments = [
    {
      id: PAYMENT_ID,
      status: "paid",
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
  db.credit_wallets = [{ user_id: USER_ID, balance: 0, reserved: 0 }];
  db.subscriptions = [
    {
      id: "sub-1",
      user_id: USER_ID,
      plan_id: "plan-sigma",
      status: "active",
      current_period_end: new Date(Date.now() + 10 * 86400000).toISOString(),
    },
  ];
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

describe("T8 applyPaymentRefund idempotency", () => {
  it("aynı providerRef ile iki kez → tek ledger, ikinci no-op", async () => {
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
    expect(first.reversed).toBe(150);
    expect(db.credit_wallets[0].balance).toBe(0);
    expect(
      db.credit_ledger.filter((l) =>
        String(l.idempotency_key).startsWith("payment_refund:"),
      ),
    ).toHaveLength(1);

    const second = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "ref-same",
      actorId: ACTOR_ID,
    });
    expect(second.ok).toBe(true);
    expect(second.noop).toBe(true);
    expect(
      db.credit_ledger.filter((l) =>
        String(l.idempotency_key).startsWith("payment_refund:"),
      ),
    ).toHaveLength(1);
  });
});

describe("T9–T10 markPaymentRefunded", () => {
  it("T9: pending kilit varken ikinci istek PayTR çağırmaz", async () => {
    seedCreditPack(150);
    db.refunds = [
      {
        id: "pending-lock",
        payment_id: PAYMENT_ID,
        amount_try: 15000,
        reason: JSON.stringify({
          state: "pending",
          ref: "lock-ref",
          source: "admin",
          kind: "payment_refund",
          merchant_oid: "cpcreditpack01",
          payment_id: PAYMENT_ID,
        }),
        created_at: new Date().toISOString(),
      },
    ];
    paytr.requestPaytrRefund.mockResolvedValue({
      ok: true,
      status: "success",
      raw: {},
    });

    const result = await markPaymentRefunded(PAYMENT_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/devam eden/i);
    expect(paytr.requestPaytrRefund).not.toHaveBeenCalled();
  });

  it("T9b: başarılı tek iade PayTR'yi bir kez çağırır", async () => {
    seedCreditPack(150);
    paytr.requestPaytrRefund.mockResolvedValue({
      ok: true,
      status: "success",
      raw: {},
    });
    const result = await markPaymentRefunded(PAYMENT_ID);
    expect(result.ok).toBe(true);
    expect(paytr.requestPaytrRefund).toHaveBeenCalledTimes(1);
  });

  it("T10: PayTR başarısız → bakiye/abonelik/payments değişmez", async () => {
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
    expect(
      db.refunds.some((r) => String(r.reason).includes('"state":"failed"')),
    ).toBe(true);
  });
});

describe("T11 Plus→Sigma eski ödeme iadesi", () => {
  it("aktif abonelik plan_id eşleşmese de iptal edilir", async () => {
    seedPlusPaymentActiveSigma();
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
    expect(db.payments[0].status).toBe("refunded");
  });
});

describe("T12 recordExternalRefund", () => {
  it("PayTR çağrılmaz, defter yazılır", async () => {
    seedCreditPack(120);
    // 150 satın alındı, 30 harcandı → 120 reverse, 30 unrecovered
    const result = await recordExternalRefund({
      paymentId: PAYMENT_ID,
      amountKurus: 15000,
      providerRef: "panel-1",
    });
    expect(paytr.requestPaytrRefund).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.reversed).toBe(120);
    expect(result.unrecovered).toBe(30);
    expect(db.credit_wallets[0].balance).toBe(0);
  });
});

describe("T13 reconcile", () => {
  it("aynı reference_no iki kez → bir kez işlenir", async () => {
    seedCreditPack(150);
    paytr.queryPaytrStatus.mockResolvedValue({
      ok: true,
      status: "success",
      returns: [
        { returnAmountTry: 150, referenceNo: "dup-ref", raw: {} },
        { returnAmountTry: 150, referenceNo: "dup-ref", raw: {} },
      ],
      raw: {},
    });

    const result = await reconcilePaymentWithPaytr(PAYMENT_ID);
    expect(result.ok).toBe(true);
    expect(
      db.credit_ledger.filter((l) =>
        String(l.idempotency_key).startsWith("payment_refund:"),
      ),
    ).toHaveLength(1);
  });
});

describe("T14 admin bypass", () => {
  it("iade admin rolünü değiştirmez", async () => {
    seedCreditPack(0, 50);
    const service = createServiceClient();
    await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 5000,
      source: "admin",
      providerRef: "admin-self",
      actorId: ACTOR_ID,
    });
    expect(db.adminRow).toEqual({ role: "admin" });
  });
});

describe("T15 hata yolları", () => {
  it("wallet_not_found → tamamlandı denmez", async () => {
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
    expect(result.errorStep).toBe("credit_adjust_balance");
    expect(db.payments[0].status).toBe("paid");
  });

  it("subscriptions update hatası → tamamlandı denmez", async () => {
    seedPlusPaymentActiveSigma();
    (db as { __subUpdateError?: string }).__subUpdateError = "permission denied";
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 59900,
      source: "admin",
      providerRef: "err-sub",
      actorId: ACTOR_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.errorStep).toMatch(/subscription/);
  });
});

describe("T16 harcanmış kredi akışı", () => {
  it("150 al → 30 harca → tam iade → 120 reverse, unrecovered 30, status refunded", async () => {
    seedCreditPack(120, 150);
    const service = createServiceClient();
    const result = await applyPaymentRefund(service, {
      paymentId: PAYMENT_ID,
      refundKurus: 15000,
      source: "admin",
      providerRef: "full-spent",
      actorId: ACTOR_ID,
    });
    expect(result.ok).toBe(true);
    expect(result.reversed).toBe(120);
    expect(result.unrecovered).toBe(30);
    expect(db.credit_wallets[0].balance).toBe(0);
    expect(db.payments[0].status).toBe("refunded");
    const refundLedger = db.credit_ledger.find((l) =>
      String(l.idempotency_key).startsWith("payment_refund:"),
    );
    expect(refundLedger?.delta).toBe(-120);
  });
});
