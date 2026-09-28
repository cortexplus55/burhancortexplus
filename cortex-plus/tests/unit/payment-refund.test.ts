import { describe, expect, it } from "vitest";
import {
  computeRefundPlan,
  isPaymentRefundLedgerEntry,
  refundLedgerIdempotencyKey,
} from "@/lib/payments/refund";

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
    expect(plan.cancelSubscription).toBe(false);
  });

  it("T2: 150 kredi, bakiye 40, tam iade → reversed 40, unrecovered 110", () => {
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
    expect(plan.toReverse).toBe(150);
  });

  it("T3: kısmi %50 sonra ikinci %50 toplam 150'yi aşmaz", () => {
    const first = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 7500,
      alreadyRefundedKurus: 0,
      purchasedCredits: 150,
      alreadyReversedCredits: 0,
      availableBalance: 150,
      isSubscription: false,
    });
    expect(first.toReverse).toBe(75);
    expect(first.isFull).toBe(false);

    const second = computeRefundPlan({
      paidKurus: 15000,
      refundKurus: 7500,
      alreadyRefundedKurus: 7500,
      purchasedCredits: 150,
      alreadyReversedCredits: 75,
      availableBalance: 75,
      isSubscription: false,
    });
    expect(second.toReverse).toBe(75);
    expect(second.isFull).toBe(true);
    expect(first.toReverse + second.toReverse).toBe(150);
  });

  it("T4: floor yuvarlama — 3 kuruş artığı kredi üretmez", () => {
    // 100 kredi, 3 kuruş iade → floor(100 * 3 / 10000) = 0
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
    expect(plan.reversed).toBe(0);
  });

  it("T5a: abonelik tam iade, önceki dönem yok → cancel", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const plan = computeRefundPlan({
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
    // new_end = Oct 20 - 30d = Sep 20 <= now Sep 28 → cancel
    expect(plan.cancelSubscription).toBe(true);
    expect(plan.shrinkPeriodEnd).toBeNull();
  });

  it("T5b: abonelik tam iade, önceki dönem sürüyor → shrink", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const plan = computeRefundPlan({
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
    // new_end = Nov 15 - 30d = Oct 16 > now → keep active
    expect(plan.cancelSubscription).toBe(false);
    expect(plan.shrinkPeriodEnd).toBe(new Date("2026-10-16T12:00:00Z").toISOString());
  });

  it("T6: abonelik kısmi iade → abonelik değişmez", () => {
    const plan = computeRefundPlan({
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
    expect(plan.isFull).toBe(false);
    expect(plan.cancelSubscription).toBe(false);
    expect(plan.shrinkPeriodEnd).toBeNull();
  });

  it("T7: purchase ledger yoksa kredi geri alma 0", () => {
    const plan = computeRefundPlan({
      paidKurus: 5000,
      refundKurus: 5000,
      alreadyRefundedKurus: 0,
      purchasedCredits: 0,
      alreadyReversedCredits: 0,
      availableBalance: 20,
      isSubscription: false,
    });
    expect(plan.toReverse).toBe(0);
    expect(plan.reversed).toBe(0);
    expect(plan.unrecovered).toBe(0);
  });
});

describe("refundLedgerIdempotencyKey", () => {
  it("tek seferlik tam iade için :full kullanır", () => {
    expect(
      refundLedgerIdempotencyKey({
        merchantOid: "cpabc",
        providerRef: "adm1",
        isFull: true,
        alreadyRefundedKurus: 0,
      }),
    ).toBe("payment_refund:cpabc:full");
  });

  it("kısmi / tamamlayan iade için providerRef kullanır", () => {
    expect(
      refundLedgerIdempotencyKey({
        merchantOid: "cpabc",
        providerRef: "ref-2",
        isFull: true,
        alreadyRefundedKurus: 100,
      }),
    ).toBe("payment_refund:cpabc:ref-2");
  });
});

describe("isPaymentRefundLedgerEntry", () => {
  it("payment_refund önekini tanır", () => {
    expect(
      isPaymentRefundLedgerEntry({
        entry_type: "adjustment",
        idempotency_key: "payment_refund:cp:full",
      }),
    ).toBe(true);
    expect(
      isPaymentRefundLedgerEntry({
        entry_type: "adjustment",
        metadata: { reason: "payment_refund:cp" },
      }),
    ).toBe(true);
    expect(
      isPaymentRefundLedgerEntry({
        entry_type: "adjustment",
        idempotency_key: "admin_grant:1",
      }),
    ).toBe(false);
  });
});
