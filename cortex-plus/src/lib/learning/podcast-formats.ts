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
  { id: "derin", emoji: "📚", label: "Derinlemesine", minutes: 10, blurb: "Konunun tamamı, örnekleriyle" },
];

export type PodcastLengthSpec = {
  label: string;
  minutes: number;
  minChapters: number;
  maxChapters: number;
  brief: string;
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
        speakers: "single",
        style: "",
      };
    case "derin":
      return {
        label: "Derinlemesine",
        minutes: 10,
        minChapters: 6,
        maxChapters: 8,
        brief: "Yaklaşık 10 dakika, 6-8 bölüm, toplam 860-1000 kelime. Örnek ve bağlamla tam konu.",
        speakers: "single",
        style: "",
      };
    case "diyalog":
      return {
        label: "Diyalog",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 400-480 kelime.",
        speakers: "duo",
        // 17 Ekim 2026, ürün sahibi: "Astra gibi iki ses de anlatsın". Kerem'in bütün sıraları tek
        // cümlelik soruydu (canlı ölçüm, solunum podcast'i); Astra'da iki sunucu da anlatıyor.
        style:
          "Ada öğretmen, Kerem konuya çalışmış bir öğrenci arkadaşı; ikisi de anlatır. Kerem yalnız soru sormaz: " +
          "kaynaktaki bir örneği anlatır, duyduğunu kendi sözleriyle toparlar, iki kavramı karşılaştırır ya da Ada'nın " +
          "açıklamasını bir adım ilerletir (1-3 cümle). Kerem'in konuşma sıralarının en az yarısı soru değil, bilgi taşır. " +
          "Ada açıklamanın ağırlığını taşır, Kerem'in eksik bıraktığını tamamlar. Kerem'in söylediği bilgi de doğru ve " +
          "kaynağa dayalıdır; yanlış bir cümleyi doğruymuş gibi söylemez. Konuşmayı Ada açar ve bitirir.",
      };
    case "soru_cevap":
      return {
        label: "Soru-Cevap",
        minutes: 7,
        minChapters: 5,
        maxChapters: 7,
        brief: "Yaklaşık 7 dakika, 5-7 bölüm, toplam 560-670 kelime.",
        speakers: "duo",
        style:
          "Her bölüm Kerem'in sınavda çıkabilecek bir sorusuyla açılır; Ada adım adım cevaplar. " +
          "Kerem yalnızca soru sorar, açıklama yapmaz. Son bölümde Ada üç maddelik tekrar yapar.",
      };
    case "basit":
      return {
        label: "Basit anlatım",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 430-520 kelime.",
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
        speakers: "single",
        style: "",
      };
  }
}

/** İki sunuculu türlerin JSON kuralı (tek öğretmenli olanın karşılığı). */
export const DUO_NARRATOR_SCHEMA =
  'Her satırın speaker alanı "ada" (öğretmen) ya da "kerem" (öğrenci arkadaşı). İkisi de konuşur. Her satır bir konuşma sırasıdır: 1-4 cümle, her cümle en çok 25 kelime. Ada açıklarken nedenini ve sonucunu da söyler; Kerem\'in ne yaptığı BİÇİM satırında yazılı.';

export function podcastDuoBrief(): string {
  return (
    "Ada (öğretmen) ile Kerem (öğrenci arkadaşı) gerçek bir sohbet gibi konuşarak akılda kalan bir ders anlatır. " +
    "Bütün podcast'te şunlar olsun: her kavramın ne olduğu ve neden önemli olduğu, kaynaktaki somut örnek, öğrencinin " +
    "gerçekten yaptığı bir iki hata, sınavda çıkan nokta. Bunları her bölümde aynı sırayla dizme; bölümler farklı açılsın " +
    "(bir vaka, Kerem'in merakı, iki kavramın karşılaştırması). " +
    "Kerem doğal konuşur: merak eder, karıştırılan noktayı soru olarak sorar ('Yani … mı?'); Ada " +
    "nedenini söyleyerek cevaplar. Kerem her bölümde 'Ben … sanmışım / varsaymışım' diye hata itiraf etmez; " +
    "bu bütün podcast'te en çok bir kez olur. " +
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
