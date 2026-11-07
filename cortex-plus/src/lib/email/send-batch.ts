import "server-only";

/*
  Resend toplu gönderim (7 Kasım 2026): `POST /emails/batch`, en çok 100 e-posta. Yönetimden kampanya gönderiminde
  yüzlerce alıcı tek tek istekle gitseydi Resend'in saniyede 2 istek sınırına (ve işlevin süresine) takılırdı.

  Üç ayrı durum, üçü farklı ele alınır:
  - kota: günlük (ücretsiz plan: 100) ya da aylık gönderim hakkı doldu. Bekleyen alıcılar kuyruğa geri döner,
    gönderim durur; yeniden denemek hiçbir şeyi değiştirmez.
  - hız: saniyede 2 istek aşıldı. `retry-after` kadar beklenip en çok iki kez yeniden denenir.
  - geçersiz adres: `x-batch-validation: permissive` ile paketin geri kalanı yine gider; bozuk adresler satır
    satır hata olarak döner (strict modda tek bozuk adres bütün paketi düşürürdü).

  Aynı pakete ikinci istek (ağ düştü, işlev yeniden denendi) Idempotency-Key ile çift e-posta üretmez.
*/

export type BatchItem = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type BatchOutcome =
  | { ok: true; ids: (string | null)[]; errors: Map<number, string> }
  | { ok: false; reason: "quota" | "not_configured" | "failed"; detail: string };

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const TIMEOUT_MS = 25_000;
const MAX_BATCH = 100;

export function isQuotaError(name: string | undefined, message: string | undefined): boolean {
  return /quota/i.test(`${name ?? ""} ${message ?? ""}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yanıt gövdesinden başarı kimlikleri ve satır hataları; permissive modda hatalı satırlar `data`da yoktur. */
export function mapBatchResponse(
  itemCount: number,
  body: { data?: { id?: string }[]; errors?: { index?: number; message?: string }[] },
): { ids: (string | null)[]; errors: Map<number, string> } {
  const errors = new Map<number, string>();
  for (const error of body.errors ?? []) {
    if (typeof error.index === "number") errors.set(error.index, String(error.message ?? "gecersiz_adres").slice(0, 200));
  }
  const ids: (string | null)[] = [];
  let cursor = 0;
  for (let index = 0; index < itemCount; index += 1) {
    if (errors.has(index)) {
      ids.push(null);
      continue;
    }
    ids.push(body.data?.[cursor]?.id ?? null);
    cursor += 1;
  }
  return { ids, errors };
}

export async function sendResendBatch(items: BatchItem[], options: { idempotencyKey: string }): Promise<BatchOutcome> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return { ok: false, reason: "not_configured", detail: "resend_not_configured" };
  if (!items.length) return { ok: true, ids: [], errors: new Map() };
  if (items.length > MAX_BATCH) return { ok: false, reason: "failed", detail: "batch_too_large" };

  const replyTo = process.env.SMTP_USER?.trim() || "cortexplus@cortexplus.app";
  const payload = JSON.stringify(
    items.map((item) => ({
      from,
      to: [item.to],
      subject: item.subject,
      html: item.html,
      text: item.text,
      reply_to: replyTo,
      ...(item.headers ? { headers: item.headers } : {}),
    })),
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey,
          "x-batch-validation": "permissive",
        },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, reason: "failed", detail: error instanceof Error ? `resend_${error.name}` : "resend_failed" };
    }

    const body = (await response.json().catch(() => ({}))) as {
      name?: string;
      message?: string;
      data?: { id?: string }[];
      errors?: { index?: number; message?: string }[];
    };

    if (response.ok) return { ok: true, ...mapBatchResponse(items.length, body) };

    if (response.status === 429) {
      if (isQuotaError(body.name, body.message)) {
        return { ok: false, reason: "quota", detail: String(body.name ?? "quota").slice(0, 80) };
      }
      // Saniyede istek sınırı: kısa bekleyip yeniden dene.
      const wait = Math.min(5_000, Math.max(600, Number(response.headers.get("retry-after") ?? "1") * 1000 || 1000));
      await sleep(wait);
      continue;
    }

    return { ok: false, reason: "failed", detail: `${body.name ?? `resend_${response.status}`}`.slice(0, 120) };
  }
  return { ok: false, reason: "failed", detail: "rate_limited" };
}

export const RESEND_BATCH_SIZE = MAX_BATCH;
