/**
 * Kanonik e-posta (Faz 2 madde 4): aynı posta kutusuna düşen bütün yazımlar tek bir anahtara iner.
 *
 *   - baştaki/sondaki boşluk atılır, hepsi küçük harfe çevrilir;
 *   - yerel kısımdaki `+` ve sonrası atılır (`ad+herhangi@alan` → `ad@alan`);
 *   - gmail.com ve googlemail.com'da yerel kısımdaki noktalar atılır ve alan `gmail.com` olur
 *     (Gmail noktaları yok sayar; googlemail.com aynı kutunun eski alanıdır).
 *
 * Aynı kural veritabanında `public.normalize_email(text)` olarak da var (kayıt tetikleyicisi ve
 * `email_alias_taken` onu kullanır); ikisi birebir aynı sonucu verir (birim testi iki uygulamayı karşılaştırır).
 * Bağımlılıksız: hem tarayıcıda (kayıt sihirbazının erken uyarısı) hem sunucuda çalışır.
 */
export function normalizeCanonicalEmail(raw: string | null | undefined): string {
  const email = String(raw ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus > -1) local = local.slice(0, plus);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}

/** Kayıtta aynı kutunun başka bir hesabı varsa öğrencinin gördüğü cümle (Faz 2 madde 4, birebir). */
export const CANONICAL_EMAIL_TAKEN_MESSAGE = "Bu e-posta adresiyle ilişkili bir hesabın zaten bulunuyor, lütfen giriş yap.";
