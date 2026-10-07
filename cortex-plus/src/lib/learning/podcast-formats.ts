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

export function podcastLengthSpec(length: PodcastLength): PodcastLengthSpec {
  switch (length) {
    case "ozet":
      return {
        label: "Özet",
        minutes: 1,
        minChapters: 3,
        maxChapters: 4,
        brief: "Yaklaşık 1 dakika, 3 kısa bölüm, toplam 120-180 kelime. Sınav öncesi tekrar.",
        speakers: "single",
        style: "",
      };
    case "derin":
      return {
        label: "Derinlemesine",
        minutes: 10,
        minChapters: 6,
        maxChapters: 8,
        brief: "Yaklaşık 10 dakika, 6-8 bölüm, toplam 1100-1400 kelime. Örnek ve bağlamla tam konu.",
        speakers: "single",
        style: "",
      };
    case "diyalog":
      return {
        label: "Diyalog",
        minutes: 5,
        minChapters: 4,
        maxChapters: 6,
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 550-750 kelime.",
        speakers: "duo",
        style:
          "Ada öğretmen, Kerem meraklı bir öğrenci arkadaşı. Sırayla konuşurlar. Kerem kısa sorular sorar " +
          "ya da öğrencilerin karıştırdığı noktayı soru olarak dile getirir; Ada açıklar ve düzeltir. " +
          "Kerem kesin bilgi vermez, yanlış bir cümleyi doğruymuş gibi söylemez. Konuşmayı Ada açar ve bitirir.",
      };
    case "soru_cevap":
      return {
        label: "Soru-Cevap",
        minutes: 7,
        minChapters: 5,
        maxChapters: 7,
        brief: "Yaklaşık 7 dakika, 5-7 bölüm, toplam 800-1000 kelime.",
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
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 450-600 kelime.",
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
        brief: "Yaklaşık 5 dakika, 4-6 bölüm, toplam 550-750 kelime.",
        speakers: "single",
        style: "",
      };
  }
}

/** İki sunuculu türlerin JSON kuralı (tek öğretmenli olanın karşılığı). */
export const DUO_NARRATOR_SCHEMA =
  'Her satırın speaker alanı "ada" (öğretmen) ya da "kerem" (öğrenci arkadaşı). İkisi de konuşur. Her text TEK cümle ve 25 kelimeyi geçmez.';

export function podcastDuoBrief(): string {
  return (
    "Ada (öğretmen) ile Kerem (öğrenci arkadaşı) konuşarak akılda kalan bir ders anlatır. " +
    "Her bölüm: ne olduğu, neden önemli olduğu, kaynaktaki somut örnek, öğrencinin gerçekten yaptığı hata, tek cümlelik tekrar. " +
    "Benzetme açıklamanın yerine geçmez. Sınavda çıkan noktayı vurgula. Kaynakta olmayan sayı veya formül yok."
  );
}
