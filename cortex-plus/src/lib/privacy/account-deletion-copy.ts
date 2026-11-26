import { STORE_DELETION_WARNING } from "@/lib/billing/store-products";

/**
 * Hesap silmenin bütün cümleleri tek yerde (26 Kasım 2026, mağaza uyumluluğu): Ayarlar'daki düğme ve onay penceresi,
 * herkese açık `/hesap-silme` sayfası ve onay e-postası aynı metni okur. Kapsam `account-deletion.ts`'teki silme
 * işçisinin yaptığıdır (`purgeUserData`); biri değişirse öbürü de değişmeli.
 */

/** Silme işçisinin sildiği veriler, öğrencinin anlayacağı adlarla. */
export const DELETED_DATA = [
  "Profilin (ad, sınıf, okul, hedef sınav ve öğrenme tercihleri)",
  "Yüklediğin belgeler, ders notları ve fotoğraflar (dosyalarıyla birlikte)",
  "Sınav hazırlıkların, dersler, testler, kartlar, podcast ve video kayıtların",
  "Öğretmenle sohbetlerin ve sesli öğretmen konuşmalarının yazılı dökümü",
  "Yanlışlar Defterin, tekrar kartların, yıldızların ve ilerleme kayıtların",
  "Bildirim tercihlerin, telefonundaki bildirim cihaz anahtarı ve oturum kayıtların",
  "Giriş bilgilerin (e-posta adresin hesaptan çıkar; ödeme kaydı yoksa giriş kaydı tamamen silinir)",
] as const;

/** Mevzuat gereği saklanan kayıtlar ve süreleri. */
export const RETAINED_DATA = [
  "Ödeme yapılmış hesapta ödeme ve fatura kayıtları (plan, tutar, tarih, sipariş numarası) vergi ve ticaret mevzuatının öngördüğü süre (10 yıla kadar) saklanır; giriş kapanır, ad ve e-posta adresi hesaptan silinir, hesap «Silinmiş hesap» olarak kalır.",
  "Aynı hesapta metin ve ödeme onayının kanıt kaydı (zaman ve IP adresi) bir uyuşmazlıkta kanıt olarak ödeme kaydıyla birlikte kalır. Ödeme yapılmamış hesapta bu kayıtlar da silinir.",
] as const;

export const ACCOUNT_DELETION_COPY = {
  groupTitle: "Hesabı sil",
  groupDescription:
    "Hesabın ve kişisel verilerin kalıcı olarak silinir; bu bir dondurma ya da devre dışı bırakma değildir. Silme hemen başlar, yarım kalan adımlar her gün kendiliğinden yeniden denenir.",
  button: "Hesabımı kalıcı olarak sil",
  dialogTitle: "Hesabın kalıcı olarak silinsin mi?",
  dialogText: `Belgelerin, sınav hazırlıkların, sohbetlerin ve bütün çalışma kayıtların silinir, oturumun kapanır. Bu işlem geri alınamaz. ${STORE_DELETION_WARNING}`,
  confirm: "Kalıcı olarak sil",
  done: "Hesabın silindi.",
  queued: "Silme başladı; kalan adımlar arka planda tamamlanacak.",
  failed: "Silme başlatılamadı. Bağlantını kontrol edip yeniden dene.",
  storeWarning: STORE_DELETION_WARNING,
} as const;

/** Herkese açık silme sayfasının adresi (Google Play: uygulamayı yeniden yüklemeden silme yolu). */
export const PUBLIC_DELETION_PATH = "/hesap-silme";

/** E-postayla gelen onay bağlantısının geçerlilik süresi. */
export const DELETION_LINK_TTL_HOURS = 24;
