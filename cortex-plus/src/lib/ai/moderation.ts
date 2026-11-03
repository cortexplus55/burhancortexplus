import "server-only";
import OpenAI from "openai";
import { openaiClient } from "@/lib/ai/openai-client";
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
 * Gecikme politikası (3 Kasım 2026, canlı ölçüm: sohbette denetim ttft'yi 2,08 sn'ye çekiyordu).
 *
 * - Tek istemci süreç boyunca yeniden kullanılır: TLS/HTTP bağlantısı her çağrıda yeniden kurulmaz.
 * - Çekişmeli istek (hedge): ilk istek `MODERATION_HEDGE_MS` içinde dönmezse aynısı ikinci kez atılır,
 *   ilk BAŞARILI cevap kullanılır; geç kalan iptal edilir. Karar kuralı (`classify`) değişmez.
 * - Toplam bekleme `MODERATION_BUDGET_MS` ile sınırlı. Zaman aşımı ya da iki isteğin de hatası eskisi gibi
 *   `allow` + `error` alanı döner (fail-open; eskiden 20 sn + 1 yeniden deneme sonra allow). Çağıran bunu günlüğe yazar.
 *   Bu, önceki davranışla aynı yön: denetim ucu tökezledi diye ders durmaz; sistem yönergesi ve kredi sınırı yerinde.
 */
export const MODERATION_HEDGE_MS = 700;
export const MODERATION_BUDGET_MS = 6_000;

let sharedClient: OpenAI | null = null;
function moderationClient(): OpenAI {
  sharedClient ??= openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: MODERATION_BUDGET_MS, maxRetries: 0 });
  return sharedClient;
}

type ModerationCall = (input: OpenAI.Moderations.ModerationCreateParams["input"], signal: AbortSignal) => Promise<string[]>;

const openaiCall: ModerationCall = async (input, signal) => {
  const result = await moderationClient().moderations.create({ model: "omni-moderation-latest", input }, { signal });
  const first = result.results[0];
  if (!first) return [];
  return Object.entries(first.categories).filter(([, on]) => on).map(([name]) => name);
};

/** İlk başarılı cevap; ikinci istek yalnız ilki `hedgeMs` içinde dönmezse ya da hata verirse atılır. */
export async function hedgedModeration(
  input: OpenAI.Moderations.ModerationCreateParams["input"],
  call: ModerationCall = openaiCall,
  options: { hedgeMs?: number; budgetMs?: number } = {},
): Promise<{ flagged: string[] } | { error: "timeout" | "failed" }> {
  const hedgeMs = options.hedgeMs ?? MODERATION_HEDGE_MS;
  const budgetMs = options.budgetMs ?? MODERATION_BUDGET_MS;
  const controllers: AbortController[] = [];
  return await new Promise((resolve) => {
    let settled = false;
    let failures = 0;
    let launched = 0;
    const finish = (value: { flagged: string[] } | { error: "timeout" | "failed" }) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(budgetTimer);
      for (const controller of controllers) controller.abort();
      resolve(value);
    };
    const launch = () => {
      if (settled || launched >= 2) return;
      launched += 1;
      const controller = new AbortController();
      controllers.push(controller);
      call(input, controller.signal).then(
        (flagged) => finish({ flagged }),
        () => {
          failures += 1;
          if (launched < 2) launch();
          else if (failures >= 2) finish({ error: "failed" });
        },
      );
    };
    const hedgeTimer = setTimeout(launch, hedgeMs);
    const budgetTimer = setTimeout(() => finish({ error: "timeout" }), budgetMs);
    launch();
  });
}

/**
 * Metni (ve varsa görseli) denetler.
 *
 * Hata/zaman aşımında `allow` döner (bkz. gecikme politikası). Bilerek: denetim ucu tökezledi diye
 * öğrencinin dersi durmasın. Zaten asıl kalkan bu değil — sistem mesajındaki yönerge ve kredi sınırı da yerinde duruyor.
 */
export async function moderate(
  input: ModerationInput,
): Promise<ModerationDecision> {
  if (!env.OPENAI_API_KEY) return { action: "allow", categories: [] };

  const text = typeof input === "string" ? input : input.text;
  const imageUrls = typeof input === "string" ? [] : (input.imageUrls ?? []);
  const content: OpenAI.Moderations.ModerationCreateParams["input"] =
    imageUrls.length > 0
      ? [
          { type: "text", text },
          ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ]
      : text;
  const outcome = await hedgedModeration(content);
  if ("error" in outcome) {
    console.warn("moderation_unavailable", { outcome: outcome.error, policy: "allow" });
    return { action: "allow", categories: [] };
  }
  return classify(outcome.flagged);
}
