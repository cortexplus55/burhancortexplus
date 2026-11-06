/**
 * Sadeleştirme isteği (6 Kasım 2026, canlı sınav) — ders bağımsız.
 *
 * Hazırlık sohbetinde öğrenci "çok daha basit anlat, küçük bir çocuğa anlatır gibi" dedi; öğretmen aynı akademik dille
 * ve formüllerle devam etti. Öğretmen tavrı ("kısa paragraflar, gerekirse tablo, anahtar terimler koyu") ve anlatım tarzı
 * satırları bu isteği tanımıyordu. Kod isteği mesajdan modelsiz tanır; tanıyınca sistem istemine tek satır eklenir.
 * Satır cevaba bir şey eklemez, yalnız nasıl yazılacağını söyler.
 */

const fold = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Kalıplar katlanmış metinde aranır. Tek başına "basit" ya da "kolay" bir konu adının parçası olabileceği için
 * aranmaz; anlatım fiiliyle ya da karşılaştırmayla birlikte aranır.
 */
const PATTERNS: RegExp[] = [
  /\banla(?:madim|madik|miyorum|yamadim|yamadik|yamiyorum)\b/,
  /\bhic anla/,
  /\bkafam karis/,
  /\b(?:daha|cok daha|biraz daha) (?:basit|sade|anlasilir|yalin)\b/,
  /\b(?:daha|cok daha|biraz daha) kolay (?:anlat|acikla|soyle)/,
  /\bbasit(?:ce| bir sekilde| bir dille| dille| sozlerle| kelimelerle)\b/,
  /\bbasit(?:lestir|e indirge)/,
  /\bsadelestir/,
  /\b(?:basit|sade|kolay|anlasilir|yalin)(?: bir)? (?:anlat|acikla|soyle|ozetle|ifade et)/,
  /\b(?:cocuga|cocuklara|bir cocuga|kucuk bir cocuga|ilkokul(?:lu)?(?: bir)? (?:ogrenciye|cocuga)|bebege|anneanneme|babaanneme|nineme|dedeme) (?:anlat|acikla)/,
  /\b(?:cocuga|cocuklara) anlatir gibi\b/,
  /\banlatir gibi anlat\b/,
  /\b\d{1,2} yas(?:indaki|inda|indaki bir|inda bir)\b/,
  /\b(?:bes|alti|yedi|sekiz|dokuz|on|on bir|on iki) yas(?:indaki|inda)\b/,
  /\b(?:formul(?:suz| kullanmadan| olmadan)|terim(?:siz| kullanmadan)|teknik (?:terim|dil) kullanmadan)\b/,
  /\beli5\b/,
  /\bexplain like i ?a?m (?:five|5|\d+)\b/,
  /\bin (?:simple|plain) (?:terms|words|english)\b/,
  /\b(?:simpler|simplify)\b/,
];

/** Öğrenci bu mesajda daha basit bir anlatım istiyor mu. */
export function wantsSimpler(message: string): boolean {
  const text = fold(message ?? "");
  if (!text) return false;
  return PATTERNS.some((pattern) => pattern.test(text));
}

export const SIMPLIFY_LINE =
  "SADELEŞTİR (öğrenci daha basit bir anlatım istedi; bu cevapta kesin ve yukarıdaki biçim kurallarından önce gelir): " +
  "Gündelik kelimeler ve kısa cümleler kullan, bir cümlede tek fikir. Önce sezgiyi ver: konunun özünü günlük hayattan " +
  "doğru bir benzetmeyle göster; benzetme kavramın gerçek sınıflandırmasına ve işleyişine birebir uysun, emin olmadığın " +
  "benzetmeyi kullanma. Bir terim gerekiyorsa kullan ve hemen ardından tek cümlelik basit bir açıklama ekle. Formül, " +
  "sembol ve tablo kullanma; gerçekten gerekiyorsa en sonda en çok bir formül, her harfinin ne anlama geldiğiyle. " +
  "Akademik dil, uzun liste ve ayrıntı yok; en çok 6-8 kısa cümle. Öğrenci bir yaş ya da düzey söylediyse o yaştaki " +
  "birinin bildiği kelimeleri seç. Bilgi yine doğru kalır; basitleştirmek yanlış söylemek değildir. Sonda tek, kısa ve " +
  "basit bir soru sor.";

/** İsteğe eklenecek satır; istek yoksa boş. */
export function simplifyLine(message: string): string {
  return wantsSimpler(message) ? SIMPLIFY_LINE : "";
}
