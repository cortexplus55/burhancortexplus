import { EXAMPLE_CLASSIFICATION_RULE } from "@/lib/learning/teaching-rubric";

/**
 * Ders adımını "farklı anlat" (10 Kasım 2026).
 *
 * "Farklı anlat" yalnız ders sonunda vardı ve bütün dersi yeniden yazdırıyordu (yeni ders hakkı). Öğrenci tek bir
 * adımı anlamadığında o adımı başka bir yoldan duymak ister: gündelik bir benzetme ya da daha sade bir anlatım.
 * Bu, ders içi yardımdır (eğitmenle aynı sayaç: ücretsizde derse dahil). Yeni bilgi yazılmaz: adımın söylediği
 * aynı bilgi başka bir yoldan anlatılır; sayı, eşik ve terim adımdaki gibi kalır.
 */

/** Adımdan modele giden metnin tavanı (karakter). */
export const REEXPLAIN_TEXT_MAX = 2400;
/** Cevabın tavanı (karakter). */
export const REEXPLAIN_REPLY_MAX = 1800;

export const REEXPLAIN_RULE =
  "GÖREV: Aşağıdaki ders adımını öğrenci ilk anlatımla anlamadı. AYNI bilgiyi FARKLI bir yoldan anlat: ya gündelik " +
  "hayattan bir benzetmeyle ya da daha sade, daha kısa cümlelerle ve adım adım. İlk anlatımın cümlelerini yeniden " +
  "yazma; başka bir giriş, başka bir örnek kullan.\n" +
  "SINIR: Yeni olgu, sayı, eşik, tarih, sınıflandırma ya da formül EKLEME. Adımda geçen sayı, birim, terim ve " +
  "formül aynen kalır; benzetme yalnız anlamayı kolaylaştırır, kuralı değiştirmez. Adımda olmayan bir şeyi " +
  "bilgi diye sunma.\n" +
  "BİÇİM: 4-8 cümle. Terimi ilk geçtiği yerde tek cümleyle açıkla, anahtar terim **kalın**. Varsa formülü olduğu " +
  "gibi bir kez yaz. Son satır 'Kısaca:' ile başlayan tek cümlelik özet. Soru sorma, test yazma, selam verme.";

/** Ders metnindeki biçim işaretlerini düz yazıya indirir (modele giden adım metni). */
export function plainStepText(text: string): string {
  return text
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REEXPLAIN_TEXT_MAX);
}

export function reexplainUserPrompt(input: {
  prepTitle: string;
  topicLabel: string;
  heading: string;
  text: string;
  /** Aynı adım için daha önce verilen farklı anlatımlar: yenisi onları tekrar etmesin. */
  previous?: readonly string[];
}): string {
  const previous = (input.previous ?? []).map((item) => item.trim()).filter(Boolean).slice(-2);
  return [
    REEXPLAIN_RULE,
    EXAMPLE_CLASSIFICATION_RULE,
    `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}.`,
    `ADIMIN BAŞLIĞI: ${input.heading.trim()}`,
    `ADIMIN İLK ANLATIMI:\n${plainStepText(input.text)}`,
    previous.length
      ? `DAHA ÖNCE VERİLEN FARKLI ANLATIMLAR (bunları tekrar etme, başka bir yol bul):\n${previous.map((item) => `- ${item.slice(0, 400)}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
