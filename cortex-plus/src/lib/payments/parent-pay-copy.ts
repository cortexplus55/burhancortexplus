/**
 * Velinin ödeme sayfasının metinleri (Faz 5 §2, 19 Kasım 2026). Her cümle koddan doğrulanmış bir gerçeğe dayanır:
 * - PayTR iFrame'i: kart bilgisi PayTR'de girilir, bize gelmez (`createPaytrCheckout`, iFrame adresi paytr.com).
 * - Otomatik yenileme yok: kart saklanmaz, yenileme yalnız hatırlatmadır (`cron/subscription-renewal`, PayTR
 *   isteğinde kart saklama parametresi yok).
 * - Hak öğrencinin hesabına: ödeme satırı öğrencinin adına açılır (`userId` = öğrenci).
 */
export const PARENT_PAY_COPY = {
  brandLine: "Güvenli veli ödemesi",
  assurance: "Otomatik yenileme yapılmaz, kartınız saklanmaz",
  assuranceDetail: [
    "Tek seferlik ödeme; dönem bitince kendiliğinden çekim olmaz.",
    "Kart bilgileri PayTR'nin güvenli sayfasında girilir, Cortex Plus'a gelmez.",
    "Paket öğrencinin hesabına tanımlanır; sizin hesap açmanız ya da şifre girmeniz gerekmez.",
  ],
  badges: ["PayTR güvenli ödeme", "Banka ve kredi kartı", "Kart bilgisi bize gelmez"],
  vatNote: "KDV dahil",
  emailLabel: "E-posta adresiniz (makbuz ve sözleşme örneği için)",
  payCta: "Güvenli ödemeye geç",
  paidTitle: "Ödemeniz onaylandı",
  invalid: "Bu ödeme bağlantısı geçerli değil, öğrencinizden yeni link isteyebilirsiniz",
} as const;

/** Onay ekranının cümlesi: paket öğrencinin hesabında. */
export function parentPaidLine(studentFirst: string, planName: string): string {
  return `${planName} paketi ${studentFirst} adlı öğrencinin hesabına tanımlandı. Makbuz e-postanıza gelir.`;
}
