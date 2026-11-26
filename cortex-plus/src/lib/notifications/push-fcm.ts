import "server-only";
import { sign } from "node:crypto";
import type { DeliveryResult, PushPayload } from "@/lib/notifications/push-apns";

/**
 * Android anlık bildirimi: Firebase Cloud Messaging HTTP v1 (26 Kasım 2026). Kimlik bir Firebase hizmet hesabı;
 * ortam değişkenleri: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (PEM; satır sonları "\n" olarak yazılabilir).
 * Değişkenler yoksa `fcmConfig()` null döner ve Android'e bildirim gönderilmez.
 */

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REQUEST_TIMEOUT_MS = 8_000;
const SEND_CONCURRENCY = 6;

export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const projectId = env.FCM_PROJECT_ID?.trim();
  const clientEmail = env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = env.FCM_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Hizmet hesabının erişim belirteci isteği için imzalı onay (JWT, RS256). Saf. */
export function fcmAssertion(config: Pick<FcmConfig, "clientEmail" | "privateKey">, nowSec: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }),
  );
  const input = `${header}.${claims}`;
  return `${input}.${base64url(sign("sha256", Buffer.from(input), config.privateKey))}`;
}

let cachedAccess: { token: string; clientEmail: string; expiresAt: number } | null = null;

async function accessToken(config: FcmConfig, fetcher: typeof fetch): Promise<string | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.clientEmail === config.clientEmail && cachedAccess.expiresAt - 300 > nowSec) {
    return cachedAccess.token;
  }
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: fcmAssertion(config, nowSec),
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedAccess = { token: data.access_token, clientEmail: config.clientEmail, expiresAt: nowSec + Number(data.expires_in ?? 3600) };
  return data.access_token;
}

/** FCM v1 iletisi: bildirim (başlık, metin) + dokununca açılacak yol (`data.url`). */
export function fcmMessage(token: string, payload: PushPayload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      ...(payload.url ? { data: { url: payload.url } } : {}),
      android: { priority: "HIGH", notification: { default_sound: true } },
    },
  };
}

/** Belirteç artık geçersiz mi (uygulama silindi ya da belirteç yenilendi): satır silinir. */
export function fcmTokenInvalid(status: number, body: unknown): boolean {
  if (status === 404) return true;
  const details = (body as { error?: { status?: string; details?: { errorCode?: string }[] } } | null)?.error;
  if (details?.status === "NOT_FOUND") return true;
  return Boolean(details?.details?.some((item) => item?.errorCode === "UNREGISTERED"));
}

export async function sendFcm(
  config: FcmConfig,
  tokens: readonly string[],
  payload: PushPayload,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { delivered: 0, invalidTokens: [], failed: 0 };
  if (!tokens.length) return result;
  const bearer = await accessToken(config, fetcher).catch(() => null);
  if (!bearer) {
    result.failed = tokens.length;
    return result;
  }
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`;
  const queue = [...tokens];
  const worker = async () => {
    for (let token = queue.shift(); token; token = queue.shift()) {
      try {
        const response = await fetcher(url, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify(fcmMessage(token, payload)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) {
          result.delivered += 1;
          continue;
        }
        const body = await response.json().catch(() => null);
        if (fcmTokenInvalid(response.status, body)) result.invalidTokens.push(token);
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, tokens.length) }, worker));
  return result;
}
