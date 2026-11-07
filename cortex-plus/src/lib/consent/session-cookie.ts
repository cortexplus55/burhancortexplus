/**
 * Tarayıcıda oturum çerezi var mı ve hangi oturum (7 Kasım 2026, uyum paketi). Supabase oturum çerezi
 * (`sb-<proje>-auth-token`, parçalıysa `.0`, `.1`) tarayıcıdan okunabilir (`httpOnly: false`, @supabase/ssr
 * varsayılanı). Onay kapısı ve çerez bandı giriş yapmamış ziyaretçi için hiç istek atmasın diye buna bakar.
 */

const AUTH_COOKIE = /^sb-[^=]+-auth-token(\.\d+)?$/;

function authCookieParts(cookieHeader: string): string[] {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => AUTH_COOKIE.test(part.split("=")[0] ?? ""));
}

export function hasSessionCookie(cookieHeader: string = typeof document === "undefined" ? "" : document.cookie): boolean {
  return authCookieParts(cookieHeader).length > 0;
}

/**
 * Oturumun parmak izi: çerezin değeri değişince (başka hesapla giriş, oturum yenilenmesi) değişir. Gizli bir şey
 * değildir, yalnız önbelleğin hangi oturuma ait olduğunu söyler; değer saklanmaz, yalnız 32 bitlik özeti.
 */
export function sessionFingerprint(cookieHeader: string = typeof document === "undefined" ? "" : document.cookie): string {
  const joined = authCookieParts(cookieHeader).sort().join(";");
  let hash = 5381;
  for (let index = 0; index < joined.length; index += 1) {
    hash = ((hash << 5) + hash + joined.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}
