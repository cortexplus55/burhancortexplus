/**
 * Üretim başarısız olduğunda öğrenciye ne diyeceğiz.
 *
 * Tek bir cümle vardı: "Ders şu anda oluşturulamadı. Yeniden
 * deneyebilirsin." Hiçbir şey söylemiyordu — kaynak mı okunamadı, kalite
 * kontrolü mü düştü, kredi mi bitti, hepsi aynı ekrandı. Sebep bizde
 * kayıtlı; öğrenci ne yapacağını bilmeli.
 *
 * `retryMintsNewId`, düğmenin gerçekten yeniden deneyip denemeyeceğini
 * söylüyor. Bu bir görünüm ayrıntısı değil, canlıda yaşanan bir çıkmazın
 * kaynağıydı: istemci istek kimliğini yalnızca tek bir hata kodunda
 * yeniliyordu, o yüzden gerçek bir hatadan sonra ilk iki tıklama hiçbir
 * şey yapmıyor, üçüncüsü deniyordu. Öğrenci için bu "düğme bozuk" demek.
 *
 * Üretim HÂLÂ SÜRÜYORSA kimlik yenilenmez: yenilemek ikinci bir üretim
 * başlatır ve öğrenci iki kez ödeyebilir.
 */

export type GenerationFailure = {
  message: string;
  /** Yeniden deneme yeni bir istek kimliğiyle mi yapılmalı? */
  retryMintsNewId: boolean;
  /** Yeniden deneme şu an anlamlı mı? */
  canRetryNow: boolean;
};

export function describeGenerationFailure(code: unknown): GenerationFailure {
  switch (code) {
    case "generation_in_progress":
      return {
        message:
          "Dersin hâlâ hazırlanıyor. Biraz bekleyip yeniden dene; ikinci bir üretim başlatılmayacak.",
        retryMintsNewId: false,
        canRetryNow: false,
      };

    case "source_unavailable":
      return {
        message:
          "Bu konunun kaynak sayfaları okunamadı. Belgen hâlâ işleniyor olabilir; birkaç dakika sonra yeniden dene.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    case "content_verification_failed":
      return {
        message:
          "Hazırlanan ders kalite kontrolünden geçemedi; yanlış bilgi göstermemek için yayınlamadık. Yeniden denemek genelde işe yarıyor.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    case "premium_required":
      return {
        message: "Bu içerik Plus üyeliğe özel.",
        retryMintsNewId: false,
        canRetryNow: false,
      };

    case "topic_map_unavailable":
      return {
        message:
          "Belgenin konu haritası çıkarılamadı. Belge sayfasından haritayı yeniden oluşturup tekrar dene.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    default:
      return {
        message: "Ders şu anda oluşturulamadı. Yeniden deneyebilirsin.",
        retryMintsNewId: true,
        canRetryNow: true,
      };
  }
}
