import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readResendStatus } from "@/lib/email/resend-status";
import type {
  EmailProbe,
  PaymentStats,
  SentryProbe,
} from "@/lib/founder-cockpit/health";

/*
  Kurucu Kokpiti yoklamaları (Faz 13, 26 Kasım 2026). Hepsi salt okur, kısa zaman aşımlı, hiçbiri fırlatmaz.
  - Veritabanı: tek küçük sorgunun gidiş-dönüş süresi.
  - Resend: son gönderimler listesi (`GET /emails`, en çok 100), son 24 saatin sonuçları sayılır; e-posta adresi ya da
    içerik okunmaz, yalnız `created_at` ve `last_event`. Anahtar yalnız gönderim yetkiliyse alan adı durumuna düşülür.
  - PayTR: son 24 saatin ödeme durumları ve son başarılı ödeme anı (kendi kayıtlarımızdan).
  - Sentry: son 24 saatte görülen çözülmemiş hata sayısı (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`).
*/

const TIMEOUT_MS = 6_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function probeDatabase(
  service: SupabaseClient,
): Promise<{ latencyMs: number | null; error: string | null }> {
  const started = performance.now();
  try {
    const { error } = await service.from("plans").select("id").limit(1);
    const latencyMs = performance.now() - started;
    return error
      ? { latencyMs: null, error: error.message }
      : { latencyMs, error: null };
  } catch (error) {
    return {
      latencyMs: null,
      error: error instanceof Error ? error.message : "bağlantı kurulamadı",
    };
  }
}

/** Resend tarih biçimi ("2026-11-26 05:01:18.123+00") → ms. */
export function parseResendDate(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const normalized = value
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  return Date.parse(normalized);
}

export const RESEND_FAILED_EVENTS = new Set([
  "bounced",
  "failed",
  "suppressed",
]);

/** Liste yanıtından son 24 saatin toplamı ve başarısızı. Saf. */
export function countResendEvents(
  rows: readonly { created_at?: unknown; last_event?: unknown }[],
  now: Date,
): { total: number; failed: number } {
  let total = 0;
  let failed = 0;
  for (const row of rows) {
    const at = parseResendDate(row.created_at);
    if (!Number.isFinite(at) || now.getTime() - at > DAY_MS) continue;
    total += 1;
    if (
      typeof row.last_event === "string" &&
      RESEND_FAILED_EVENTS.has(row.last_event)
    )
      failed += 1;
  }
  return { total, failed };
}

export async function probeEmail(now: Date = new Date()): Promise<EmailProbe> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { state: "not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails?limit=100", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as {
        data?: { created_at?: unknown; last_event?: unknown }[];
      } | null;
      return {
        state: "events",
        ...countResendEvents(Array.isArray(body?.data) ? body.data : [], now),
      };
    }
  } catch {
    /* liste okunamadı: alan adı durumuna düş */
  }
  const status = await readResendStatus().catch(() => null);
  if (!status) return { state: "unreachable", detail: "Resend yanıt vermedi." };
  switch (status.state) {
    case "ready":
    case "domains_unreadable":
      return { state: "domain_ready" };
    case "not_configured":
      return { state: "not_configured" };
    case "unreachable":
      return { state: "unreachable", detail: status.detail };
    case "key_rejected":
      return { state: "config_problem", detail: "Anahtar reddedildi." };
    case "domain_missing":
      return {
        state: "config_problem",
        detail: `${status.fromDomain} alan adı Resend'de ekli değil.`,
      };
    case "domain_not_verified":
      return {
        state: "config_problem",
        detail: `${status.fromDomain} alan adı doğrulanmamış (${status.status}).`,
      };
  }
}

export async function probePayments(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<PaymentStats | null> {
  try {
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    const [recent, lastPaid] = await Promise.all([
      service
        .from("payments")
        .select("status")
        .gte("created_at", since)
        .limit(2000),
      service
        .from("payments")
        .select("created_at")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (recent.error || lastPaid.error) return null;
    const rows = (recent.data ?? []) as { status?: string }[];
    return {
      paid24h: rows.filter(
        (row) => row.status === "paid" || row.status === "refunded",
      ).length,
      failed24h: rows.filter((row) => row.status === "failed").length,
      pending24h: rows.filter((row) => row.status === "pending").length,
      lastPaidAt:
        ((lastPaid.data ?? [])[0] as { created_at?: string } | undefined)
          ?.created_at ?? null,
    };
  } catch {
    return null;
  }
}

/** DSN'in ana makinesinden Sentry API adresi ("o1.ingest.de.sentry.io" → "https://de.sentry.io"). Saf. */
export function sentryApiBase(dsn: string | undefined | null): string {
  const host = (() => {
    try {
      return new URL(dsn ?? "").hostname;
    } catch {
      return "";
    }
  })();
  const region = /\.ingest\.([a-z]{2})\.sentry\.io$/.exec(host)?.[1];
  return region ? `https://${region}.sentry.io` : "https://sentry.io";
}

export async function probeSentry(
  env: Record<string, string | undefined> = process.env,
): Promise<SentryProbe> {
  const token = env.SENTRY_AUTH_TOKEN?.trim();
  const org = env.SENTRY_ORG?.trim();
  const project = env.SENTRY_PROJECT?.trim();
  if (!token || !org || !project) return { state: "not_connected" };
  const base = sentryApiBase(env.NEXT_PUBLIC_SENTRY_DSN ?? env.SENTRY_DSN);
  const url = `${base}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved&statsPeriod=24h&limit=100`;
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok)
      return {
        state: "unreachable",
        detail: `Sentry ${response.status} döndü.`,
      };
    const body = (await response.json().catch(() => null)) as unknown[] | null;
    const count = Array.isArray(body) ? body.length : 0;
    return { state: "issues", count, capped: count >= 100 };
  } catch {
    return { state: "unreachable", detail: "Sentry yanıt vermedi." };
  }
}
