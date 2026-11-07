/**
 * Kampanya e-postası izninin metni ve sürümü (7 Kasım 2026). İzin ayrı ve isteğe bağlıdır: kayıtta işaretli gelmez,
 * hizmetin kullanımı buna bağlı değildir, istenildiği an tek tıkla geri alınır. Metin değişince sürüm değişir;
 * `email_preferences.marketing_text_version` öğrencinin hangi metne izin verdiğini saklar.
 *
 * Kapsam bilerek geniş değil: yalnız Cortex Plus'ın kendi duyuru, yeni özellik ve davet kampanyası e-postaları.
 * Üçüncü taraf reklamı yok, adres kimseyle paylaşılmaz.
 */
export const MARKETING_CONSENT_VERSION = "2026-11-08";

export const MARKETING_CONSENT_TEXT =
  "Cortex Plus'tan duyuru, yeni özellik ve davet kampanyası e-postaları almak istiyorum. İstediğim zaman tek tıkla çıkabilirim.";

export const MARKETING_CONSENT_HINT =
  "İsteğe bağlı. Hesabını ve çalışma hatırlatmalarını etkilemez; onayını Ayarlar'dan ya da her e-postadaki bağlantıdan geri alabilirsin.";
