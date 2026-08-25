import crypto from "crypto";

export type PaytrTokenInput = {
  merchantOid: string;
  email: string;
  /** Amount in kuruş (1 TRY = 100). */
  amountKurus: number;
  userIp: string;
  userName: string;
  productName: string;
  okUrl: string;
  failUrl: string;
};

export function buildBasket(productName: string, amountKurus: number) {
  return Buffer.from(
    JSON.stringify([[productName, (amountKurus / 100).toFixed(2), 1]]),
  ).toString("base64");
}

export function paytrConfig() {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID ?? "",
    merchantKey: process.env.PAYTR_MERCHANT_KEY ?? "",
    merchantSalt: process.env.PAYTR_MERCHANT_SALT ?? "",
    testMode: process.env.PAYTR_TEST_MODE ?? "1",
    debugOn: process.env.PAYTR_DEBUG_ON ?? "1",
    noInstallment: process.env.PAYTR_NO_INSTALLMENT ?? "0",
    maxInstallment: process.env.PAYTR_MAX_INSTALLMENT ?? "0",
  };
}

export function isPaytrConfigured() {
  const config = paytrConfig();
  return Boolean(config.merchantId && config.merchantKey && config.merchantSalt);
}

/**
 * PayTR iFrame API token: HMAC-SHA256 over the ordered request fields plus the
 * merchant salt, keyed with the merchant key.
 */
export function buildPaytrToken(input: PaytrTokenInput) {
  const config = paytrConfig();
  const basket = buildBasket(input.productName, input.amountKurus);
  const currency = "TL";

  const hashStr = [
    config.merchantId,
    input.userIp,
    input.merchantOid,
    input.email,
    String(input.amountKurus),
    basket,
    config.noInstallment,
    config.maxInstallment,
    currency,
    config.testMode,
  ].join("");

  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(hashStr + config.merchantSalt)
    .digest("base64");

  const params = new URLSearchParams({
    merchant_id: config.merchantId,
    user_ip: input.userIp,
    merchant_oid: input.merchantOid,
    email: input.email,
    payment_amount: String(input.amountKurus),
    paytr_token: token,
    user_basket: basket,
    debug_on: config.debugOn,
    no_installment: config.noInstallment,
    max_installment: config.maxInstallment,
    user_name: input.userName,
    user_address: "Cortex Plus",
    user_phone: "0000000000",
    merchant_ok_url: input.okUrl,
    merchant_fail_url: input.failUrl,
    timeout_limit: "30",
    currency,
    test_mode: config.testMode,
  });

  return { token, basket, params };
}

export function verifyPaytrCallbackHash(params: {
  merchantOid: string;
  status: string;
  totalAmount: string;
  hash: string;
}): boolean {
  const config = paytrConfig();
  if (!config.merchantKey || !config.merchantSalt) return false;

  const payload =
    params.merchantOid + config.merchantSalt + params.status + params.totalAmount;
  const expected = crypto
    .createHmac("sha256", config.merchantKey)
    .update(payload)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(params.hash);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function generateMerchantOid(): string {
  // Alphanumeric only: PayTR rejects separators in merchant_oid.
  return `cp${crypto.randomBytes(14).toString("hex")}`;
}
