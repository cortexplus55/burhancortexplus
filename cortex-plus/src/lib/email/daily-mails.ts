import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled, MARKETING_EMAIL_FLAG } from "@/lib/admin/feature-flags";
import { sendEmail } from "@/lib/email/mailer";
import { claimOnce, settleOnce } from "@/lib/email/once";
import { renderReferralGiftMail, renderReferralInviteMail } from "@/lib/email/templates";
import { signUnsubscribeToken, unsubscribeHeaders, unsubscribePageUrl } from "@/lib/email/unsubscribe";
import { ensureReferralCode, inviteUrlFor } from "@/lib/credits/invite-code";
import { REFERRAL_GIFT_LESSONS, REFERRAL_MAX_INVITES } from "@/lib/billing/free-meters";
import { runWithBudget } from "@/lib/learning/reminder-facts";
import { appOrigin } from "@/lib/app-url";

/*
  Günlük akşam e-postalarına eklenen iki tek seferlik gönderim (7 Kasım 2026). Yeni zamanlanmış iş yok (Hobby planda
  en çok iki); `study-reminders` işinin sonunda koşar ve kalan süreyi kullanır.

  - Davet e-postası: kampanya izni veren ve kayıttan en az 6 saat geçmiş öğrenciye bir kez. İzin yoksa, `marketing_email`
    anahtarı kapalıysa ya da abonelikten çıkış bağlantısı üretilemiyorsa HİÇ gitmez (davet kartı uygulamada duruyor).
  - Hediye bildirimi: davet edenin davetlisi ilk çalışmasını yapıp hediye yazılınca bir kez. Hesabının bakiyesiyle ilgili
    bilgilendirme olduğu için izin istemez; içinde yeni bir davet çağrısı yoktur.

  "Bir kez" garantisi `email_events`te `once:` anahtarlı satırla: önce satır yazılır (benzersiz indeks, ikinci istek
  çarpışır), sonra gönderilir; gönderim düşerse satır silinir ve ertesi akşam yeniden denenir.
*/

type Row = { user_id: string; email: string; first_name: string | null };


export async function sendReferralInviteMails(
  service: SupabaseClient,
  options: { deadline: number; limit?: number },
): Promise<{ mailed: number; skipped: number; reason?: string }> {
  if (!(await isFeatureEnabled(service, MARKETING_EMAIL_FLAG).catch(() => false))) {
    return { mailed: 0, skipped: 0, reason: "anahtar_kapali" };
  }
  const { data, error } = await service.rpc("email_due_referral_invites", { p_limit: options.limit ?? 150 });
  if (error) return { mailed: 0, skipped: 0, reason: "okunamadi" };
  const rows = (data ?? []) as (Row & { referral_code: string | null })[];

  const result = await runWithBudget(
    rows,
    async (row) => {
      const key = "once:referral_invite";
      const token = signUnsubscribeToken(row.user_id, "marketing");
      if (!token || !(await claimOnce(service, row.user_id, key))) return false;
      const code = await ensureReferralCode(service, row.user_id, row.referral_code);
      const mail = renderReferralInviteMail({
        firstName: row.first_name,
        inviteUrl: inviteUrlFor(code, row.user_id),
        lessons: REFERRAL_GIFT_LESSONS,
        maxInvites: REFERRAL_MAX_INVITES,
        unsubscribeUrl: unsubscribePageUrl(token),
      });
      const sent = await sendEmail({
        to: row.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: unsubscribeHeaders(token),
        idempotencyKey: `referral-invite-${row.user_id}`,
      });
      await settleOnce(service, row.user_id, key, sent.ok);
      return sent.ok;
    },
    { concurrency: 4, deadline: options.deadline },
  );
  return { mailed: result.done, skipped: result.skipped };
}

export async function sendReferralGiftMails(
  service: SupabaseClient,
  options: { deadline: number; limit?: number },
): Promise<{ mailed: number; skipped: number }> {
  const { data, error } = await service.rpc("email_due_referral_gift_mails", { p_limit: options.limit ?? 150 });
  if (error) return { mailed: 0, skipped: 0 };
  const rows = (data ?? []) as (Row & { mail_key: string })[];

  const result = await runWithBudget(
    rows,
    async (row) => {
      if (!(await claimOnce(service, row.user_id, row.mail_key))) return false;
      const mail = renderReferralGiftMail({
        firstName: row.first_name,
        lessons: REFERRAL_GIFT_LESSONS,
        ctaUrl: `${appOrigin()}/deneme-sinavlari`,
      });
      const sent = await sendEmail({
        to: row.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        idempotencyKey: `referral-gift-${row.user_id}-${row.mail_key}`.slice(0, 200),
      });
      await settleOnce(service, row.user_id, row.mail_key, sent.ok);
      return sent.ok;
    },
    { concurrency: 4, deadline: options.deadline },
  );
  return { mailed: result.done, skipped: result.skipped };
}

/** Doğrulanmış hesapların kümesi (200'erli); okunamazsa `null` (çağıran e-posta göndermez). */
export async function verifiedUserIds(service: SupabaseClient, userIds: string[]): Promise<Set<string> | null> {
  const verified = new Set<string>();
  for (let from = 0; from < userIds.length; from += 200) {
    const { data, error } = await service.rpc("email_verified_ids", { p_ids: userIds.slice(from, from + 200) });
    if (error) return null;
    for (const row of (data ?? []) as { user_id: string }[]) verified.add(row.user_id);
  }
  return verified;
}
