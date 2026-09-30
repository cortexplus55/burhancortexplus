/**
 * Yanlış şık gerekçesi yalnızca şıkkı tekrar edip reddediyor mu?
 *
 * 30 Eylül 2026 canlı quiz (birim çember): "Bu şık yanlıştır, çünkü 90°
 * açısının noktaları (√2/2, √2/2) olamaz." Cümle şıkkı, kökteki açıyı ve
 * "olamaz"ı taşıyor; neden olamayacağını söylemiyor. Aynı quizde altı yanlış
 * şık gerekçesinin beşi bu kalıptaydı. Öğrenci yanlışını seçip altında
 * "bu yanlış" okuyor — ev stili her çeldiricinin gerçekte ne olduğunu
 * söylemeyi istiyor (docs/delivery/ICERIK-EV-STILI.md).
 *
 * Kural dar tutuldu: gerekçeden şıkkın kendi sözcükleri, kökteki sayılar,
 * hüküm sözcükleri ("bu şık yanlıştır", "çünkü"), genel adlar ("nokta",
 * "koordinat", "açı") ve olumsuz yüklem ("olamaz", "değildir", "karşılık
 * gelmez") çıkarılınca GERİYE HİÇBİR ŞEY kalmıyorsa tekrardır. "Yatay",
 * "birim çember üzerinde", "tuzak: oran", başka bir sayı ya da bir eşitlik
 * kalıyorsa gerekçe bir şey söylüyordur; hüküm yok. Kökün sözcükleri
 * çıkarılmaz: "Daire çapı bir açı ölçüsü değildir" bir sınıflandırmadır,
 * tekrar değil.
 */

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");
}

/** "45°'ye", "(0, 1)'dir" → ek atılır; kalan sözcük ve sayılar. */
function tokens(text: string): string[] {
  return fold(text)
    .replace(/['’]\p{L}+/gu, " ")
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

const FILLER = new Set([
  // hüküm ve bağlaç
  "bu", "su", "o", "bunlar", "bunun", "buradaki", "burada", "cunku", "zira", "nedenle", "yuzden",
  "ise", "de", "da", "ki", "ve", "ile", "veya", "ya", "icin", "olarak", "kesin", "kesinlikle",
  "asla", "hic", "tam", "arasinda", "arasi", "olan", "soru", "sorunun", "soruda",
  "dogru", "dogrudur", "yanlis", "yanlistir", "yanlisdir", "hatali", "hatalidir", "gecersiz", "gecersizdir",
  // olumsuz yüklem
  "degil", "degildir", "olamaz", "olmaz", "gelmez", "gelmiyor", "karsilik", "gecerli", "uymaz",
  "uymuyor", "uygun", "esit", "bulunmaz", "yoktur", "ait", "temsil", "etmez", "gostermez",
  "vermez", "saglamaz", "belirtmez", "yer", "almaz",
]);

const NEGATION = new Set([
  "degil", "degildir", "olamaz", "olmaz", "gelmez", "gelmiyor", "uymaz", "uymuyor", "bulunmaz",
  "yoktur", "etmez", "gostermez", "vermez", "saglamaz", "belirtmez", "almaz", "yanlis", "yanlistir",
  "yanlisdir", "hatali", "hatalidir", "gecersiz", "gecersizdir",
]);

// Şıkkın ne olduğunu söylemeyen genel adlar; ek alabilirler ("noktaları",
// "açısının", "açılar"). "acil" ve "açık" (acik) açı değildir.
const GENERIC = [
  /^nokta/,
  /^koordinat/,
  /^aci(?:$|s|n|y|d|lar|ler)/,
  /^deger/,
  /^sonuc/,
  /^ifade/,
  /^sayi(?!sal)/,
  /^sik(?:ki|kin|lar|lari)?$/,
  /^secenek/,
  /^cevap/,
  /^yanit/,
];

function isGeneric(token: string): boolean {
  return GENERIC.some((pattern) => pattern.test(token));
}

/**
 * true: gerekçe şıkkı, kökün sayısını ve bir olumsuzlamayı tekrarlamaktan
 * öteye geçmiyor. Doğru şıkkın satırına uygulanmaz; çağıran yanlış şıklara
 * sorar.
 */
export function optionReasonRestates(reason: string, option: string, stem: string): boolean {
  if (/[=≠<>×÷+²³√π]/.test(reason.replace(option, " "))) return false;
  const words = tokens(reason);
  if (!words.some((word) => NEGATION.has(word))) return false;
  const own = new Set(tokens(option));
  const stemNumbers = new Set(tokens(stem).filter((token) => /^\d+$/.test(token)));
  const rest = words.filter(
    (word) => !own.has(word) && !stemNumbers.has(word) && !FILLER.has(word) && !isGeneric(word),
  );
  return rest.length === 0;
}
