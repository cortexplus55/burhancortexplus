import { describe, expect, it } from "vitest";
import {
  computeRefundPlan,
  isPaymentRefundLedgerEntry,
  reconcileDeltaRef,
  refundLedgerIdempotencyKey,
  shouldTouchSubscription,
  sumAppliedRefunds,
} from "@/lib/payments/refund";
import { parsePaytrTryToKurus } from "@/lib/payments/paytr";

describe("computeRefundPlan", () => {
  it("T1: 150 kredi, bakiye 150, tam iade → reversed 150, unrecovered 0", () => {
    const plan = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 15000,
      alreadyRefundedKurus: 0,
      purchasedCredits: 150,
      alreadyReversedCredits: 0,
      availableBalance: 150,
      isSubscription: false,
    });
    expect(plan.isFull).toBe(true);
    expect(plan.toReverse).toBe(150);
    expect(plan.reversed).toBe(150);
    expect(plan.unrecovered).toBe(0);
  });

  it("T2: 150 kredi, bakiye 40 → reversed 40, unrecovered 110", () => {
    const plan = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 15000,
      alreadyRefundedKurus: 0,
      purchasedCredits: 150,
      alreadyReversedCredits: 0,
      availableBalance: 40,
      isSubscription: false,
    });
    expect(plan.reversed).toBe(40);
    expect(plan.unrecovered).toBe(110);
  });

  it("T3: kısmi %50 ×2 toplam 150'yi aşmaz", () => {
    const first = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 7500,
      alreadyRefundedKurus: 0,
      purchasedCredits: 150,
      alreadyReversedCredits: 0,
      availableBalance: 150,
      isSubscription: false,
    });
    const second = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 7500,
      alreadyRefundedKurus: 7500,
      purchasedCredits: 150,
      alreadyReversedCredits: 75,
      availableBalance: 75,
      isSubscription: false,
    });
    expect(first.toReverse + second.toReverse).toBe(150);
    expect(second.isFull).toBe(true);
  });

  it("T4: floor — 3 kuruş artığı kredi üretmez", () => {
    const plan = computeRefundPlan({
      paidKurus: 10000,
      refundKurus: 3,
      alreadyRefundedKurus: 0,
      purchasedCredits: 100,
      alreadyReversedCredits: 0,
      availableBalance: 100,
      isSubscription: false,
    });
    expect(plan.toReverse).toBe(0);
  });

  it("T5/T6 abonelik tam/kısmi", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const cancel = computeRefundPlan({
      paidKurus: 59900,
      refundKurus: 59900,
      alreadyRefundedKurus: 0,
      purchasedCredits: 0,
      alreadyReversedCredits: 0,
      availableBalance: 0,
      isSubscription: true,
      periodDays: 30,
      currentPeriodEnd: new Date("2026-10-20T12:00:00Z"),
      now,
    });
    expect(cancel.cancelSubscription).toBe(true);

    const shrink = computeRefundPlan({
      paidKurus: 59900,
      refundKurus: 59900,
      alreadyRefundedKurus: 0,
      purchasedCredits: 0,
      alreadyReversedCredits: 0,
      availableBalance: 0,
      isSubscription: true,
      periodDays: 30,
      currentPeriodEnd: new Date("2026-11-15T12:00:00Z"),
      now,
    });
    expect(shrink.cancelSubscription).toBe(false);
    expect(shrink.shrinkPeriodEnd).toBeTruthy();

    const partial = computeRefundPlan({
      paidKurus: 59900,
      refundKurus: 10000,
      alreadyRefundedKurus: 0,
      purchasedCredits: 0,
      alreadyReversedCredits: 0,
      availableBalance: 0,
      isSubscription: true,
      periodDays: 30,
      currentPeriodEnd: new Date("2026-10-20T12:00:00Z"),
    });
    expect(partial.cancelSubscription).toBe(false);
    expect(partial.shrinkPeriodEnd).toBeNull();
  });

  it("B5: touchSubscription=false iken abonelik planı değişmez", () => {
    const plan = computeRefundPlan({
      paidKurus: 59900,
      refundKurus: 59900,
      alreadyRefundedKurus: 0,
      purchasedCredits: 0,
      alreadyReversedCredits: 0,
      availableBalance: 0,
      isSubscription: true,
      touchSubscription: false,
      periodDays: 30,
      currentPeriodEnd: new Date("2026-10-20T12:00:00Z"),
    });
    expect(plan.skipSubscription).toBe(true);
    expect(plan.cancelSubscription).toBe(false);
    expect(plan.shrinkPeriodEnd).toBeNull();
  });
});

describe("shouldTouchSubscription / B5", () => {
  it("legacy refunded + refunds yok → aboneliğe dokunma", () => {
    expect(
      shouldTouchSubscription({
        paymentStatus: "refunded",
        alreadyRefundedKurus: 0,
        isSubscription: true,
      }),
    ).toBe(false);
  });

  it("paid abonelik ödemesi → dokun", () => {
    expect(
      shouldTouchSubscription({
        paymentStatus: "paid",
        alreadyRefundedKurus: 0,
        isSubscription: true,
      }),
    ).toBe(true);
  });
});

describe("sumAppliedRefunds", () => {
  it("yalnızca applied sayılır; applying/pending tutara girmez (B1)", () => {
    const sum = sumAppliedRefunds([
      {
        id: "1",
        amount_try: 15000,
        reason: JSON.stringify({
          state: "applying",
          ref: "r1",
          kind: "payment_refund",
          merchant_oid: "x",
          payment_id: "p",
          source: "admin",
          reversed: 150,
        }),
        created_at: new Date().toISOString(),
      },
      {
        id: "2",
        amount_try: 5000,
        reason: JSON.stringify({
          state: "applied",
          ref: "r2",
          kind: "payment_refund",
          merchant_oid: "x",
          payment_id: "p",
          source: "admin",
          reversed: 50,
        }),
        created_at: new Date().toISOString(),
      },
    ]);
    expect(sum.alreadyRefundedKurus).toBe(5000);
    expect(sum.alreadyReversedCredits).toBe(50);
    expect(sum.appliedRefs.has("r2")).toBe(true);
    expect(sum.appliedRefs.has("r1")).toBe(false);
    expect(sum.inProgressByRef.has("r1")).toBe(true);
  });
});

describe("reconcileDeltaRef", () => {
  it("aynı toplam → aynı ref (B2 uydurma ref yok)", () => {
    expect(reconcileDeltaRef("cpoid", 5000)).toBe(reconcileDeltaRef("cpoid", 5000));
    expect(reconcileDeltaRef("cpoid", 5000)).not.toBe(reconcileDeltaRef("cpoid", 7500));
  });
});

describe("parsePaytrTryToKurus", () => {
  it("TR binlik ayraçlı tutarı okur (B2)", () => {
    expect(parsePaytrTryToKurus("1.234,56")).toBe(123456);
    expect(parsePaytrTryToKurus("10,8")).toBe(1080);
    expect(parsePaytrTryToKurus("10.80")).toBe(1080);
  });
});

describe("refundLedgerIdempotencyKey / labels", () => {
  it("tam iade :full", () => {
    expect(
      refundLedgerIdempotencyKey({
        merchantOid: "cpabc",
        providerRef: "adm1",
        isFull: true,
        alreadyRefundedKurus: 0,
      }),
    ).toBe("payment_refund:cpabc:full");
  });

  it("payment_refund önekini tanır", () => {
    expect(
      isPaymentRefundLedgerEntry({
        entry_type: "adjustment",
        idempotency_key: "payment_refund:cp:full",
      }),
    ).toBe(true);
  });
});
