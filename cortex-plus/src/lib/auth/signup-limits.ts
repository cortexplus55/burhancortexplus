/** Kayıt ucunun sınırları ve cümleleri (Faz 2 madde 4 ve 6); rota dosyası yalnız HTTP işleyicilerini dışa verir. */

/**
 * Faz 2 (madde 4): aynı IP'den saatte en çok 5 ücretsiz hesap. Kampüs dostu: yalnız BAŞARIYLA açılan hesap sayılır
 * (yazım hatası, zayıf şifre, kayıtlı adres denemesi kotayı yemez) ve sayaç bir saat sonra kendiliğinden sıfırlanır.
 * Redis düşerse sınırlayıcı bellek sayacına iner (fail-open; kayıt kapanmaz).
 */
export const FREE_SIGNUP_PER_IP_HOUR = 5;
export const FREE_SIGNUP_WINDOW_SECONDS = 3600;
export const FREE_SIGNUP_LIMIT_MESSAGE =
  "Bu ağdan son bir saatte çok sayıda hesap açıldı. Bir süre sonra yeniden dene ya da var olan hesabınla giriş yap.";
export const SIGNUP_CONSENT_MESSAGE =
  "Devam etmek için KVKK Aydınlatma Metni'ni ve Kullanım Koşulları'nı onaylaman ve yaş beyanını vermen gerekiyor.";
