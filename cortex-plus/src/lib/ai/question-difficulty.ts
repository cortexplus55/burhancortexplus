/**
 * Bir sorunun ağırlığını ÜCRETSİZ ölçmek.
 *
 * Amaç: güçlü modeli gerçekten gerektiğinde açmak. Bunun bilinen yolu her
 * mesajı önce küçük bir modele "bu kaç zorlukta" diye sormaktır — ama o yol
 * HER mesaja fazladan bir çağrı, yarım saniye gecikme ve sıfır olmayan bir
 * maliyet ekliyor. Öğrencinin "merhaba"sı için bile.
 *
 * Buradaki ölçüm model çağırmıyor: metnin kendisine bakıyor. İsabeti tek
 * başına yeterli değil ve olması da gerekmiyor, çünkü arkasında ikinci bir
 * katman var: kalite kapısı. Cevap denetimden geçemezse güçlü modelle bir kez
 * daha deneniyor. Yani bu fonksiyon yanılırsa bedeli bir tur gecikme, yanlış
 * cevap değil.
 *
 * Sinyaller uydurma değil; her biri öğrencinin gerçekten yazdığı bir şeyin
 * karşılığı:
 *
 *   • Matematik gösterimi — türev, integral, kök, kesir, üs. Bunlar ucuz
 *     modelin en çok kaydığı yer: işaret hatası ve aritmetik.
 *   • İspat/çözüm istemi — "kanıtla", "türevini al", "çöz". Tek adımlı bilgi
 *     sorusu değil, zincir gerektiriyor.
 *   • Çok parçalı soru — iki soru işareti ya da alt maddeler. Model birini
 *     cevaplayıp diğerini düşürüyor.
 *   • Uzunluk — uzun soru genelde verilmiş bir problem metni.
 *   • Tekrar eden anlaşılmazlık — öğrenci üçüncü turda "hâlâ anlamadım"
 *     diyorsa ucuz model o konuyu anlatamıyor demektir. Bu sinyal ürünün
 *     kendisinden geliyor, metinden değil.
 *
 * Kolay tarafta ayrı bir eşik var: selam, teşekkür, tek kelimelik takip.
 * Bunlar için güçlü modeli açmak parayı çöpe atmak olur.
 */

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type DifficultyVerdict = {
  level: QuestionDifficulty;
  score: number;
  /** Kararın neden böyle olduğu — kayda ve hata ayıklamaya gidiyor. */
  reasons: string[];
};

/** Matematik gösterimi: LaTeX, üs, kök, kesir, integral. */
const MATH_NOTATION =
  /\\frac|\\int|\\sqrt|\\sum|\\lim|\\partial|[∫√∑∂≤≥≠±×÷π]|\^\d|\d\s*\/\s*\d|[a-zA-Z]\s*[²³]/;

/** Zincir gerektiren istemler. */
const CHAIN_WORDS = [
  "kanıtla",
  "ispatla",
  "ispat",
  "türev",
  "integral",
  "limit",
  "denklem",
  "optimizasyon",
  "olasılık",
  "matris",
  "logaritma",
  "çöz",
  "hesapla",
  "adım adım",
  "türet",
  "bul ve",
];

/** Açıklama derinliği isteyen sorular. */
const WHY_WORDS = [
  "neden",
  "niçin",
  "nasıl oluyor",
  "nasıl olur",
  "farkı ne",
  "farkı nedir",
  "ne demek istiyor",
  "mantığı ne",
  "kıyasla",
  "karşılaştır",
];

/** Öğrenci anlamadığını söylüyor. */
const CONFUSION_WORDS = [
  "anlamadım",
  "anlamıyorum",
  "tekrar anlat",
  "başka türlü anlat",
  "hâlâ anlamadım",
  "hala anlamadım",
  "karıştırdım",
];

/** Model gerektirmeyen nezaket. */
const SMALL_TALK = [
  "merhaba",
  "selam",
  "teşekkür",
  "sağ ol",
  "sagol",
  "tamam",
  "peki",
  "günaydın",
  "iyi geceler",
  "eyvallah",
];

function countOccurrences(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => haystack.includes(needle));
}

export function assessQuestionDifficulty(input: {
  message: string;
  /** Bu sohbetteki kaçıncı öğrenci mesajı (1 = ilk). */
  turn?: number;
  /** Görsel varsa zorluk kararına gerek yok; yönlendirme zaten görene gidiyor. */
  hasImage?: boolean;
}): DifficultyVerdict {
  const raw = input.message ?? "";
  const text = raw.toLocaleLowerCase("tr");
  const reasons: string[] = [];
  let score = 0;

  if (input.hasImage) {
    return { level: "hard", score: 100, reasons: ["gorsel"] };
  }

  if (MATH_NOTATION.test(raw)) {
    score += 2;
    reasons.push("matematik_gosterimi");
  }

  const chain = countOccurrences(text, CHAIN_WORDS);
  if (chain.length) {
    score += Math.min(chain.length, 2) + 1;
    reasons.push(`zincir:${chain.slice(0, 3).join(",")}`);
  }

  const why = countOccurrences(text, WHY_WORDS);
  if (why.length) {
    score += 1;
    reasons.push(`aciklama:${why.slice(0, 2).join(",")}`);
  }

  /*
    Çok parçalı soru, ağırlığı soru sayısıyla artan bir sinyal.

    Sabit ağırlık iki yönden de yanlıştı: "Bu nedir? Anlatır mısın?" günlük
    sohbet ve güçlü model gerektirmiyor, ama üç ayrı soruyu tek mesajda
    sormak ucuz modelin birini sessizce düşürdüğü durumdur — canlıda
    görüldü. O yüzden iki işaret zayıf, üç işaret güçlü sinyal.
  */
  const questionMarks = (raw.match(/\?/g) ?? []).length;
  const hasSubItems = /(^|\s)([a-eçğıöşü]\)|[1-9][).])\s/.test(raw);
  if (questionMarks >= 3) {
    score += 3;
    reasons.push("cok_parcali");
  } else if (hasSubItems) {
    score += 2;
    reasons.push("cok_parcali");
  } else if (questionMarks === 2) {
    score += 1;
    reasons.push("iki_soru");
  }

  if (raw.length > 400) {
    score += 2;
    reasons.push("uzun_metin");
  } else if (raw.length > 180) {
    score += 1;
    reasons.push("orta_uzunluk");
  }

  /*
    Tekrar eden anlaşılmazlık en güçlü sinyal, çünkü tahmin değil ölçüm:
    öğrenci ucuz modelin anlatımını bir kez almış ve anlamamış. İlk turda
    "anlamadım" demesi mümkün değil, o yüzden tur sayısı şart.
  */
  const confusion = countOccurrences(text, CONFUSION_WORDS);
  if (confusion.length && (input.turn ?? 1) >= 3) {
    // Tek başına eşiği geçiyor: bu sinyal tahmin değil, başarısız bir
    // denemenin ölçümü. Öğrenci takıldığı an güçlü model maliyetini hak
    // ediyor — konu ne kadar basit görünürse görünsün.
    score += 4;
    reasons.push("tekrar_anlasilmadi");
  } else if (confusion.length) {
    score += 1;
    reasons.push("anlasilmadi");
  }

  // Kısa ve nezaket: güçlü model açmak parayı çöpe atmak.
  const smallTalk = countOccurrences(text, SMALL_TALK);
  if (raw.trim().length <= 40 && smallTalk.length && !chain.length) {
    return { level: "easy", score: 0, reasons: ["kisa_nezaket"] };
  }

  if (score >= 4) return { level: "hard", score, reasons };
  if (score >= 2) return { level: "medium", score, reasons };
  return { level: "easy", score, reasons: reasons.length ? reasons : ["sinyal_yok"] };
}
