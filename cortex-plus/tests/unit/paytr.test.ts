import { describe, expect, it, beforeEach } from "vitest";
import crypto from "crypto";
import {
  buildBasket,
  buildPaytrToken,
  generateMerchantOid,
  isPaytrConfigured,
  verifyPaytrCallbackHash,
} from "@/lib/payments/paytr";

const MERCHANT_KEY = "test-merchant-key";
const MERCHANT_SALT = "test-merchant-salt";

function signCallback(merchantOid: string, status: string, totalAmount: string) {
  return crypto
    .createHmac("sha256", MERCHANT_KEY)
    .update(merchantOid + MERCHANT_SALT + status + totalAmount)
    .digest("base64");
}

describe("paytr callback verification", () => {
  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = "123456";
    process.env.PAYTR_MERCHANT_KEY = MERCHANT_KEY;
    process.env.PAYTR_MERCHANT_SALT = MERCHANT_SALT;
    process.env.PAYTR_TEST_MODE = "1";
  });

  it("accepts a correctly signed callback", () => {
    const merchantOid = "cpabc123";
    const hash = signCallback(merchantOid, "success", "29900");
    expect(
      verifyPaytrCallbackHash({
        merchantOid,
        status: "success",
        totalAmount: "29900",
        hash,
      }),
    ).toBe(true);
  });

  it("rejects a tampered amount", () => {
    const merchantOid = "cpabc123";
    const hash = signCallback(merchantOid, "success", "29900");
    expect(
      verifyPaytrCallbackHash({
        merchantOid,
        status: "success",
        totalAmount: "1",
        hash,
      }),
    ).toBe(false);
  });

  it("rejects a hash of a different length without throwing", () => {
    expect(
      verifyPaytrCallbackHash({
        merchantOid: "cpabc123",
        status: "success",
        totalAmount: "29900",
        hash: "short",
      }),
    ).toBe(false);
  });

  it("rejects everything when credentials are missing", () => {
    delete process.env.PAYTR_MERCHANT_KEY;
    delete process.env.PAYTR_MERCHANT_SALT;
    expect(isPaytrConfigured()).toBe(false);
    expect(
      verifyPaytrCallbackHash({
        merchantOid: "cpabc123",
        status: "success",
        totalAmount: "29900",
        hash: "anything",
      }),
    ).toBe(false);
  });
});

describe("paytr token request", () => {
  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = "123456";
    process.env.PAYTR_MERCHANT_KEY = MERCHANT_KEY;
    process.env.PAYTR_MERCHANT_SALT = MERCHANT_SALT;
    process.env.PAYTR_TEST_MODE = "1";
    process.env.PAYTR_NO_INSTALLMENT = "0";
    process.env.PAYTR_MAX_INSTALLMENT = "0";
  });

  it("sends the database amount in kuruş and never trusts the client", () => {
    const { params } = buildPaytrToken({
      merchantOid: "cpabc123",
      email: "ogrenci@cortexplus.app",
      amountKurus: 29900,
      userIp: "203.0.113.9",
      userName: "Ogrenci",
      productName: "Cortex Plus",
      okUrl: "https://cortexplus.app/odeme/basarili",
      failUrl: "https://cortexplus.app/odeme/basarisiz",
    });

    expect(params.get("payment_amount")).toBe("29900");
    expect(params.get("merchant_id")).toBe("123456");
    expect(params.get("currency")).toBe("TL");
    expect(params.get("paytr_token")).toBeTruthy();
  });

  it("encodes the basket as base64 JSON", () => {
    const basket = buildBasket("Cortex Plus", 29900);
    expect(JSON.parse(Buffer.from(basket, "base64").toString())).toEqual([
      ["Cortex Plus", "299.00", 1],
    ]);
  });

  it("generates unpredictable alphanumeric order ids", () => {
    const first = generateMerchantOid();
    const second = generateMerchantOid();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^cp[a-f0-9]{28}$/);
  });
});
