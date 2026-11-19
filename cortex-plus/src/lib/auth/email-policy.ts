import { normalizeCanonicalEmail } from "@/lib/auth/canonical-email";

/**
 * Kayıt e-postası kuralları.
 *
 * Sunucu değil, istemci tarafı da kullanabilsin diye bağımlılıksız. Asıl
 * kalkan veritabanında (`account_verified`): buradaki kontrol atlatılabilir,
 * ama atlatan kişi de ücretsiz hak kazanamaz. Bunun işi kuralı erken ve
 * anlaşılır bir cümleyle söylemek — kayıt olduktan sonra "hakkın neden 2?"
 * diye sormak zorunda kalmasın.
 */

/**
 * Aynı kutuya düşen farklı yazımlar.
 *
 * Gmail noktaları yok sayar ve `+`'dan sonrasını atar: `ali.veli+1@gmail.com`
 * ile `aliveli@gmail.com` aynı kutudur. Bunu bilmeden "her e-posta bir hesap"
 * demek, tek kutuyla sınırsız hesap açılmasına izin vermek olur.
 */
export function normalizeEmail(raw: string): string {
  // Faz 2 (madde 4): tek kural, tek yer — `canonical-email.ts`.
  return normalizeCanonicalEmail(raw);
}

export function emailDomain(raw: string): string {
  return raw.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Yedek liste. Asıl kaynak `blocked_email_domains` tablosu — oraya
 * ulaşılamadığında en yaygın olanlar yine de elenebilsin diye buradakiler
 * kodda duruyor.
 */
export const FALLBACK_BLOCKED_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "dispostable.com",
  "fakeinbox.com",
  "getnada.com",
  "maildrop.cc",
  "mohmal.com",
  "mailnesia.com",
  "minuteinbox.com",
]);

export const DISPOSABLE_EMAIL_MESSAGE =
  "Geçici e-posta adresleriyle kayıt olunamıyor. Kalıcı bir adres kullanırsan " +
  "şifreni unuttuğunda hesabını geri alabilirsin.";

/** Alan adı engelli mi. `blocked` verilmezse koddaki yedek liste kullanılır. */
export function isDisposableEmail(
  raw: string,
  blocked?: Set<string> | string[],
): boolean {
  const domain = emailDomain(raw);
  if (!domain) return false;
  const list =
    blocked instanceof Set
      ? blocked
      : blocked
        ? new Set(blocked)
        : FALLBACK_BLOCKED_DOMAINS;
  return list.has(domain);
}

/** Aynı posta kutusunun başka yazımıyla açılmış hesap var (`email_alias_taken`, göç 20261031162000). */
export const ALIAS_EMAIL_MESSAGE =
  "Bu e-posta kutusuyla (noktalı ya da + eklenmiş başka bir yazımla) zaten bir hesap açılmış. " +
  "Giriş yap ya da şifreni sıfırla.";
