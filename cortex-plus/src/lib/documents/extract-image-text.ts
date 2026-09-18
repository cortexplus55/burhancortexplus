import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { moderate } from "@/lib/ai/moderation";

/**
 * Fotoğraftan metin okuma.
 *
 * Neden var: öğrenci belgesini fotoğraf olarak da yüklüyor ve tüm yükleme
 * yolları (`document-upload`, telefon yüklemesi, sohbet, deneme sihirbazı)
 * `image/*` kabul ediyor. Okuma tarafı ise yalnızca PDF ve TXT biliyordu —
 * yüklenen her fotoğraf "metin çıkarılamadı" ile düşüyordu.
 *
 * Bu BİÇİM DÖNÜŞÜMÜ, ayrı bir ürün değil. PDF'in metin katmanını okumaktan
 * farkı yok; o yüzden ayrı bir eylem kodu ve ayrı bir kredi fiyatı yok.
 * Modelin işi metni OLDUĞU GİBİ yazmak — soruyu çözmek değil. Çözmek
 * öğrencinin sonra soracağı şey; burada çözersek not defterine sorunun
 * cevabını yazmış oluruz ve öğrenci hiç düşünmez.
 */

/** Modelin "bu görselde okunacak metin yok" demesi için tek kalıp. */
const NO_TEXT = "[METIN_YOK]";

/**
 * Bunun altındaki çıktı okuma sayılmıyor.
 *
 * Tek kelimelik bir cevap ("Matematik") ya da modelin özrü, gömülüp
 * aranabilir hâle geldiğinde öğrenciye belge diye dönerdi. 40 karakter,
 * tek satırlık bir soru kökünü geçiriyor ama gürültüyü tutuyor.
 */
const MIN_USEFUL_CHARS = 40;

/**
 * Görüntü modeline gidebilecek en büyük dosya.
 *
 * Yükleme sınırı 15 MB ama base64 kodlama boyutu ~%33 büyütüyor; 10 MB'ın
 * üstü sağlayıcının sınırına dayanıyor ve oradan dönen hata öğrenciye
 * "işlenemedi" diye çıkıyordu. Erken ve açık reddetmek daha dürüst.
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isImageDocument(mimeType: string | null | undefined): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType ?? "");
}

const PROMPT = [
  "Bu görseldeki tüm yazıyı olduğu gibi yaz.",
  "Soruyu ÇÖZME, yorumlama, özetleme; yalnızca gördüğün metni aktar.",
  "Satır ve paragraf düzenini koru. Şıkları ayrı satırlara yaz.",
  "Matematiksel ifadeleri LaTeX ile yaz.",
  "El yazısını da oku.",
  `Görselde okunacak hiçbir yazı yoksa yalnızca ${NO_TEXT} yaz.`,
].join(" ");

type Attempt = { text: string | null; tokensIn: number; tokensOut: number };

async function readWith(
  openai: OpenAI,
  model: string,
  dataUrl: string,
): Promise<Attempt> {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });
    // Jetonlar okunamasa bile okuma başarılıysa kayıt düşmeli; sıfır, ölçümü
    // eksik gösterir ama yanlış göstermez.
    const tokensIn = completion.usage?.prompt_tokens ?? 0;
    const tokensOut = completion.usage?.completion_tokens ?? 0;
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const usable =
      raw && !raw.includes(NO_TEXT) && raw.length >= MIN_USEFUL_CHARS;
    return { text: usable ? raw : null, tokensIn, tokensOut };
  } catch {
    // Çağrı hiç olmadıysa faturası da yok.
    return { text: null, tokensIn: 0, tokensOut: 0 };
  }
}

export type ImageReadResult = {
  pages: string[];
  ok: boolean;
  /** Okumayı hangi model başardı — ölçüm ve maliyet kaydı için. */
  model: string | null;
  /**
   * Bu okuma için harcanan jetonlar, BAŞARISIZ DENEME DAHİL.
   *
   * Ucuz model okuyamayıp pahalıya çıktığımızda faturaya iki çağrı da
   * yazılıyor. Yalnızca başarılı olanı kaydetmek, kademeli okumanın gerçek
   * bedelini gizlerdi — kademeyi savunan ya da bırakan karar bu sayıya
   * bakacak.
   */
  tokensIn: number;
  tokensOut: number;
  reason?: "not_configured" | "too_large" | "unreadable" | "blocked";
};

/**
 * Bir fotoğraf bir sayfa.
 *
 * Önce ucuz model, olmazsa pahalı model. Sıra ürün sahibinin kararı ve
 * ölçüye uyuyor: düzgün çekilmiş bir ders notunu gpt-4o-mini de okuyor,
 * gpt-4o ise 1.000 jeton başına ~17 kat pahalı. Pahalıya ancak ucuzu
 * OKUYAMADIĞINDA çıkıyoruz — yani bedelini gerçekten zor bir fotoğraf
 * ödetiyor, hepsi değil.
 *
 * İkisi de okuyamazsa `ok: false`; çağıran taraf kotayı geri veriyor.
 * Okunamayan fotoğraf öğrencinin hakkını yakmamalı.
 */
export async function extractImageText(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageReadResult> {
  const empty = { pages: [], ok: false as const, model: null, tokensIn: 0, tokensOut: 0 };
  if (!env.OPENAI_API_KEY) return { ...empty, reason: "not_configured" };
  if (buffer.byteLength > MAX_IMAGE_BYTES) return { ...empty, reason: "too_large" };

  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  /*
    Görsel denetimden geçiyor.

    `/api/ai/solve-image` bunu zaten yapıyor ve gerekçesi burada da geçerli:
    buraya yüklenen şeyin ders notu olduğunu varsayamayız, kamera açılan her
    yerden her şey gelebilir. Denetim veri URL'i üzerinden, yani ikinci bir
    indirme ya da ikinci bir kodlama maliyeti yok.
  */
  const verdict = await moderate({ text: "", imageUrls: [dataUrl] });
  if (verdict.action !== "allow") {
    return { ...empty, reason: "blocked" };
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 0 });

  // İki ad aynıysa (yanlış yapılandırma) aynı modeli iki kez çağırmayalım.
  const ladder = [...new Set([env.OPENAI_STANDARD_MODEL, env.OPENAI_ADVANCED_MODEL])];
  let tokensIn = 0;
  let tokensOut = 0;

  for (const model of ladder) {
    const attempt = await readWith(openai, model, dataUrl);
    tokensIn += attempt.tokensIn;
    tokensOut += attempt.tokensOut;
    if (attempt.text) {
      return { pages: [attempt.text], ok: true, model, tokensIn, tokensOut };
    }
  }

  return {
    pages: [],
    ok: false,
    model: null,
    tokensIn,
    tokensOut,
    reason: "unreadable",
  };
}
