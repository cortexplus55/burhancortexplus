/**
 * Mağaza satın almasının durumu (26 Kasım 2026, mağaza uyumluluğu). Uygulama içi satın alma Aşama 2'de açılır:
 * RevenueCat bağlantısı ve sunucunun mağaza bildirimini işleyen ucu (`/api/webhooks/revenuecat`) ayrı PR'da gelir,
 * çünkü plan etkinleştirme mantığına dokunur (`docs/delivery/MOBIL-UYGULAMA.md`, "Aşama 2").
 *
 * `STORE_BILLING_LIVE` tek kaynak (web'deki `AUTO_RENEW_SUPPORTED` gibi): `false` durduğu sürece abonelik ekranı satın
 * alma düğmesini kapalı gösterir ve nedenini yazar; uygulamada hiçbir yolla ödeme başlamaz. Mağaza ücret alıp planı
 * açmayan bir durum oluşmasın diye anahtar, sunucu ucu canlıda doğrulanmadan açılmaz. Bekçi:
 * `tests/unit/magaza-uyumluluk.test.tsx`.
 */
export const STORE_BILLING_LIVE = false;

/** Satın alma kapalıyken düğmenin altında yazan cümle. */
export const STORE_BILLING_CLOSED_NOTE =
  "Uygulama içinden satın alma, mağaza bağlantısı tamamlanınca açılır. Hesabında etkin bir plan varsa uygulamada da açıktır.";

/** "Satın Alımları Geri Yükle"nin sonucu: hesabın planı sunucudan yeniden okunur. */
export type RestoreOutcome =
  | { kind: "active"; plan: string }
  | { kind: "none" }
  | { kind: "failed" };

type StatusBody = { plus?: unknown; plan?: unknown; badge?: unknown };

/**
 * Geri yükleme: hesabın planını sunucudan okur (`/api/payments/status`, yalnız okur). Mağaza satın alması açıldığında
 * (Aşama 2) mağazanın geri yükleme çağrısı bundan önce koşar; sunucu mağaza bildirimini aynı hesaba yazdığı için sonuç
 * yine bu okumadan gelir.
 */
export async function restoreAccountPurchases(fetcher: typeof fetch = fetch): Promise<RestoreOutcome> {
  try {
    const response = await fetcher("/api/payments/status", { cache: "no-store" });
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as StatusBody;
    if (body.plus === true) {
      const plan = typeof body.badge === "string" && body.badge ? body.badge : typeof body.plan === "string" ? body.plan : "Plus";
      return { kind: "active", plan };
    }
    return { kind: "none" };
  } catch {
    return { kind: "failed" };
  }
}

export function restoreMessage(outcome: RestoreOutcome): string {
  if (outcome.kind === "active") return `Satın alımların geri yüklendi: hesabında ${outcome.plan} açık.`;
  if (outcome.kind === "none") return "Bu hesapta geri yüklenecek etkin bir abonelik bulunamadı.";
  return "Satın alımlar şu an kontrol edilemedi. Bağlantını kontrol edip yeniden dene.";
}
