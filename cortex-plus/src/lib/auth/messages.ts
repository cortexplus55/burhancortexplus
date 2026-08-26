import type { AuthError } from "@supabase/supabase-js";

/** Kullanıcıya gösterilecek kayıt/giriş hata metni */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error?.message) {
    return "İşlem tamamlanamadı. Bilgilerini kontrol edip tekrar dene.";
  }

  const msg = error.message.toLowerCase();

  if (msg.includes("already registered") || msg.includes("already been registered")) {
    return "Bu e-posta zaten kayıtlı. Giriş yap veya şifreni sıfırla.";
  }
  if (msg.includes("invalid email")) {
    return "E-posta adresi geçersiz görünüyor.";
  }
  if (msg.includes("password") && msg.includes("weak")) {
    return "Şifre Supabase güvenlik kurallarını karşılamıyor. Daha güçlü bir şifre dene.";
  }
  if (msg.includes("database error") || msg.includes("unexpected_failure")) {
    return "Hesap sunucuda tamamlanamadı (veritabanı). Destek ekibine yaz veya bir süre sonra tekrar dene.";
  }
  if (msg.includes("invalid api key") || msg.includes("jwt")) {
    return "Uygulama yapılandırması hatalı. Site yöneticisi Supabase anahtarlarını kontrol etmeli.";
  }
    return "Yeni kayıt şu an kapalı. Destek ile iletişime geç.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Çok fazla deneme. Birkaç dakika sonra tekrar dene.";
  }
  if (msg.includes("email not confirmed")) {
    return "E-postanı doğrulaman gerekiyor. Gelen kutunu ve spam klasörünü kontrol et.";
  }

  return error.message;
}

export function authCallbackUrl(nextPath: string): string {
  if (typeof window === "undefined") {
    return `/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}
