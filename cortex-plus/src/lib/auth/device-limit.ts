/**
 * Hesap paylaşımı koruması (31 Ekim 2026, ürün sahibinin kararı): bir hesap aynı anda en çok 2 cihazda açık
 * kalır (ör. bir bilgisayar + bir telefon). Sayıyı SQL uygular (`touch_device_session`, göç 20261031170000);
 * burası öğrenciye söylenen metnin tek kaynağı. Giriş sayfası (istemci) de okuduğu için sunucu bağımlılığı yok.
 */
export const DEVICE_LIMIT = 2;

/** `/giris?oturum=baska-cihaz`: oturumu cihaz sınırı yüzünden kapanan tarayıcı buraya düşer. */
export const OTHER_DEVICE_PARAM = "baska-cihaz";

/**
 * Neden yazmazsak öğrenci şifresinin çalındığını ya da bir hata olduğunu sanır; sakin ve kısa: ne oldu, kural ne.
 */
export const OTHER_DEVICE_NOTE = `Hesabın başka bir cihazda açıldığı için bu cihazdaki oturum kapandı. Bir hesap aynı anda en çok ${DEVICE_LIMIT} cihazda açık kalır.`;
