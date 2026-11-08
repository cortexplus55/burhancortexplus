import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/mailer";
import { absoluteHref, renderPlanNoticeMail } from "@/lib/email/templates";

export type PlanNoticeMail = {
  userId: string;
  subscriptionId: string;
  kind: "reminder" | "expired";
  title: string;
  body: string;
};

/** Paralel gönderim ve tur bütçesi: günlük işin geri kalanı (silme kuyruğu, özet) beklemesin. */
const CONCURRENCY = 4;
const BUDGET_MS = 60_000;

/**
 * Plan bildirimlerinin e-postası (8 Kasım 2026). Uygulama içi bildirim zaten yazılmış olur; e-posta onun kopyasıdır.
 * Adres hesabın kendi adresi (`auth.users`); okunamazsa ya da gönderim düşerse bildirim yine durur, tur düşmez.
 * Aynı abonelik ve tür için Resend'e tekillik anahtarı gider: cron iki kez koşsa da tek e-posta.
 */
export async function sendPlanNoticeMails(
  service: SupabaseClient,
  notices: readonly PlanNoticeMail[],
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!notices.length) return result;
  const started = now.getTime();
  const queue = [...notices];
  const ctaUrl = absoluteHref("/pay") ?? "https://cortexplus.app/pay";

  async function worker() {
    while (queue.length) {
      if (Date.now() - started > BUDGET_MS) {
        result.skipped += queue.length;
        queue.length = 0;
        return;
      }
      const notice = queue.shift()!;
      try {
        const [{ data: authUser }, { data: profile }] = await Promise.all([
          service.auth.admin.getUserById(notice.userId),
          service.from("profiles").select("full_name").eq("id", notice.userId).maybeSingle(),
        ]);
        const to = authUser?.user?.email;
        if (!to) {
          result.skipped += 1;
          continue;
        }
        const mail = renderPlanNoticeMail({
          firstName: (profile?.full_name as string | null) ?? null,
          title: notice.title,
          body: notice.body,
          ctaLabel: notice.kind === "expired" ? "Plus'a geri dön" : "Plus'ı yenile",
          ctaUrl,
        });
        const sent = await sendEmail({
          to,
          ...mail,
          idempotencyKey: `plan-${notice.kind}-${notice.subscriptionId}`,
        });
        if (sent.ok) result.sent += 1;
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, notices.length) }, () => worker()));
  return result;
}
