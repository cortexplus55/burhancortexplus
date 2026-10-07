/**
 * E-posta ya da Google dönüşünde bir şey ters gidince öğrencinin hangi
 * açıklamayı göreceği. Üç ayrı durum var ve üçü eskiden birbirine
 * karışıyordu:
 *
 * 1. Süresi dolmuş / kullanılmış e-posta bağlantısı. Supabase bunu
 *    `error=access_denied&error_code=otp_expired` ile geri gönderiyor.
 *    Geri dönüş rotası her `error`'u "Google ile giriş tamamlanmadı"
 *    sayıyordu; e-postadaki bağlantıya tıklayan öğrenci Google hatası
 *    görüyordu.
 * 2. Google (sağlayıcı) hatası ya da iptal.
 * 3. Bağlantı başka bir tarayıcıda açıldı. Oturum PKCE ile açılıyor:
 *    kodu takas edecek anahtar kaydın yapıldığı tarayıcının çerezinde.
 *    Bilgisayarda kayıt olup e-postayı telefonda açan öğrencide anahtar
 *    yok (`pkce_code_verifier_not_found`). Ama Supabase kodu ancak
 *    e-postayı doğruladıktan SONRA veriyor — yani adres doğrulandı,
 *    yalnızca bu tarayıcıda oturum açılamadı. "Bağlantının süresi
 *    dolmuş" demek yanlıştı.
 */

const EMAIL_LINK_CODES = /^(otp_|flow_state_|email_)/;

export function providerFailurePath(params: URLSearchParams): string | null {
  const error = params.get("error");
  if (!error) return null;
  const code = params.get("error_code") ?? "";
  const description = params.get("error_description") ?? "";
  if (EMAIL_LINK_CODES.test(code) || /email link|otp/i.test(description)) {
    return "/auth/auth-code-error";
  }
  return "/auth/auth-code-error?neden=saglayici";
}

export function exchangeFailurePath(
  error: { code?: string | null; name?: string | null } | null,
  next: string,
): string {
  if (error?.code === "pkce_code_verifier_not_found" || error?.name === "AuthPKCECodeVerifierMissingError") {
    return `/auth/auth-code-error?neden=baska-tarayici&next=${encodeURIComponent(next)}`;
  }
  return "/auth/auth-code-error";
}
