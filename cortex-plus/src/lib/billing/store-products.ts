import type { NativePlatform } from "@/lib/platform/native-ua";

/**
 * Mobil uygulamada satılan abonelikler (26 Kasım 2026, mağaza uyumluluğu). Uygulama içinde yalnız App Store ve Google
 * Play'in otomatik yenilenen aboneliği satılır (ürün sahibinin kararı, `docs/delivery/MOBIL-UYGULAMA.md`). Plan satırı
 * (`plans.slug`) web'deki planın kendisidir; mağaza ürün kimliği bu tabloda tek yerde. Mağaza panelinde (App Store
 * Connect ve Google Play Console) ürünler bu kimliklerle açılır, fiyat aynı plan satırının fiyatıyla girilir.
 *
 * Saf: sunucu sayfası ve tarayıcı bileşeni aynı listeyi okur.
 */

export type StorePeriod = "weekly" | "monthly";

export type StoreProduct = {
  /** `plans.slug`: fiyat ve hak bu satırdan okunur. */
  slug: string;
  /** App Store ve Google Play ürün kimliği. */
  productId: string;
  /** Ekranda planın adı. */
  label: string;
  period: StorePeriod;
  /** Bir dönemin gün sayısı (ekranda "7 gün" gibi). */
  periodDays: number;
};

export const STORE_PRODUCTS: readonly StoreProduct[] = [
  { slug: "plus-haftalik", productId: "sinav_haftasi", label: "Sınav Haftası", period: "weekly", periodDays: 7 },
  { slug: "plus-aylik", productId: "plus_monthly", label: "Plus", period: "monthly", periodDays: 30 },
  { slug: "sigma-aylik", productId: "sigma_monthly", label: "Sigma", period: "monthly", periodDays: 30 },
] as const;

/** Mağaza planı satırı: ürün kimliği + veritabanındaki fiyat (kuruş). Fiyatı okunamayan ürün listeye girmez. */
export type StorePlanOffer = StoreProduct & { priceKurus: number; description: string | null };

type PlanRow = { slug?: unknown; price_try?: unknown; description?: unknown; active?: unknown };

export function storeOffersFromPlans(rows: readonly PlanRow[] | null | undefined): StorePlanOffer[] {
  const bySlug = new Map((rows ?? []).filter((row) => row.active !== false).map((row) => [String(row.slug ?? ""), row]));
  return STORE_PRODUCTS.flatMap((product) => {
    const row = bySlug.get(product.slug);
    const price = typeof row?.price_try === "number" ? row.price_try : Number.NaN;
    if (!Number.isFinite(price) || price <= 0) return [];
    const description = typeof row?.description === "string" && row.description.trim() ? row.description.trim() : null;
    return [{ ...product, priceKurus: Math.round(price), description }];
  });
}

/** "haftalık" / "aylık" */
export function storePeriodWord(period: StorePeriod): string {
  return period === "weekly" ? "haftalık" : "aylık";
}

/** Fiyatın birimi: "/ hafta" ya da "/ ay". */
export function storePeriodUnit(period: StorePeriod): string {
  return period === "weekly" ? "hafta" : "ay";
}

/** Mağazanın adı, cümle içinde. */
export function storeName(platform: NativePlatform): string {
  return platform === "ios" ? "App Store" : "Google Play";
}

/** Mağaza hesabının adı (ödemenin alındığı yer). */
export function storeAccountName(platform: NativePlatform): string {
  return platform === "ios" ? "Apple Kimliğin" : "Google Play hesabın";
}

export const ANDROID_PACKAGE = "app.cortexplus.mobile";

/** Mağazanın abonelik yönetimi sayfası: uygulama dışındaki bağlantı telefonun tarayıcısında ya da mağazada açılır. */
export function storeManageUrl(platform: NativePlatform): string {
  return platform === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`;
}

/**
 * Abonelik ekranının zorunlu açıklamaları (App Store 3.1.2, Google Play abonelik politikası). Metin tek yerde: ekran,
 * hesap silme uyarısı ve bekçi test aynı cümleleri okur.
 */
export function storeRenewalTerms(platform: NativePlatform): string[] {
  const store = storeName(platform);
  return [
    `Ödeme, satın almayı onayladığında ${storeAccountName(platform)} üzerinden alınır.`,
    "Abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse aynı süre ve aynı fiyatla otomatik olarak yenilenir; yenileme ücreti dönemin bitişinden önceki 24 saat içinde alınır.",
    `Otomatik yenilemeyi ${store} abonelik ayarlarından istediğin an kapatabilirsin; iptal, içinde bulunduğun dönemin sonunda geçerli olur ve o güne kadar planın açık kalır.`,
    `Hesabını silmek ${store} aboneliğini kendiliğinden iptal etmez; aboneliği ${store} ayarlarından ayrıca iptal etmelisin.`,
  ];
}

/** Hesap silme ekranlarındaki mağaza uyarısı (platform bilinmiyorsa iki mağaza birlikte). */
export const STORE_DELETION_WARNING =
  "App Store ya da Google Play üzerinden aldığın abonelik, hesabını silince kendiliğinden iptal olmaz. Silmeden önce aboneliğini mağazanın abonelik ayarlarından iptal et; yoksa mağaza ücret almaya devam eder.";
