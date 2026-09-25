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
  /**
   * Yeniden denemek işe yaramıyorsa öğrencinin gidebileceği yer.
   *
   * "Hakkın bitti" deyip ekranda yalnızca çalışmayan bir düğme bırakmak,
   * öğrenciyi düğmeye basmaya devam ettiriyor. Çıkışı da göstermek gerek.
   */
  action?: { href: string; label: string };
};

/**
 * API `{ error: türkçe, code: makine }` döner. İstemci uzun süre `error`
 * alanını koda sandı; "source_unavailable" hiç eşleşmedi ve öğrenci her
 * sebepten aynı cümleyi gördü.
 */
export function generationFailureCode(body: { code?: unknown; error?: unknown }): unknown {
  if (typeof body.code === "string" && body.code.trim()) return body.code;
  return body.error;
}

export function describeGenerationFailure(
  code: unknown,
  /** Hakkın ne zaman yenileneceği — "12 Eylül 2026 03:00". */
  resetsAtLabel?: string,
  kind?: string,
): GenerationFailure {
  const podcast = kind === "podcast";
  switch (code) {
    case "generation_in_progress":
      return {
        message: podcast
          ? "Podcast hâlâ hazırlanıyor. Biraz bekleyip yeniden dene; ikinci bir üretim başlatılmayacak."
          : "Dersin hâlâ hazırlanıyor. Biraz bekleyip yeniden dene; ikinci bir üretim başlatılmayacak.",
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
        message: podcast
          ? "Podcast kalite kontrolünden geçemedi; yanlış bilgi yayınlamamak için durduk. Yeniden denemek genelde işe yarıyor."
          : "Hazırlanan ders kalite kontrolünden geçemedi; yanlış bilgi göstermemek için yayınlamadık. Yeniden denemek genelde işe yarıyor.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    case "invalid_ai_response":
    case "podcast_script_rejected":
      return {
        message: podcast
          ? "Podcast metni doğrulanamadı; tutmayan sayı veya biçim yüzünden yayınlamadık. Yeniden deneyebilirsin."
          : "Hazırlanan metin beklenen biçime uymadı. Yeniden deneyebilirsin.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    case "generation_failed":
      return {
        message: podcast
          ? "Podcast üretimi sunucuda tamamlanamadı. Yeniden deneyebilirsin."
          : "Ders şu anda oluşturulamadı. Yeniden deneyebilirsin.",
        retryMintsNewId: true,
        canRetryNow: true,
      };

    case "premium_required":
      return {
        message: "Bu içerik Plus üyeliğe özel. Yeniden denemek açmaz.",
        retryMintsNewId: false,
        canRetryNow: false,
        action: { href: "/paketler", label: "Paketlere bak" },
      };

    /**
     * HAK BİTTİĞİNDE "YENİDEN DENE" DEMEK YANLIŞ.
     *
     * Bu kodun burada karşılığı yoktu; hakkı biten öğrenci genel mesajı
     * ("Ders şu anda oluşturulamadı. Yeniden deneyebilirsin.") görüyordu.
     * Yeniden denemek hiçbir zaman işe yaramıyor — hak ertesi gün 03:00'te
     * geliyor. Öğrenci düğmeye basıp duruyordu.
     *
     * Yenilenme zamanı biliniyorsa yazılıyor: beklemek de bir çözüm ve
     * bunu saklamak öğrenciyi yalnızca ödemeye itmek olur.
     */
    case "insufficient_credits":
      return {
        message: resetsAtLabel
          ? `Hakkın doldu. ${resetsAtLabel} itibarıyla yenilenecek; dilersen paketini yükseltip beklemeden devam edebilirsin.`
          : "Hakkın doldu. Hakkın yenilenince devam edebilirsin; dilersen paketini yükseltip beklemeden çalışabilirsin.",
        retryMintsNewId: false,
        canRetryNow: false,
        action: { href: "/krediler", label: "Hakkımı gör" },
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
        message: podcast
          ? "Podcast şu anda oluşturulamadı. Yeniden deneyebilirsin."
          : "Ders şu anda oluşturulamadı. Yeniden deneyebilirsin.",
        retryMintsNewId: true,
        canRetryNow: true,
      };
  }
}
