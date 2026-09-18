import "server-only";
import { dailyKey, rateLimit } from "@/lib/rate-limit";

/**
 * Ücretsiz hesabın günlük fotoğraf sayısı.
 *
 * Fotoğraftan soru çözme (`IMAGE_SOLUTION`) sistemdeki en pahalı eylem:
 * gören tek model gelişmiş olan, yani her fotoğraf gpt-4o'ya gidiyor. Krediyle
 * de en pahalısı — 5 kredi.
 *
 * Normalde bunu kredinin kendisi frenliyor: ücretsiz hesabın günlük hakkı 6
 * kredi, yani günde bir fotoğraf. Fren, davet çarpanında kayboluyor.
 * `referral_tiers` davet edileni 3, abone olan bir daveti getireni 400
 * katsayıyla ödüllendiriyor; ikincisinde günlük hak 2.400 krediye çıkıyor ve
 * bu, ödeme yapmamış bir hesapta GÜNDE 480 gpt-4o fotoğrafı demek.
 *
 * 3 seçildi çünkü kimsenin elinden bir şey almıyor: davetle gelen bir
 * öğrencinin çarpanı zaten 3 ve 18 kredisi tam 3 fotoğraf ediyor. Kapanan
 * tek şey 400'lük çarpanın açtığı delik. Ödül duruyor — diğer her işte
 * kullanılabiliyor, yalnızca en pahalı eylemde tavanı var.
 */
export const FREE_IMAGE_DAILY_LIMIT = 3;

/**
 * Ücretsiz hesap bugün bir fotoğraf daha çözebilir mi.
 *
 * Premium hesapta sayaca hiç dokunulmuyor: abonelik zaten kendi kotasını
 * ödüyor ve gereksiz bir Redis turu, ölçtüğü şeyden pahalıya mal olurdu.
 *
 * Sayaç `rate-limit` üzerinden, yani Redis yoksa bellek yedeğine düşüyor ve
 * orada örnek başına sayıyor. Bu bilinçli: sayaç açıkta kaldığında isteği
 * reddetmek, ödeme yapan tarafı da vuran bir arıza olurdu — burada durdurmak
 * istediğimiz şey nadir bir suistimal, kritik bir güvenlik kapısı değil.
 */
export async function freeImageAllowed(
  userId: string,
  isPremium: boolean,
): Promise<boolean> {
  if (isPremium) return true;
  const result = await rateLimit(
    dailyKey(userId, "image-free"),
    FREE_IMAGE_DAILY_LIMIT,
    86400,
  );
  return result.allowed;
}
