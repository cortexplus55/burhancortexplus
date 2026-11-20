import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/mailer";
import { signUnsubscribeToken, unsubscribeHeaders, unsubscribePageUrl } from "@/lib/email/unsubscribe";
import { appOrigin } from "@/lib/app-url";
import { claimDispatch, settleDispatch, type EmailCategory } from "@/lib/notifications/dispatch-guard";
import { ensureUnsubscribeToken } from "@/lib/notifications/preferences";
import { oneClickHeaders, preferencesPageUrl, type UnsubscribeCategory } from "@/lib/notifications/unsubscribe-links";

/**
 * Korumalı e-posta gönderimi (Faz 6, 20 Kasım 2026): bütün yaşam döngüsü ve işlem e-postaları buradan.
 *
 *  1. Yaşam döngüsü e-postası abonelikten çıkma bağlantısı olmadan GİTMEZ: önce tercih satırının anahtarı
 *     (`/bildirim-tercihleri?token=…` + RFC 8058 tek tık), tablo yoksa eski imzalı bağlantı (`/eposta/abonelik`).
 *  2. Gönderim kilidi (`dispatch-guard`): gece sessizliği, 24 saat kuralı, `dedupe_key` tekilliği.
 *  3. Alıcı adresi yalnız sunucuda okunur; Resend'e aynı `dedupe_key` tekillik anahtarı olarak gider (çift çalışan cron
 *     aynı e-postayı iki kez göndermesin).
 *  4. Gönderim düşerse kilit geri alınır; sonraki tur yeniden dener.
 */

export type RenderedMail = { subject: string; html: string; text: string };

export type GuardedMail = {
  userId: string;
  templateKey: string;
  dedupeKey: string;
  category: EmailCategory;
  /** Yaşam döngüsü e-postasının abonelikten çıkma kategorisi; işlem e-postasında null. */
  unsubscribe: UnsubscribeCategory | null;
  /** Şablon: tercih sayfasının adresi (yaşam döngüsünde dolu) ile çizilir. */
  render: (context: { origin: string; preferencesUrl: string | null; firstName: string | null }) => RenderedMail;
  /** Adres biliniyorsa (çağıran zaten okuduysa) yeniden okunmaz. */
  to?: string | null;
  now?: Date;
};

export type SendOutcome =
  | "sent"
  | "quiet_hours"
  | "cooldown"
  | "duplicate"
  | "no_unsubscribe"
  | "no_address"
  | "failed";

async function unsubscribeFor(
  service: SupabaseClient,
  userId: string,
  category: UnsubscribeCategory,
  origin: string,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  const token = await ensureUnsubscribeToken(service, userId);
  if (token) return { url: preferencesPageUrl(token, origin), headers: oneClickHeaders(token, category, origin) };
  // Göç öncesi: eski imzalı bağlantı (yalnız iki kategori bilir).
  const legacy = signUnsubscribeToken(userId, category === "marketing" ? "marketing" : "reminder");
  if (!legacy) return null;
  return { url: unsubscribePageUrl(legacy), headers: unsubscribeHeaders(legacy) };
}

/** Alıcı adresi ve adı (yalnız sunucuda). Ad kayıttaki tam adın ilk kelimesi; yoksa null. */
async function recipientOf(service: SupabaseClient, userId: string): Promise<{ email: string | null; firstName: string | null }> {
  const { data } = await service.auth.admin.getUserById(userId);
  const email = data?.user?.email?.trim() || null;
  const full = String(data?.user?.user_metadata?.full_name ?? "").trim();
  return { email, firstName: full.split(/\s+/)[0] || null };
}

export async function sendGuardedMail(service: SupabaseClient, mail: GuardedMail): Promise<SendOutcome> {
  const origin = appOrigin();
  const unsubscribe = mail.unsubscribe ? await unsubscribeFor(service, mail.userId, mail.unsubscribe, origin) : null;
  if (mail.unsubscribe && !unsubscribe) return "no_unsubscribe";

  const claim = await claimDispatch(service, {
    userId: mail.userId,
    templateKey: mail.templateKey,
    dedupeKey: mail.dedupeKey,
    category: mail.category,
    now: mail.now,
  });
  if (!claim.ok) return claim.reason === "error" ? "failed" : claim.reason;

  let sent = false;
  try {
    const recipient = await recipientOf(service, mail.userId);
    const to = mail.to ?? recipient.email;
    // Kilit `finally`de geri alınır (sent = false).
    if (!to) return "no_address";
    const rendered = mail.render({ origin, preferencesUrl: unsubscribe?.url ?? null, firstName: recipient.firstName });
    const result = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(unsubscribe ? { headers: unsubscribe.headers } : {}),
      idempotencyKey: mail.dedupeKey.slice(0, 200),
    });
    sent = result.ok;
    if (!result.ok) console.warn("guarded_mail_failed", { templateKey: mail.templateKey, reason: result.reason });
    return sent ? "sent" : "failed";
  } catch (error) {
    console.error("guarded_mail_failed", { templateKey: mail.templateKey, error: String(error) });
    return "failed";
  } finally {
    await settleDispatch(service, mail, claim, sent);
  }
}
