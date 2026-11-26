import "server-only";
import { sign } from "node:crypto";
import http2 from "node:http2";

/**
 * iOS anlık bildirimi: Apple Push Notification service (APNs), sağlayıcı anahtarıyla (.p8, ES256) HTTP/2 üzerinden
 * (26 Kasım 2026). Anahtar Apple Developer hesabında üretilir; ortam değişkenleri:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (PEM; satır sonları "\n" olarak yazılabilir),
 *   APNS_BUNDLE_ID (varsayılan app.cortexplus.mobile), APNS_USE_SANDBOX=1 (Xcode'dan kurulan geliştirme derlemesi).
 * Değişkenler yoksa `apnsConfig()` null döner ve iOS'a bildirim gönderilmez.
 */

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  host: string;
};

export type PushPayload = { title: string; body: string; url: string | null };
export type DeliveryResult = { delivered: number; invalidTokens: string[]; failed: number };

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const REQUEST_TIMEOUT_MS = 8_000;
/** Apple belirteci en çok bir saat geçerli sayar; 50 dakikada bir yenilenir. */
const TOKEN_TTL_SEC = 50 * 60;

export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!keyId || !teamId || !privateKey) return null;
  return {
    keyId,
    teamId,
    privateKey,
    bundleId: env.APNS_BUNDLE_ID?.trim() || "app.cortexplus.mobile",
    host: env.APNS_USE_SANDBOX?.trim() === "1" ? SANDBOX_HOST : PRODUCTION_HOST,
  };
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let cachedToken: { value: string; keyId: string; issuedAt: number } | null = null;

/** Sağlayıcı belirteci (JWT, ES256). Saf: zaman ve anahtar dışarıdan. */
export function apnsProviderToken(config: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, nowSec: number): string {
  if (cachedToken && cachedToken.keyId === config.keyId && nowSec - cachedToken.issuedAt < TOKEN_TTL_SEC) {
    return cachedToken.value;
  }
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: nowSec }));
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), { key: config.privateKey, dsaEncoding: "ieee-p1363" });
  const value = `${input}.${base64url(signature)}`;
  cachedToken = { value, keyId: config.keyId, issuedAt: nowSec };
  return value;
}

/** APNs gövdesi: başlık, metin, ses; dokununca açılacak uygulama içi yol `url` alanında. */
export function apnsBody(payload: PushPayload): string {
  return JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    ...(payload.url ? { url: payload.url } : {}),
  });
}

/** Belirteç artık geçersiz mi (uygulama silindi, belirteç yenilendi): satır silinir. */
export function apnsTokenInvalid(status: number, reason: string | null): boolean {
  if (status === 410) return true;
  return status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic");
}

export async function sendApns(config: ApnsConfig, tokens: readonly string[], payload: PushPayload): Promise<DeliveryResult> {
  const result: DeliveryResult = { delivered: 0, invalidTokens: [], failed: 0 };
  if (!tokens.length) return result;
  const jwt = apnsProviderToken(config, Math.floor(Date.now() / 1000));
  const body = apnsBody(payload);
  const session = http2.connect(config.host);
  session.on("error", () => undefined);
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            let status = 0;
            let text = "";
            let done = false;
            const finish = (fn: () => void) => {
              if (done) return;
              done = true;
              fn();
              resolve();
            };
            const request = session.request({
              ":method": "POST",
              ":path": `/3/device/${encodeURIComponent(token)}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": config.bundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            });
            request.setTimeout(REQUEST_TIMEOUT_MS, () => {
              request.close();
              finish(() => (result.failed += 1));
            });
            request.on("response", (headers) => {
              status = Number(headers[":status"] ?? 0);
            });
            request.setEncoding("utf8");
            request.on("data", (chunk: string) => {
              text += chunk;
            });
            request.on("end", () =>
              finish(() => {
                if (status === 200) {
                  result.delivered += 1;
                  return;
                }
                let reason: string | null = null;
                try {
                  reason = (JSON.parse(text) as { reason?: string }).reason ?? null;
                } catch {
                  reason = null;
                }
                if (apnsTokenInvalid(status, reason)) result.invalidTokens.push(token);
                else result.failed += 1;
              }),
            );
            request.on("error", () => finish(() => (result.failed += 1)));
            request.end(body);
          }),
      ),
    );
  } finally {
    session.close();
  }
  return result;
}
