import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPasswordResetEmail } from "@/lib/email/mailer";

/**
 * Şifre sıfırlama bağlantısı bizim posta hattımızdan (8 Kasım 2026). Supabase'in kendi gönderimi (saatte 30 e-posta,
 * Gmail SMTP) gelmiyordu; kayıt doğrulaması Paket J1'de zaten bizim hattımıza alınmıştı.
 *
 * Bağlantı `/auth/confirm?token_hash=…&type=recovery` biçiminde: aynı tarayıcıya bağlı değil (telefonda açılır),
 * `verifyOtp` ile oturum açar ve şifre yenileme sayfasına gider.
 */
export function recoveryUrl(origin: string, hashedToken: string): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type: "recovery", next: "/sifre-yenile" });
  return `${origin.replace(/\/$/, "")}/auth/confirm?${params.toString()}`;
}

export type ResetOutcome = "sent" | "no_account" | "send_failed" | "link_failed";

/**
 * Sonuç yalnız günlük içindir: uç her durumda aynı cevabı verir (hangi adresin kayıtlı olduğu dışarıdan anlaşılmasın).
 */
export async function sendPasswordReset(service: SupabaseClient, email: string, origin: string): Promise<ResetOutcome> {
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    const missing = /not.?found|no user|user.*not/i.test(error?.message ?? "");
    return missing ? "no_account" : "link_failed";
  }
  const result = await sendPasswordResetEmail({ to: email, url: recoveryUrl(origin, hashed) });
  return result.ok ? "sent" : "send_failed";
}
