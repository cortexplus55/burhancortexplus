import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email/mailer";
import { formatTry } from "@/lib/format";
import { FAILURE_REASON_LABEL, SOFT_FAILURE_REASONS } from "@/lib/admin/failure-labels";
import { listStuckGenerations } from "@/lib/learning/stuck-generations";

/*
  Günlük özet e-postası (18 Ekim 2026, plan 4.8).

  Kurucu panele bakmadan günün ne getirdiğini sabah posta kutusunda görsün: yeni kayıt,
  ödeme, üretim hatası, takılı üretim. Vercel Hobby iki cron'a izin verdiği için ayrı bir
  cron yok; özet 06:00 UTC'deki (09:00 TRT) `subscription-renewal` turunun sonunda gider.

  Aynı gün iki kez gitmesin diye gönderim `audit_logs`'a yazılır (`ops.daily_digest`,
  entity_id = TRT günü); cron yeniden tetiklense bile ikinci posta çıkmaz. Yönetici
  panelindeki "Özeti şimdi gönder" `force` ile bu kilidi aşar.

  Alıcı tek operasyon adresi; `ADMIN_DIGEST_EMAIL` ile değişir, `off` yazılırsa gönderilmez.
  Posta ne öğrenci adı ne e-posta taşır — yalnız sayılar.
*/

export const DIGEST_WINDOW_MS = 24 * 60 * 60_000;
export const DIGEST_AUDIT_ACTION = "ops.daily_digest";
export const DEFAULT_DIGEST_RECIPIENT = "cortexplus@cortexplus.app";
const TIME_ZONE = "Europe/Istanbul";

export type DailyDigest = {
  /** Pencere başı ve sonu (ISO). */
  from: string;
  to: string;
  signups: number;
  payments: { paid: number; paidKurus: number; failed: number; pending: number; refunded: number };
  failures: {
    /** Öğrenciye içerik ulaşmayan kayıtlar. */
    total: number;
    /** Ders çıktı ama yavaş ya da yeniden yazıldı. */
    slow: number;
    byReason: { reason: string; label: string; count: number }[];
  };
  /** 10 dakikadan uzun süredir `creating` duran üretim işleri (şu an). */
  stuck: number;
};

/** TRT gününün anahtarı: `2026-10-18`. */
export function digestDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function digestRecipient(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.ADMIN_DIGEST_EMAIL?.trim();
  if (!raw) return DEFAULT_DIGEST_RECIPIENT;
  if (/^(off|kapali|kapalı|0|false)$/i.test(raw)) return null;
  return raw;
}

function dayLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function timeLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function collectDailyDigest(
  service: SupabaseClient,
  options: { now?: Date; windowMs?: number } = {},
): Promise<DailyDigest> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - (options.windowMs ?? DIGEST_WINDOW_MS)).toISOString();

  const [signups, payments, failures, stuck] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    service.from("payments").select("amount_try, status").gte("created_at", since).limit(2000),
    service.from("lesson_generation_failures").select("reason").gte("created_at", since).limit(5000),
    listStuckGenerations(service, { now: now.getTime(), limit: 50 }),
  ]);

  const pay = { paid: 0, paidKurus: 0, failed: 0, pending: 0, refunded: 0 };
  for (const row of (payments.data ?? []) as { amount_try: number | null; status: string | null }[]) {
    if (row.status === "paid") {
      pay.paid += 1;
      pay.paidKurus += row.amount_try ?? 0;
    } else if (row.status === "failed") pay.failed += 1;
    else if (row.status === "refunded") pay.refunded += 1;
    else pay.pending += 1;
  }

  const counts = new Map<string, number>();
  let slow = 0;
  for (const row of (failures.data ?? []) as { reason: string | null }[]) {
    const reason = row.reason ?? "unknown";
    if (SOFT_FAILURE_REASONS.has(reason)) {
      slow += 1;
      continue;
    }
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const byReason = [...counts.entries()]
    .map(([reason, count]) => ({ reason, label: FAILURE_REASON_LABEL[reason] ?? reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    from: since,
    to: now.toISOString(),
    signups: signups.count ?? 0,
    payments: pay,
    failures: { total: byReason.reduce((sum, item) => sum + item.count, 0), slow, byReason },
    stuck: stuck.rows.length,
  };
}

export function digestNeedsAttention(digest: DailyDigest): boolean {
  return digest.failures.total > 0 || digest.stuck > 0 || digest.payments.failed > 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
}

export function renderDailyDigest(
  digest: DailyDigest,
  appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://cortexplus.app",
): { subject: string; text: string; html: string } {
  const attention = digestNeedsAttention(digest);
  const day = dayLabel(digest.to);
  const window = `${timeLabel(digest.from)} – ${timeLabel(digest.to)} (TRT)`;

  const lines: { label: string; value: string }[] = [
    { label: "Yeni kayıt", value: String(digest.signups) },
    {
      label: "Ödeme",
      value:
        `${digest.payments.paid} ödendi · ${formatTry(digest.payments.paidKurus)}` +
        (digest.payments.failed ? ` · ${digest.payments.failed} başarısız` : "") +
        (digest.payments.pending ? ` · ${digest.payments.pending} bekliyor` : "") +
        (digest.payments.refunded ? ` · ${digest.payments.refunded} iade` : ""),
    },
    {
      label: "Üretim hatası",
      value:
        `${digest.failures.total} başarısız` +
        (digest.failures.slow ? ` · ${digest.failures.slow} yavaş/yeniden yazım` : ""),
    },
    { label: "Takılı üretim (şu an)", value: String(digest.stuck) },
  ];

  const reasonLines = digest.failures.byReason.map((item) => `${item.label}: ${item.count}`);

  const subject =
    `${attention ? "Dikkat · " : ""}Cortex Plus günlük özet · ${day} · ` +
    `${digest.signups} kayıt · ${digest.payments.paid} ödeme · ${digest.failures.total} hata`;

  const text = [
    `Cortex Plus günlük özet — ${day}`,
    `Pencere: ${window}`,
    "",
    ...lines.map((line) => `${line.label}: ${line.value}`),
    ...(reasonLines.length ? ["", "Hata sebepleri:", ...reasonLines.map((line) => `- ${line}`)] : []),
    "",
    attention
      ? `Bakılacak yer: ${appUrl}/admin/ders-hatalari (takılı üretim kartı üstte).`
      : "Dikkat isteyen bir şey yok.",
    `Panel: ${appUrl}/admin`,
  ].join("\n");

  const rows = lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#8a8a8a;white-space:nowrap;">${escapeHtml(line.label)}</td>` +
        `<td style="padding:6px 0;font-weight:600;">${escapeHtml(line.value)}</td></tr>`,
    )
    .join("");
  const reasons = reasonLines.length
    ? `<p style="margin:16px 0 4px;color:#8a8a8a;">Hata sebepleri</p><ul style="margin:0;padding-left:18px;">${reasonLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`
    : "";

  const html = `<!doctype html>
<html lang="tr">
  <body style="margin:0;background:#0c0c0c;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fafafa;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:18px;font-weight:600;margin:0 0 24px;">Cortex Plus</p>
      <div style="background:#161616;border:1px solid #2a2a2a;border-radius:20px;padding:24px;">
        <h1 style="font-size:20px;margin:0 0 4px;">${attention ? "Dikkat · " : ""}Günlük özet · ${escapeHtml(day)}</h1>
        <p style="margin:0 0 16px;font-size:12px;color:#8a8a8a;">${escapeHtml(window)}</p>
        <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
        ${reasons}
        <p style="margin:20px 0 0;font-size:14px;color:#c9c9c9;">${
          attention
            ? `Bakılacak yer: <a href="${appUrl}/admin/ders-hatalari" style="color:#8fa3ff;">Ders hataları</a> (takılı üretim kartı üstte).`
            : "Dikkat isteyen bir şey yok."
        }</p>
        <a href="${appUrl}/admin" style="display:inline-block;margin-top:20px;background:#4a6cf7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;">Paneli aç</a>
      </div>
      <p style="font-size:12px;color:#8a8a8a;margin-top:24px;">Bu özet her sabah 09:00'da günlük iş turuyla gönderilir. Kapatmak için Vercel'de ADMIN_DIGEST_EMAIL=off.</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

export type DigestSendResult =
  | { ok: true; to: string; digest: DailyDigest }
  | { ok: false; reason: "disabled" | "already_sent" | "send_failed"; detail?: string };

export async function sendDailyDigest(
  service: SupabaseClient,
  options: {
    now?: Date;
    /** Günlük kilidi aşar (panelden elle gönderim). */
    force?: boolean;
    to?: string | null;
    send?: typeof sendEmail;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<DigestSendResult> {
  const now = options.now ?? new Date();
  const to = options.to === undefined ? digestRecipient(options.env) : options.to;
  if (!to) return { ok: false, reason: "disabled" };

  const dayKey = digestDayKey(now);
  if (!options.force) {
    const { data: sentBefore } = await service
      .from("audit_logs")
      .select("id")
      .eq("action", DIGEST_AUDIT_ACTION)
      .eq("entity_id", dayKey)
      .limit(1)
      .maybeSingle();
    if (sentBefore) return { ok: false, reason: "already_sent" };
  }

  const digest = await collectDailyDigest(service, { now });
  const mail = renderDailyDigest(digest);
  const result = await (options.send ?? sendEmail)({ to, ...mail });
  if (!result.ok) return { ok: false, reason: "send_failed", detail: result.reason };

  await auditLog(service, {
    action: DIGEST_AUDIT_ACTION,
    entityType: "day",
    entityId: dayKey,
    metadata: {
      forced: Boolean(options.force),
      signups: digest.signups,
      paid: digest.payments.paid,
      failedPayments: digest.payments.failed,
      failures: digest.failures.total,
      slow: digest.failures.slow,
      stuck: digest.stuck,
    },
  });

  return { ok: true, to, digest };
}
