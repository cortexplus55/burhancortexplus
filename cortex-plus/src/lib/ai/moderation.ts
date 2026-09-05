import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

/**
 * İçerik denetimi.
 *
 * OpenAI'nin moderation ucu ücretsiz ve ayrı bir modelde çalışıyor; yani bu
 * kontrol faturaya bir şey eklemiyor. Buna rağmen bugüne kadar hiç
 * çağrılmıyordu.
 *
 * Kurgunun özü şu: bir eğitim platformunda kaba bir "zararlı kelime" filtresi
 * en çok dersin kendisini vurur. Tarih dersinde savaş, biyolojide üreme,
 * edebiyatta intihar geçer. Bu yüzden işaretlenen her şey engellenmiyor —
 * üç ayrı davranış var:
 *
 *   engelle : gerçekten zararlı ve dersle açıklanamaz olan
 *   destekle: öğrencinin kendine zarar verme ihtimali
 *   işaretle: geri kalanı — üretim yapılır, olay yalnızca kaydedilir
 */

export type ModerationDecision =
  | { action: "allow"; categories: string[] }
  | { action: "flag"; categories: string[] }
  | { action: "support"; categories: string[]; message: string }
  | { action: "block"; categories: string[]; message: string };

/**
 * Dersle açıklanamayacak olanlar. Küçüklerin cinselleştirilmesi hiçbir
 * bağlamda istisna değil; kalanlar da "nasıl yapılır" isteyen, yani bilgiden
 * çok eyleme yönelen kategoriler.
 */
const BLOCK_CATEGORIES = new Set([
  "sexual/minors",
  "self-harm/instructions",
  "illicit/violent",
  "hate/threatening",
  "harassment/threatening",
]);

/** Öğrencinin kendisiyle ilgili olabilecek sinyaller. */
const SUPPORT_CATEGORIES = new Set(["self-harm", "self-harm/intent"]);

const BLOCK_MESSAGE =
  "Bu konuda yardımcı olamam. Dersinle ilgili bir şey sorarsan seve seve " +
  "birlikte çalışırız.";

/**
 * Kendine zarar sinyalinde soğuk bir ret, yardım isteyen bir gence kapıyı
 * kapatmak olur. Yanıt reddetmiyor, karşısındakini yalnız bırakmıyor ve
 * arayabileceği yeri söylüyor.
 */
const SUPPORT_MESSAGE =
  "Yazdıkların aklıma takıldı ve seni gerçekten önemsiyorum. Şu an zor bir " +
  "şey yaşıyorsan bunu tek başına taşımak zorunda değilsin.\n\n" +
  "Güvendiğin bir yetişkinle — ailenden biri, bir öğretmenin ya da okul " +
  "rehberlik servisi — konuşabilir misin? Ayrıca **ALO 183** Sosyal Destek " +
  "Hattı'nı günün her saati ücretsiz arayabilirsin. Kendine zarar verme " +
  "tehlikesi varsa hemen **112**'yi ara.\n\n" +
  "Hazır olduğunda buradayım; dersine devam etmek istersen birlikte " +
  "bakabiliriz.";

/**
 * İşaretlenen kategorilerden karara. Ağ çağrısından ayrı duruyor ki hangi
 * kategorinin ne yaptığı testle sabitlenebilsin — bu eşleşme yanlış olursa
 * ya öğrenci boşuna engellenir ya da engellenmesi gereken şey geçer.
 */
export function classify(flagged: string[]): ModerationDecision {
  if (flagged.length === 0) return { action: "allow", categories: [] };
  if (flagged.some((c) => BLOCK_CATEGORIES.has(c))) {
    return { action: "block", categories: flagged, message: BLOCK_MESSAGE };
  }
  if (flagged.some((c) => SUPPORT_CATEGORIES.has(c))) {
    return { action: "support", categories: flagged, message: SUPPORT_MESSAGE };
  }
  return { action: "flag", categories: flagged };
}

type ModerationInput =
  | string
  | { text: string; imageUrls?: string[] };

/**
 * Metni (ve varsa görseli) denetler.
 *
 * Hata durumunda `allow` döner. Bilerek: denetim ucu tökezledi diye
 * öğrencinin dersi durmasın. Zaten asıl kalkan bu değil — sistem mesajındaki
 * yönerge ve kredi sınırı da yerinde duruyor.
 */
export async function moderate(
  input: ModerationInput,
): Promise<ModerationDecision> {
  if (!env.OPENAI_API_KEY) return { action: "allow", categories: [] };

  const text = typeof input === "string" ? input : input.text;
  const imageUrls = typeof input === "string" ? [] : (input.imageUrls ?? []);

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const content: OpenAI.Moderations.ModerationCreateParams["input"] =
      imageUrls.length > 0
        ? [
            { type: "text", text },
            ...imageUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : text;

    const result = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: content,
    });

    const first = result.results[0];
    if (!first) return { action: "allow", categories: [] };

    return classify(
      Object.entries(first.categories)
        .filter(([, on]) => on)
        .map(([name]) => name),
    );
  } catch {
    return { action: "allow", categories: [] };
  }
}
