import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { moderate } from "@/lib/ai/moderation";
import { cleanOcrPageText } from "@/lib/documents/outline-clean";

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

/** Polite "no text" sentences — only applied to short OCR replies. */
const NO_TEXT_PATTERNS = [
  /\bno\s*text\b/i,
  /\bempty\s*page\b/i,
  /bo[sş]\s*sayfa/i,
  // Anchor to the start of the reply so textbook prose like
  // "yazılı … yoktur" is never matched mid-sentence.
  /^\s*(bu\s+)?g[oö]rselde\b.{0,60}(yaz[ıi]|metin).{0,30}(bulunm|yok|de[gğ]il|g[oö]r[uü]nm[uü]yor)/i,
  /^\s*(okunacak\s+)?(yaz[ıi]|metin)\b.{0,30}(bulunmuyor|yok|g[oö]r[uü]nm[uü]yor)/i,
  /^\s*okunacak.{0,20}(yaz[ıi]|metin).{0,10}yok/i,
];

/** Above this length, polite-refusal patterns must not fire (real textbook prose). */
const POLITE_NO_TEXT_MAX_CHARS = 160;
const POLITE_NO_TEXT_MAX_LINES = 3;

/** Exported for unit tests — junk "no text" answers must never be indexed. */
export function isNoTextOcrResponse(raw: string): boolean {
  const text = raw.trim();
  if (!text) return true;
  if (text.includes(NO_TEXT)) return true;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const shortEnough =
    text.length < POLITE_NO_TEXT_MAX_CHARS && lines.length <= POLITE_NO_TEXT_MAX_LINES;
  if (!shortEnough) return false;
  return NO_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isUsableOcrText(raw: string): boolean {
  const text = raw.trim();
  if (!text || isNoTextOcrResponse(text)) return false;
  return text.length >= MIN_USEFUL_CHARS;
}

/**
 * Görüntü modeline gidebilecek en büyük dosya.
 *
 * Yükleme sınırı 15 MB ama base64 kodlama boyutu ~%33 büyütüyor; 10 MB'ın
 * üstü sağlayıcının sınırına dayanıyor ve oradan dönen hata öğrenciye
 * "işlenemedi" diye çıkıyordu. Erken ve açık reddetmek daha dürüst.
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function isImageDocument(mimeType: string | null | undefined): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType ?? "");
}

const PROMPT = [
  "Bu görseldeki tüm yazıyı olduğu gibi yaz.",
  "Soruyu ÇÖZME, yorumlama, özetleme; yalnızca gördüğün metni aktar.",
  "Satır ve paragraf düzenini koru. Şıkları ayrı satırlara yaz.",
  "Matematiksel ifadeleri LaTeX ile yaz.",
  "El yazısını da oku.",
  "Markdown, kod bloğu veya ``` kullanma; düz metin yaz.",
  `Görselde okunacak hiçbir yazı yoksa yalnızca ${NO_TEXT} yaz.`,
].join(" ");

type Attempt = { text: string | null; tokensIn: number; tokensOut: number; rateLimited: boolean };

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  const code = String((error as { code?: string }).code ?? "");
  return /rate_limit|too_many_requests/i.test(code);
}

function rateLimitWaitMs(error: unknown, attempt: number): number {
  const headers = (error as { headers?: { get?: (k: string) => string | null } }).headers;
  const retryAfter = headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(20_000, seconds * 1000);
  }
  return Math.min(16_000, 500 * 2 ** attempt);
}

/** Below this, a new attempt (or a 429 wait) cannot finish before the deadline. */
const MIN_ATTEMPT_MS = 3_000;

async function readWith(
  openai: OpenAI,
  model: string,
  dataUrl: string,
  deadlineMs: number,
): Promise<Attempt> {
  let rateLimited = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const remaining = deadlineMs - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const completion = await openai.chat.completions.create(
        {
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
        },
        // Each attempt gets only the time that is really left.
        { timeout: Math.min(60_000, remaining) },
      );
      const tokensIn = completion.usage?.prompt_tokens ?? 0;
      const tokensOut = completion.usage?.completion_tokens ?? 0;
      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      const cleaned = cleanOcrPageText(raw);
      const usable = isUsableOcrText(cleaned);
      return { text: usable ? cleaned : null, tokensIn, tokensOut, rateLimited };
    } catch (error) {
      if (!isRateLimitError(error)) break;
      rateLimited = true;
      const wait = rateLimitWaitMs(error, attempt);
      // Never sleep past the deadline.
      if (attempt >= 3 || Date.now() + wait + MIN_ATTEMPT_MS > deadlineMs) break;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return { text: null, tokensIn: 0, tokensOut: 0, rateLimited };
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
  /** The provider answered 429 at least once — the OCR pool slows down. */
  rateLimited?: boolean;
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
  options?: { deadlineMs?: number },
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

  const pageDeadlineMs = options?.deadlineMs ?? Date.now() + 60_000;
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: Math.min(60_000, Math.max(5_000, pageDeadlineMs - Date.now())),
    maxRetries: 0,
  });

  // İki ad aynıysa (yanlış yapılandırma) aynı modeli iki kez çağırmayalım.
  const ladder = [...new Set([env.OPENAI_STANDARD_MODEL, env.OPENAI_ADVANCED_MODEL])];
  let tokensIn = 0;
  let tokensOut = 0;
  let rateLimited = false;

  for (let i = 0; i < ladder.length; i += 1) {
    const model = ladder[i]!;
    // Skip expensive fallback when the step deadline is near.
    if (i > 0 && Date.now() + 25_000 >= pageDeadlineMs) break;
    if (Date.now() >= pageDeadlineMs) break;
    const attempt = await readWith(openai, model, dataUrl, pageDeadlineMs);
    tokensIn += attempt.tokensIn;
    tokensOut += attempt.tokensOut;
    rateLimited ||= attempt.rateLimited;
    if (attempt.text) {
      return { pages: [attempt.text], ok: true, model, tokensIn, tokensOut, rateLimited };
    }
  }

  return {
    pages: [],
    ok: false,
    model: null,
    tokensIn,
    tokensOut,
    reason: "unreadable",
    rateLimited,
  };
}

/**
 * Aynı anda kaç sayfa okunuyor (fotoğraf yolu).
 * The PDF OCR pool adapts its own concurrency in pdf-ingestion.
 */
const PAGE_CONCURRENCY = 24;

export type ImagePagesResult = {
  /** Sayfa sırasına göre metin; okunamayan sayfa boş string. */
  pages: string[];
  /** Gerçekten okunabilen sayfa sayısı — kota bu kadarını yakıyor. */
  readCount: number;
  tokensIn: number;
  tokensOut: number;
  /** Bir sayfa bile denetimden geçemediyse belgenin tamamı reddediliyor. */
  blocked: boolean;
};

/**
 * Birden çok görüntüyü sırayla değil, kümeler hâlinde okur.
 *
 * Okunamayan sayfa belgeyi düşürmüyor: taranmış bir kitabın boş arka yüzü ya
 * da tek bir bulanık sayfa yüzünden yüz sayfalık bir kaynağı reddetmek yanlış
 * olurdu. Çağıran taraf `readCount` sıfırsa vazgeçiyor.
 */
export async function extractImagePages(
  images: Buffer[],
  mimeType = "image/png",
  options?: { deadlineMs?: number },
): Promise<ImagePagesResult> {
  const pages: string[] = new Array(images.length).fill("");
  let readCount = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let blocked = false;

  for (let start = 0; start < images.length; start += PAGE_CONCURRENCY) {
    const wave = images.slice(start, start + PAGE_CONCURRENCY);
    // Per-page extractImageText keeps moderation.
    const results = await Promise.all(
      wave.map((image) => extractImageText(image, mimeType, options)),
    );

    results.forEach((result, offset) => {
      tokensIn += result.tokensIn;
      tokensOut += result.tokensOut;
      if (result.reason === "blocked") blocked = true;
      if (result.ok && result.pages[0]) {
        pages[start + offset] = result.pages[0];
        readCount += 1;
      }
    });

    if (blocked) break;
  }

  return { pages, readCount, tokensIn, tokensOut, blocked };
}
