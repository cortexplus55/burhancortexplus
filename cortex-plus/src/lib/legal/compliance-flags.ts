/**
 * Yasal metinlerin "bugün gerçekten doğru olan" hâlini tutan anahtarlar. Bir söz ancak karşılığı yapıldıysa
 * yazılır; anahtar açılmadan metin o sözü vermez (bekçi: `uyum-paketi.test.ts`).
 */

/**
 * Yurt dışına aktarım (KVKK m.9, 2024 değişikliği): düzenli aktarım için Kurul'un ilan ettiği standart sözleşme
 * hizmet sağlayıcılarla imzalanır ve imzadan sonra 5 iş günü içinde Kurul'a bildirilir. Bu iş ürün sahibinde.
 *
 * `false` iken aydınlatma metni yalnız gerçeği söyler: hangi sağlayıcı, hangi ülke, hangi amaç ve aktarımın
 * sağlayıcıların veri işleme sözleşmelerine dayandığı. "Kurul'a bildirilmiş standart sözleşme" yazmaz.
 * İmza ve bildirim tamamlanınca `true` yapılır ve `kvkk_aydinlatma` sürümü değiştirilir.
 */
export const CROSS_BORDER_SCC_NOTIFIED = false;
