import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/mailer";
import { missingRelation } from "@/lib/learning/missing-column";
import {
  shouldSendAlert,
  type AlertCandidate,
} from "@/lib/founder-cockpit/alerts";
import { renderFounderAlertMail } from "@/lib/founder-cockpit/alert-email";

/**
 * Kurucu alarmlarının gönderimi ve kaydı (Faz 13). Her aday için aynı anahtarın son gönderimine bakılır
 * (`shouldSendAlert`), gönderilir ve `founder_alert_logs`'a yazılır. Kayıt tablosu yoksa (göç öncesi) yalnız deneme
 * e-postası gider: kilit tutulamayan bir alarm 15 dakikada bir tekrar ederdi. Hiçbir zaman atmaz.
 */

export const ALERT_LOG_TABLE = "founder_alert_logs";

export type DispatchSummary = {
  sent: number;
  skipped: number;
  failed: number;
  logMissing: boolean;
};

export async function dispatchFounderAlerts(
  service: SupabaseClient,
  candidates: readonly AlertCandidate[],
  alertEmail: string,
  now: Date = new Date(),
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    sent: 0,
    skipped: 0,
    failed: 0,
    logMissing: false,
  };
  if (!candidates.length) return summary;

  const keys = [
    ...new Set(
      candidates.filter((item) => item.kind !== "test").map((item) => item.key),
    ),
  ];
  const lastSent = new Map<string, string>();
  if (keys.length) {
    const { data, error } = await service
      .from(ALERT_LOG_TABLE)
      .select("alert_key, created_at")
      .in("alert_key", keys)
      .not("sent_to", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      summary.logMissing = missingRelation(error);
      if (!summary.logMissing)
        console.error("founder_alert_log_read_failed", {
          error: error.message,
        });
      // Kilit okunamıyor: yalnız deneme e-postası gider.
      const tests = candidates.filter((item) => item.kind === "test");
      summary.skipped += candidates.length - tests.length;
      for (const item of tests)
        await sendOne(service, item, alertEmail, now, summary, false);
      return summary;
    }
    for (const row of (data ?? []) as {
      alert_key: string;
      created_at: string;
    }[]) {
      if (!lastSent.has(row.alert_key))
        lastSent.set(row.alert_key, row.created_at);
    }
  }

  for (const item of candidates) {
    if (!shouldSendAlert(item, lastSent.get(item.key) ?? null, now)) {
      summary.skipped += 1;
      continue;
    }
    await sendOne(service, item, alertEmail, now, summary, true);
    lastSent.set(item.key, now.toISOString());
  }
  return summary;
}

async function sendOne(
  service: SupabaseClient,
  item: AlertCandidate,
  alertEmail: string,
  now: Date,
  summary: DispatchSummary,
  log: boolean,
): Promise<void> {
  const mail = renderFounderAlertMail(item, appOrigin(), {
    test: item.kind === "test",
  });
  let ok = false;
  try {
    const result = await sendEmail({
      to: alertEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      idempotencyKey:
        `founder-${item.key}-${Math.floor(now.getTime() / 60_000)}`.slice(
          0,
          250,
        ),
    });
    ok = result.ok;
  } catch {
    ok = false;
  }
  if (ok) summary.sent += 1;
  else summary.failed += 1;
  if (!log) return;
  const { error } = await service.from(ALERT_LOG_TABLE).insert({
    alert_key: item.key.slice(0, 200),
    severity: item.severity,
    title: item.title.slice(0, 200),
    message: `${item.summary}\n${item.impact}`.slice(0, 2000),
    action_hint: item.action.slice(0, 1000),
    sent_to: ok ? alertEmail : null,
  });
  if (error && !missingRelation(error))
    console.error("founder_alert_log_write_failed", { error: error.message });
}

/** Deneme e-postası: kayıt tablosu varsa geçmişe de yazılır. */
export async function sendTestAlert(
  service: SupabaseClient,
  candidate: AlertCandidate,
  alertEmail: string,
): Promise<boolean> {
  const summary: DispatchSummary = {
    sent: 0,
    skipped: 0,
    failed: 0,
    logMissing: false,
  };
  await sendOne(service, candidate, alertEmail, new Date(), summary, true);
  return summary.sent === 1;
}

/** Sağlıklı kartların açık alarmlarını "çözüldü" işaretler. */
export async function resolveAlerts(
  service: SupabaseClient,
  keys: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  if (!keys.length) return;
  const { error } = await service
    .from(ALERT_LOG_TABLE)
    .update({ resolved_at: now.toISOString() })
    .in("alert_key", [...keys])
    .is("resolved_at", null);
  if (error && !missingRelation(error))
    console.error("founder_alert_resolve_failed", { error: error.message });
}

export type AlertLogRow = {
  id: string;
  alertKey: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  actionHint: string | null;
  sentTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export async function loadRecentAlerts(
  service: SupabaseClient,
  limit = 20,
): Promise<AlertLogRow[] | null> {
  const { data, error } = await service
    .from(ALERT_LOG_TABLE)
    .select(
      "id, alert_key, severity, title, message, action_hint, sent_to, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    alertKey: String(row.alert_key ?? ""),
    severity:
      row.severity === "critical"
        ? "critical"
        : row.severity === "warning"
          ? "warning"
          : "info",
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    actionHint: typeof row.action_hint === "string" ? row.action_hint : null,
    sentTo: typeof row.sent_to === "string" ? row.sent_to : null,
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    createdAt: String(row.created_at ?? ""),
  }));
}
