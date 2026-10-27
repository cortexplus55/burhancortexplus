/**
 * Podcast türleri — Astra'daki beş tür (1 Ekim 2026, ürün sahibinin kararı).
 *
 * İstemci ve sunucu aynı listeyi okur; bu dosya sunucu modülü içermez.
 * Ad "length" olarak kalıyor: önbellek tablosu ve bağlantılar bu adla
 * yazılmış. "standart" eski kayıtlar ve bağlantılar için durur, seçicide yok.
 *
 * İki sunuculu türler (Diyalog, Soru-Cevap) #77'de (24 Eylül) tek öğretmene
 * indirilmişti; ses hattı Ada ve Kerem'i hâlâ ayrı seslerle okuyor.
 */
export const PODCAST_LENGTHS = ["diyalog", "ozet", "soru_cevap", "basit", "derin", "standart"] as const;
export type PodcastLength = (typeof PODCAST_LENGTHS)[number];

export const DEFAULT_PODCAST_LENGTH: PodcastLength = "diyalog";

export function parsePodcastLength(value: unknown): PodcastLength {
  return PODCAST_LENGTHS.includes(value as PodcastLength) ? (value as PodcastLength) : DEFAULT_PODCAST_LENGTH;
}

export type PodcastFormatOption = {
  id: PodcastLength;
  emoji: string;
  label: string;
  minutes: number;
  blurb: string;
};

/** Seçicide görünen beş tür, Astra'nın sırasıyla. */
export const PODCAST_FORMAT_OPTIONS: PodcastFormatOption[] = [
  { id: "diyalog", emoji: "💬", label: "Diyalog", minutes: 5, blurb: "Ada ile Kerem konuyu konuşarak anlatıyor" },
  { id: "ozet", emoji: "⚡", label: "Özet", minutes: 1, blurb: "Sınavdan önce bir dakikalık tekrar" },
  { id: "soru_cevap", emoji: "❓", label: "Soru-Cevap", minutes: 7, blurb: "Kerem soruyor, Ada adım adım cevaplıyor" },
  { id: "basit", emoji: "🗣️", label: "Basit anlatım", minutes: 5, blurb: "Tek öğretmen, kısa cümleler, sakin tempo" },
  { id: "derin", emoji: "📚", label: "Derinlemesine", minutes: 9, blurb: "Ada ile Kerem konunun tamamını örnekleriyle konuşuyor" },
];

export type PodcastLengthSpec = {
  label: string;
  minutes: number;
  minChapters: number;
  maxChapters: number;
  brief: string;
  /** Senaryonun kelime bandı; altı bir genişletme turu açar (`podcastStructureIssues`). */
  words: { min: number; max: number };
  /** "duo": Ada ve Kerem konuşur; "single": yalnız Ada. */
  speakers: "single" | "duo";
  /** Türe özgü anlatım kuralı; boşsa yok. */
  style: string;
};

/*
  Kelime aralıkları ölçülen okuma hızından (19 Ekim 2026): canlıda iki sesli 657 kelimelik bölüm
  7:29 sürdü — dakikada ~88 kelime (sesler arası duraklarla); tek seste ~95. Önceki aralıklar
  dakikada 130 kelime varsayıyordu: "~5 dk" diye sunulan podcast 7,5 dakika çıkıyordu.
*/
export function podcastLengthSpec(length: PodcastLength): PodcastLengthSpec {
  switch (length) {
    case "ozet":
      return {
        label: "Özet",
        minutes: 1,
        minChapters: 3,
        maxChapters: 4,
        brief: "Yaklaşık 1 dakika, 3 kısa bölüm, toplam 85-105 kelime. Sınav öncesi tekrar.",
        words: { min: 85, max: 105 },
        speakers: "single",
        style: "",
      };
    case "derin":
      // İki ses, 8-10 dakika: iki seste dakikada ~88 kelime → 750-880 kelime.
      return {
        label: "Derinlemesine",
        minutes: 9,
        minChapters: 6,
        maxChapters: 8,
        brief: "Yaklaşık 8-10 dakika, 6-8 bölüm, toplam 750-880 kelime. Örnek ve bağlamla tam konu.",
        words: { min: 750, max: 880 },
        speakers: "duo",
        style:
          "Ada öğretmen, Kerem konuya çalışmış bir öğrenci arkadaşı; ikisi de anlatır. Her bölüm bir kavramı derinlemesine " +
          "işler: ne olduğu, nedeni, somut bir vaka ve neyle karıştırıldığı. Kerem örnek verir, duyduğunu kendi sözleriyle " +
          "toparlar, iki kavramı karşılaştırır; Ada açıklamanın ağırlığını taşır. Konuşmayı Ada açar ve bitirir.",
      };
    case "diyalog":
      return {
        label: "Diyalog",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 400-480 kelime.",
        words: { min: 400, max: 480 },
        speakers: "duo",
        // 17 Ekim 2026, ürün sahibi: "Astra gibi iki ses de anlatsın". Kerem'in bütün sıraları tek
        // cümlelik soruydu (canlı ölçüm, solunum podcast'i); Astra'da iki sunucu da anlatıyor.
        style:
          // 20 Ekim 2026 kör kıyas: "kaynaktaki bir örneği anlatır" Kerem'e dört kez "Notlarındaki örnekte …"
          // dedirtti (istemdeki kapsam satırı da bunu istiyordu, `podcastGroundingBrief`). Örnek kaynağı anmadan anlatılır.
          "Ada öğretmen, Kerem konuya çalışmış bir öğrenci arkadaşı; ikisi de anlatır. Kerem yalnız soru sormaz: " +
          "bir örneği kaynağı anmadan anlatır, duyduğunu kendi sözleriyle toparlar, iki kavramı karşılaştırır ya da Ada'nın " +
          "açıklamasını bir adım ilerletir (1-3 cümle). Kerem'in konuşma sıralarının en az yarısı soru değil, bilgi taşır. " +
          "Ada açıklamanın ağırlığını taşır, Kerem'in eksik bıraktığını tamamlar. Kerem'in söylediği bilgi de doğrudur ve " +
          "kaynakla çelişmez; yanlış bir cümleyi doğruymuş gibi söylemez. Konuşmayı Ada açar ve bitirir.",
      };
    case "soru_cevap":
      return {
        label: "Soru-Cevap",
        minutes: 7,
        minChapters: 5,
        maxChapters: 7,
        brief: "Yaklaşık 7 dakika, 5-7 bölüm, toplam 560-670 kelime.",
        words: { min: 560, max: 670 },
        speakers: "duo",
        style:
          "Her bölüm Kerem'in sınavda çıkabilecek bir sorusuyla açılır; Ada adım adım cevaplar. Kerem cevabı dinledikten " +
          "sonra duyduğunu kendi cümlesiyle toparlar ya da bir örnekle sınar; Ada eksik kalanı tamamlar. Son bölümde " +
          "Kerem üç kısa tekrar cümlesi söyler, Ada kapatır.",
      };
    case "basit":
      return {
        label: "Basit anlatım",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 430-520 kelime.",
        words: { min: 430, max: 520 },
        speakers: "single",
        style:
          "Sade anlat: günlük kelimeler, her cümle en fazla 15 kelime. Terimi kullanmadan önce tanımla. " +
          "Her bölümün ana fikrini sonunda bir kez daha, başka kelimelerle söyle.",
      };
    default:
      return {
        label: "Standart",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 430-520 kelime.",
        words: { min: 430, max: 520 },
        speakers: "single",
        style: "",
      };
  }
}

/** İki sesli türde Kerem'in satır payı (cümle sayısıyla): bu bandın dışı tek ses gibi duyuluyor. */
export const KEREM_SHARE_MIN = 0.35;
export const KEREM_SHARE_MAX = 0.5;

export const KEREM_SHARE_RULE =
  "Kerem'in cümleleri bütün cümlelerin %35-50'si: Kerem de bilgi taşır (örnek, toparlama, karşılaştırma); konuşmayı " +
  "Ada açar ve bitirir.";

/**
 * Dinleme kuralı: podcast kulaktan dinlenir. Yazılı sınav talimatı ve boş övgü konuşmaya girmez; yazar (istem) ve
 * kod (`spokenSentence`) aynı listeyi uygular.
 */
export const SPOKEN_ONLY_RULE =
  "Bu bir dinleme, kâğıt sınavı değil: 'şıkları ele', 'işaretle', 'kâğıda yaz', 'boşluğu doldur', 'cevap kâğıdı', " +
  "'soruları cevaplayınız' gibi yazılı sınav talimatı verme. Boş övgü yok ('harika değindin', 'çok güzel soru', " +
  "'aferin', 'süper', 'great job', 'well done', cümlenin sonundaki 'muazzam bir özet oldu'): onaylamak yerine doğrudan bilgiyle devam et.";

const PAPER_INSTRUCTION =
  /(?<!\p{L})(?:şıkları\s+ele\p{L}*|şık\s+eleme\p{L}*|eleme\s+yöntem\p{L}*|işaretle(?:yin|yiniz|yin\p{L}*)?|kâğıd?(?:ı|a|ına)\s+yaz\p{L}*|kağıd?(?:ı|a|ına)\s+yaz\p{L}*|cevap\s+kâğıd\p{L}*|cevap\s+kağıd\p{L}*|optik\s+form\p{L}*|boşlu(?:ğu|kları)\s+doldur\p{L}*|soruları\s+cevaplayınız|aşağıdaki\s+sorular\p{L}*)(?!\p{L})/iu;
const SPEAKER_LABEL_PREFIX = /^(?:öğretmen|ogretmen|öğrenci|ogrenci|sunucu)\s*:\s*/iu;
const TRAILING_PRAISE =
  /(?:^|[\s,;])(?:çok\s+)?(?:muazzam|harika|süper|güzel|mükemmel|müthiş|şahane|great|awesome|amazing|excellent|perfect|brilliant|wonderful|superb)\s+(?:bir\s+|a\s+|an\s+)?(?:özet|soru|nokta|job|summary|point|work)\s*(?:oldu|idi|was)?[.!?…]*$/iu;

const PRAISE_WORD = new Set([
  "harika", "super", "guzel", "mukemmel", "muthis", "sahane", "muazzam", "aferin", "tebrikler", "bravo", "harikasin",
  "great", "awesome", "amazing", "excellent", "perfect", "brilliant", "wonderful", "superb", "nice", "well", "good",
  "congratulations", "congrats",
]);
const PRAISE_OBJECT = new Set([
  "soru", "nokta", "degindin", "deginme", "yakaladin", "tespit", "soyledin", "gozlem", "ozet", "job", "work", "done",
  "summary", "point", "question",
]);
const PRAISE_FILLER = new Set([
  "bir", "cok", "the", "a", "an", "oldu", "idi", "bu", "ve", "and", "of", "was", "is", "that", "ya", "de", "da",
]);
const SPEAKER_NAME = new Set(["kerem", "ada"]);

function praiseFold(word: string): string {
  return word
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z]/g, "");
}

/** Bilgi taşımayan parça: yalnız övgü, boş nesne, dolgu veya konuşmacı adı. */
function praiseOnlyClause(clause: string): boolean {
  const tokens = clause.split(/\s+/).map(praiseFold).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => PRAISE_WORD.has(token) || PRAISE_OBJECT.has(token) || PRAISE_FILLER.has(token) || SPEAKER_NAME.has(token));
}

/** Virgül ve noktalı virgül övgü parçasını ayırır. Rakamlar arasındaki virgül ondalıktır, bölünmez. */
function splitPraiseClauses(text: string): string[] {
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch !== "," && ch !== ";") {
      buf += ch;
      continue;
    }
    const prevDigit = /\d/.test(buf.trimEnd().slice(-1));
    let j = i + 1;
    while (text[j] === " ") j += 1;
    const nextDigit = /\d/.test(text[j] ?? "");
    if (ch === "," && prevDigit && nextDigit) {
      buf += text.slice(i, j + 1);
      i = j;
      continue;
    }
    const clause = buf.trim();
    if (clause) parts.push(clause);
    buf = "";
  }
  const last = buf.trim();
  if (last) parts.push(last);
  return parts;
}

/**
 * Konuşmaya girecek cümle. Yazılı sınav talimatı düşer. Satır başındaki konuşmacı etiketi,
 * baştaki ve cümle içindeki boş övgü düşer. Bilgi taşıyan parça kalır.
 */
export function spokenSentence(text: string): string | null {
  let trimmed = text.trim().replace(SPEAKER_LABEL_PREFIX, "").trim();
  if (!trimmed || PAPER_INSTRUCTION.test(trimmed)) return null;
  let previous = "";
  while (trimmed && trimmed !== previous) {
    previous = trimmed;
    trimmed = trimmed.replace(TRAILING_PRAISE, "").trim();
  }
  const kept = splitPraiseClauses(trimmed).filter((clause) => clause && !praiseOnlyClause(clause));
  const rest = kept.join(", ").trim();
  if (!/\p{L}{2,}/u.test(rest)) return null;
  return rest.charAt(0).toLocaleUpperCase("tr-TR") + rest.slice(1);
}

/** Senaryodaki konuşmacı adı → ses kimliği; öğretmen/sunucu Ada, öğrenci Kerem. */
export function speakerIdOf(raw: unknown): "ada" | "kerem" | null {
  const name = String(raw ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}]/gu, "");
  if (name === "kerem" || name === "öğrenci" || name === "ogrenci") return "kerem";
  if (name === "ada" || name === "öğretmen" || name === "ogretmen" || name === "sunucu") return "ada";
  return null;
}

/** İki sunuculu türlerin JSON kuralı (tek öğretmenli olanın karşılığı). */
export const DUO_NARRATOR_SCHEMA =
  'Her satırın speaker alanı "ada" (öğretmen) ya da "kerem" (öğrenci arkadaşı). İkisi de konuşur. Her satır bir konuşma sırasıdır: 1-4 cümle, her cümle en çok 25 kelime. Ada açıklarken nedenini ve sonucunu da söyler; Kerem\'in ne yaptığı BİÇİM satırında yazılı.';

/**
 * Ada ve Kerem konuşmacıdır; öğrencinin hayatını uydurmazlar (27 Ekim 2026).
 * Yazar (`podcastDuoBrief`, senarist) ve satır taraması aynı yasakları okur.
 */
export const NO_FABRICATED_MEMORY_RULE =
  "SIFIR UYDURMA KİŞİSEL ANI (kesin): Ada ve Kerem ASLA \"geçen gün denemede\", \"lisedeyken\", \"ben sınava girerken\" veya \"arkadaşım\" diye uydurma kişisel hayat hikayesi ya da anı anlatamaz. " +
  "Doğrudan konunun özünü, formülün ve kavramın mantığını ve gerçek sınav sorularında dikkat edilecek noktayı konuşurlar. Örnek varsa üçüncü kişidir.";

/** Konuşmacının kendi hayatını anlattığı satır. Kurtarma bu satırı çıkarır. */
export const FABRICATED_MEMORY =
  /geçen gün|lisedeyken|ben sınava girerken|arkadaşım|dün girdiğim deneme|kendi yaşadığım/iu;

/** Podcast satır sesleri aynı anda bu kadar üretilir. Sıralı bekleme bölümü dakikalarca tutuyordu. */
export const PODCAST_TTS_CONCURRENCY = 6;

/**
 * İşleri `limit` şerit halinde birlikte çalıştırır. Bir şerit bitince sıradakini alır.
 * `Promise.all` şeritleri bekler; satırlar tek tek `for await` ile sıralanmaz.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  let failed = false;
  const lanes = Math.max(1, Math.min(limit, items.length));
  async function runLane(): Promise<void> {
    for (;;) {
      if (failed) return;
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => runLane()));
}

/**
 * İki sunuculu türlerde konuşma sırası kuralı (20 Ekim 2026, kör kıyas). Canlı podcast'te Kerem doğru
 * cevabı kendisi verip ardından "Ben tek ölçümü yeterli sanmışım" dedi; başka bir bölümde art arda iki
 * soru sordu, Ada ilgisiz bir tanımla devam etti, soruyu sonunda Kerem kendisi cevapladı. Yazar
 * (`podcastDuoBrief`) ve denetçi (G maddesi, `teacher-podcast.ts`) bu metni aynen okur.
 */
export const DUO_TURN_RULE =
  "Bir konuşmacı soru sorarsa öbürü hemen sonraki konuşma sırasında o soruyu cevaplar; bir sırada en çok bir soru " +
  "sorulur ve soruyu soran kendi sorusunu cevaplamaz ('Dur ve düşün:' dinleyene sorulur, cevabı 'Cevap:' satırıdır). " +
  "Kerem bir yanılgıyı ('Ben … sanmışım / varsaymışım') yalnız doğrusu henüz söylenmemişken itiraf eder; doğru cevabı " +
  "kendisi verdiyse aynı konuda yanılgı itiraf etmez. Hiçbir konuşmacı kendi önceki cümlesiyle çelişmez. " +
  // 22 Ekim 2026 kör kıyas (2. tur): Kerem evet/hayır sorusu soruyor, Ada "Hayır; …" / "Evet; …" diye açıyordu;
  // yargıçlar "sesli okunan bilgi kartı destesi" dedi.
  "Cevap 'Evet;' ya da 'Hayır;' diye açılmaz: doğrudan bilgiyle, nedeniyle başlar. Sorular evet/hayır sorusu değil, " +
  "'neden', 'nasıl', 'ne fark eder' sorusudur. 'Çünkü' gerçek bir neden söyler; cümlenin kendisini tekrar etmez.";

export function podcastDuoBrief(): string {
  return (
    "Ada (öğretmen) ile Kerem (öğrenci arkadaşı) gerçek bir sohbet gibi konuşarak akılda kalan bir ders anlatır. " +
    "Bütün podcast'te şunlar olsun: her kavramın ne olduğu ve neden öyle olduğu, somut bir örnek, sık yapılan " +
    "bir iki hata, sınavda çıkan nokta. Bunları her bölümde aynı sırayla dizme; bölümler farklı açılsın " +
    "(bir vaka, Kerem'in merakı, iki kavramın karşılaştırması). " +
    "Kerem doğal konuşur: merak eder, karıştırılan noktayı soru olarak sorar ('Yani … mı?'); Ada " +
    "nedenini söyleyerek cevaplar. Kerem 'Ben … sanmışım' diye itiraf etmez; yaygın hatayı 'Çoğu öğrenci … sanır' diye " +
    "söyler, Ada nedenini açıklar. Kerem Ada'nın cümlesini tekrar etmez; duyduğunu kendi örneğiyle ya da bir sonuçla " +
    "ileri taşır. Kerem merakla ya da bir kavramı karıştırarak açar; kendi hayatından anı anlatmaz. " +
    `${NO_FABRICATED_MEMORY_RULE} ` +
    `${DUO_TURN_RULE} ${KEREM_SHARE_RULE} ` +
    "Ada kaynaktan cümle okumaz; kendi sözleriyle, konuşur gibi anlatır ve bir açıklamayı art arda iki üç satırda " +
    "sürdürebilir. Aynı tanımı bir bölümde bir kez söyle; 'Tekrar edelim' yalnız son bölümde. " +
    "Bilgi taşımayan cümle kurma ('önemli nokta, … ele alınmasıdır', 'bu konu çok önemlidir' gibi); her cümle bir bilgi, " +
    "bir neden ya da bir örnek taşır. Bir olguyu söylediğinde nedenini ve sonucunu da söyle. " +
    "Benzetme açıklamanın yerine geçmez. Kaynakta olmayan sayı veya formül yok."
  );
}

/** Ölçülen okuma hızı (kelime/dk): iki seste sesler arası duraklarla ~88, tek seste ~95 (19 Ekim 2026). */
export const DUO_WORDS_PER_MINUTE = 88;
export const SINGLE_WORDS_PER_MINUTE = 95;

/** Senaryonun yaklaşık süresi (dakika), ölçülen okuma hızıyla. */
export function estimatedPodcastMinutes(words: number, speakers: "single" | "duo"): number {
  const perMinute = speakers === "duo" ? DUO_WORDS_PER_MINUTE : SINGLE_WORDS_PER_MINUTE;
  return Math.max(1, Math.round(words / perMinute));
}
