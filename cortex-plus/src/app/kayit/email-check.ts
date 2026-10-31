"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ALIAS_EMAIL_MESSAGE } from "@/lib/auth/email-policy";

/** Bir IP'nin dakikada yapabileceği kayıt öncesi e-posta kontrolü (okul ağında bir sınıf aynı anda kayıt olur). */
const CHECK_LIMIT_PER_MINUTE = 40;

export type SignupEmailCheck = { ok: true } | { ok: false; error: string };

/**
 * Kayıttan önce: bu posta kutusunun başka bir yazımıyla (Gmail noktası, "+etiket") açılmış hesap var mı
 * (31 Ekim 2026, lansman zırhı). Tek kutuyla sınırsız ücretsiz hesap ve davet hediyesi toplanıyordu.
 *
 * Kayıt kapısı değil, erken ve anlaşılır uyarı: kontrol düşerse (göç yok, ağ, sınır) kayıt sürer. Asıl kalkan
 * veritabanında: aynı kutunun sonraki hesapları davet hediyesi alamaz (`grant_referral_gift`).
 */
export async function checkSignupEmail(email: string): Promise<SignupEmailCheck> {
  const address = String(email ?? "").trim().slice(0, 320);
  if (!address.includes("@")) return { ok: true };
  try {
    const forwarded = (await headers()).get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "local";
    const limit = await rateLimit(`cortex:signup-email-check:${ip}`, CHECK_LIMIT_PER_MINUTE, 60);
    if (!limit.allowed) return { ok: true };
    const { data, error } = await createServiceClient().rpc("email_alias_taken", { p_email: address });
    if (error) return { ok: true };
    return data === true ? { ok: false, error: ALIAS_EMAIL_MESSAGE } : { ok: true };
  } catch {
    return { ok: true };
  }
}
