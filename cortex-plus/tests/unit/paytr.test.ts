import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import {
  buildBasket,
  buildPaytrToken,
  buildPaytrStatusToken,
  generateMerchantOid,
  isPaytrConfigured,
  parsePaytrTryToKurus,
  queryPaytrStatus,
  requestPaytrRefund,
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

describe("requestPaytrRefund", () => {
  const MERCHANT_ID = "123456";

  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = MERCHANT_ID;
    process.env.PAYTR_MERCHANT_KEY = MERCHANT_KEY;
    process.env.PAYTR_MERCHANT_SALT = MERCHANT_SALT;
    process.env.PAYTR_TEST_MODE = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the refund token from merchant_id + oid + amount + salt", async () => {
    const merchantOid = "cprefundoid01";
    const returnAmount = Number(299).toFixed(2);
    const expectedToken = Buffer.from(
      crypto
        .createHmac("sha256", MERCHANT_KEY)
        .update(MERCHANT_ID + merchantOid + returnAmount + MERCHANT_SALT)
        .digest(),
    ).toString("base64");

    let postedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        postedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ status: "success", is_test: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await requestPaytrRefund({
      merchantOid,
      returnAmountTry: 299,
      referenceNo: "admin-test",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    const params = new URLSearchParams(postedBody);
    expect(params.get("merchant_id")).toBe(MERCHANT_ID);
    expect(params.get("merchant_oid")).toBe(merchantOid);
    expect(params.get("return_amount")).toBe("299.00");
    expect(params.get("paytr_token")).toBe(expectedToken);
    expect(params.get("reference_no")).toBe("admin-test");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://www.paytr.com/odeme/iade",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
  });

  it("returns a clear error when PayTR is unconfigured", async () => {
    delete process.env.PAYTR_MERCHANT_ID;
    delete process.env.PAYTR_MERCHANT_KEY;
    delete process.env.PAYTR_MERCHANT_SALT;
    const result = await requestPaytrRefund({
      merchantOid: "cpx",
      returnAmountTry: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.errMsg).toMatch(/yapılandırılmamış/i);
  });

  it("does not mark success when PayTR returns an error payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "error",
            err_msg: "merchant_oid ile basarili odeme bulunamadi",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await requestPaytrRefund({
      merchantOid: "missing",
      returnAmountTry: 10.5,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.errMsg).toMatch(/bulunamadi/i);
  });

  it("surfaces network failures without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await requestPaytrRefund({
      merchantOid: "cpx",
      returnAmountTry: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errMsg).toMatch(/network down/i);
  });

  it("accepts a partial return_amount with two decimals", async () => {
    let postedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        postedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await requestPaytrRefund({
      merchantOid: "cpx",
      returnAmountTry: 12.5,
      referenceNo: "partial-1",
    });
    expect(result.ok).toBe(true);
    const params = new URLSearchParams(postedBody);
    expect(params.get("return_amount")).toBe("12.50");
  });
});

describe("queryPaytrStatus", () => {
  const MERCHANT_ID = "123456";

  beforeEach(() => {
    process.env.PAYTR_MERCHANT_ID = MERCHANT_ID;
    process.env.PAYTR_MERCHANT_KEY = MERCHANT_KEY;
    process.env.PAYTR_MERCHANT_SALT = MERCHANT_SALT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("T13: durum sorgu tokenı merchant_id + oid + salt ile üretilir", () => {
    const oid = "cpstatus01";
    const expected = Buffer.from(
      crypto
        .createHmac("sha256", MERCHANT_KEY)
        .update(MERCHANT_ID + oid + MERCHANT_SALT)
        .digest(),
    ).toString("base64");
    expect(buildPaytrStatusToken(oid)).toBe(expected);
  });

  it("returns[] içindeki reference_no ve return_amount'u okur", async () => {
    let postedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        postedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            status: "success",
            payment_amount: "150,00",
            payment_total: "150,00",
            currency: "TL",
            returns: [
              {
                return_amount: "75.00",
                return_date: "2026-09-28 12:00:00",
                reference_no: "ref-abc",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await queryPaytrStatus("cpstatus01");
    expect(result.ok).toBe(true);
    expect(result.returns).toHaveLength(1);
    expect(result.returns[0].referenceNo).toBe("ref-abc");
    expect(result.returns[0].returnAmountTry).toBe(75);
    const params = new URLSearchParams(postedBody);
    expect(params.get("paytr_token")).toBe(buildPaytrStatusToken("cpstatus01"));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://www.paytr.com/odeme/durum-sorgu",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("parsePaytrTryToKurus virgüllü ve binlik ayraçlı TL'yi kuruşa çevirir", () => {
    expect(parsePaytrTryToKurus("10,8")).toBe(1080);
    expect(parsePaytrTryToKurus("10.80")).toBe(1080);
    expect(parsePaytrTryToKurus(1.5)).toBe(150);
    expect(parsePaytrTryToKurus("1.234,56")).toBe(123456);
  });

  it("fetch AbortSignal.timeout ile çağrılır", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        return new Response(JSON.stringify({ status: "success", returns: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    await queryPaytrStatus("cptimeout");
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });
});
