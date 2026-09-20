import { beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  buildPaytrToken,
  generateMerchantOid,
  isPaytrConfigured,
  paytrMode,
  verifyPaytrCallbackHash,
} from "@/lib/payments/paytr";
import {
  AUTO_RENEW_SUPPORTED,
  RECURRING_BLOCKERS,
} from "@/lib/payments/paytr-capability";
import {
  billingPeriodOf,
  daysUntil,
  hasExpired,
  nextPeriodEnd,
} from "@/lib/payments/subscription";

/**
 * Ödeme duman testi — canlı PayTR anahtarı olmadan kritik yolu doğrular.
 * Canlı get-token çağrısı .env.local'de merchant alanları boş olduğu için
 * burada yok; o adım panel anahtarları girilince manuel/e2e yapılır.
 */
describe("paytr payment smoke", () => {
  const KEY = "smoke-merchant-key";
  const SALT = "smoke-merchant-salt";

  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = "999001";
    process.env.PAYTR_MERCHANT_KEY = KEY;
    process.env.PAYTR_MERCHANT_SALT = SALT;
    process.env.PAYTR_TEST_MODE = "1";
    process.env.PAYTR_NO_INSTALLMENT = "0";
    process.env.PAYTR_MAX_INSTALLMENT = "0";
  });

  it("reports configured + test mode when keys are present", () => {
    expect(isPaytrConfigured()).toBe(true);
    expect(paytrMode()).toBe("test");
  });

  it("reports unconfigured when any merchant secret is blank", () => {
    process.env.PAYTR_MERCHANT_KEY = "";
    expect(isPaytrConfigured()).toBe(false);
    expect(paytrMode()).toBe("unconfigured");
  });

  it("builds iframe token params with DB amount in kuruş", () => {
    const oid = generateMerchantOid();
    const { params, token } = buildPaytrToken({
      merchantOid: oid,
      email: "smoke@cortexplus.app",
      amountKurus: 59900,
      userIp: "203.0.113.10",
      userName: "Smoke Test",
      productName: "Cortex Plus Aylik",
      okUrl: "https://cortexplus.app/odeme/basarili",
      failUrl: "https://cortexplus.app/odeme/basarisiz",
    });

    expect(token.length).toBeGreaterThan(10);
    expect(params.get("payment_amount")).toBe("59900");
    expect(params.get("merchant_oid")).toBe(oid);
    expect(params.get("test_mode")).toBe("1");
    expect(params.get("merchant_ok_url")).toContain("/odeme/basarili");
    expect(params.get("merchant_fail_url")).toContain("/odeme/basarisiz");
  });

  it("accepts a callback hash that matches the signed payload", () => {
    const merchantOid = generateMerchantOid();
    const status = "success";
    const totalAmount = "59900";
    const hash = crypto
      .createHmac("sha256", KEY)
      .update(merchantOid + SALT + status + totalAmount)
      .digest("base64");

    expect(
      verifyPaytrCallbackHash({ merchantOid, status, totalAmount, hash }),
    ).toBe(true);
  });

  it("rejects forged callbacks before any entitlement write", () => {
    expect(
      verifyPaytrCallbackHash({
        merchantOid: "cpforged",
        status: "success",
        totalAmount: "59900",
        hash: "not-a-real-hash==============",
      }),
    ).toBe(false);
  });

  it("keeps auto-renew off until recurring blockers are cleared", () => {
    expect(AUTO_RENEW_SUPPORTED).toBe(false);
    expect(RECURRING_BLOCKERS.length).toBeGreaterThan(0);
  });

  it("extends subscription period from remaining time (no burn on early renew)", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const currentEnd = new Date("2026-09-30T12:00:00.000Z");
    const next = nextPeriodEnd(currentEnd.toISOString(), 30, now);
    expect(daysUntil(next.toISOString(), now)).toBe(40);
    expect(
      hasExpired({ status: "active", current_period_end: currentEnd.toISOString() }, now),
    ).toBe(false);
    expect(billingPeriodOf({ billing_period: "monthly", is_premium: true })).toBe(
      "monthly",
    );
  });
});
