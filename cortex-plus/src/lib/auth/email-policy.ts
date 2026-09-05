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
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;

  let local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > -1) local = local.slice(0, plus);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }

  return `${local}@${domain}`;
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
