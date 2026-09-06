import { describe, expect, it } from "vitest";
import {
  RENEWAL_REMINDER_DAYS,
  billingPeriodOf,
  daysUntil,
  hasExpired,
  isSubscriptionPlan,
  needsRenewalReminder,
  nextPeriodEnd,
  planPeriodDays,
} from "@/lib/payments/subscription";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-05T12:00:00.000Z");

function iso(offsetDays: number, from: Date = NOW) {
  return new Date(from.getTime() + offsetDays * DAY).toISOString();
}

describe("billingPeriodOf", () => {
  it("reads the column when it is set", () => {
    expect(billingPeriodOf({ billing_period: "yearly" })).toBe("yearly");
    expect(billingPeriodOf({ billing_period: "monthly" })).toBe("monthly");
    expect(billingPeriodOf({ billing_period: "one_time" })).toBe("one_time");
  });

  it("falls back to the old is_premium rule for rows written before the column", () => {
    expect(billingPeriodOf({ is_premium: true })).toBe("monthly");
    expect(billingPeriodOf({ name: "Cortex Plus" })).toBe("monthly");
    expect(billingPeriodOf({ name: "Başlangıç" })).toBe("one_time");
    expect(billingPeriodOf(null)).toBe("one_time");
  });

  it("keeps one_time out of the subscription path", () => {
    expect(isSubscriptionPlan({ billing_period: "one_time" })).toBe(false);
    expect(isSubscriptionPlan({ billing_period: "yearly" })).toBe(true);
  });
});

describe("planPeriodDays", () => {
  it("prefers the plan's own period", () => {
    expect(planPeriodDays({ billing_period: "monthly", period_days: 30 })).toBe(30);
    expect(planPeriodDays({ billing_period: "yearly", period_days: 365 })).toBe(365);
    expect(planPeriodDays({ billing_period: "monthly", period_days: 90 })).toBe(90);
  });

  it("derives a sane length when period_days is missing", () => {
    expect(planPeriodDays({ billing_period: "yearly" })).toBe(365);
    expect(planPeriodDays({ billing_period: "monthly" })).toBe(30);
    expect(planPeriodDays(null)).toBe(30);
  });
});

describe("nextPeriodEnd", () => {
  it("stacks onto the remaining days instead of burning them", () => {
    // 10 gün kalmışken aylık yenileme: 30 değil 40 gün olmalı.
    const end = nextPeriodEnd(iso(10), 30, NOW);
    expect(end.getTime()).toBe(NOW.getTime() + 40 * DAY);
  });

  it("starts from today when the old period already ran out", () => {
    const end = nextPeriodEnd(iso(-5), 30, NOW);
    expect(end.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it("starts from today for a first purchase", () => {
    expect(nextPeriodEnd(null, 365, NOW).getTime()).toBe(
      NOW.getTime() + 365 * DAY,
    );
  });

  it("ignores an unparseable stored date rather than producing NaN", () => {
    const end = nextPeriodEnd("çöp", 30, NOW);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(end.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });
});

describe("needsRenewalReminder", () => {
  const base = {
    status: "active",
    current_period_start: iso(-27),
    current_period_end: iso(3),
    renewal_reminder_sent_at: null,
    cancel_at_period_end: false,
  };

  it("fires inside the reminder window", () => {
    expect(needsRenewalReminder(base, NOW)).toBe(true);
    expect(RENEWAL_REMINDER_DAYS).toBe(3);
  });

  it("stays quiet while the period still has room", () => {
    expect(
      needsRenewalReminder({ ...base, current_period_end: iso(10) }, NOW),
    ).toBe(false);
  });

  it("does not nag someone who already cancelled", () => {
    expect(
      needsRenewalReminder({ ...base, cancel_at_period_end: true }, NOW),
    ).toBe(false);
  });

  it("sends only once per period", () => {
    const alreadySent = { ...base, renewal_reminder_sent_at: iso(-1) };
    expect(needsRenewalReminder(alreadySent, NOW)).toBe(false);
  });

  it("sends again after a renewal moved the period start forward", () => {
    const renewed = {
      ...base,
      current_period_start: iso(-1),
      renewal_reminder_sent_at: iso(-2),
    };
    expect(needsRenewalReminder(renewed, NOW)).toBe(true);
  });

  it("ignores subscriptions that are not active", () => {
    expect(needsRenewalReminder({ ...base, status: "inactive" }, NOW)).toBe(false);
  });
});

describe("hasExpired", () => {
  it("catches an active row whose period is behind us", () => {
    expect(
      hasExpired({ status: "active", current_period_end: iso(-1) }, NOW),
    ).toBe(true);
  });

  it("leaves a live period alone", () => {
    expect(
      hasExpired({ status: "active", current_period_end: iso(1) }, NOW),
    ).toBe(false);
  });

  it("expires immediately after the stored timestamp", () => {
    expect(
      hasExpired(
        { status: "active", current_period_end: iso(-0.01) },
        NOW,
      ),
    ).toBe(true);
  });

  it("says nothing about rows that are already inactive", () => {
    expect(
      hasExpired({ status: "inactive", current_period_end: iso(-30) }, NOW),
    ).toBe(false);
  });
});

describe("daysUntil", () => {
  it("counts whole days ahead and behind", () => {
    expect(daysUntil(iso(3), NOW)).toBe(3);
    expect(daysUntil(iso(-2), NOW)).toBe(-2);
    expect(daysUntil(null, NOW)).toBeNull();
  });
});
