import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { moderate } from "@/lib/ai/moderation";
import { isReasoningModel } from "@/lib/ai/model-params";
import { contentModel } from "@/lib/ai/model-router";
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

/*
  Şık kuralı (20 Ekim 2026): işaretli test fotoğrafında iki sütunlu şıklar sütun sütun okunup
  yeniden harflendiriliyordu. Kâğıttaki "doğrusu C" başka bir şıkka bağlandı ve derse giden
  bilgi yanlışlandı ("CO₂'nin %70'i karbaminohemoglobinle taşınır"). Testte harf anlamın
  kendisi: şık kendi harfiyle kalır, öğrencinin işareti de yazılır.
*/
const PROMPT = [
  "Bu görseldeki tüm yazıyı olduğu gibi yaz.",
  "Soruyu ÇÖZME, yorumlama, özetleme; yalnızca gördüğün metni aktar.",
  "Kelimeleri değiştirme ya da düzeltme; yazım hatası varsa da olduğu gibi bırak.",
  "Satır ve paragraf düzenini koru. Şıkları ayrı satırlara yaz.",
  "Şıklar iki ya da üç sütun hâlinde dizilmiş olabilir: her şıkkı kâğıtta yanında basılı olan harfle yaz ve harf sırasıyla (A, B, C, D, E) sırala; şık atlama, harfleri yeniden dağıtma.",
  "Kâğıttaki işaretleri de aktar: daire içine alınmış, karalanmış ya da tiklenmiş şıkkın sonuna (işaretli) yaz; el yazısıyla eklenmiş notları ve düzeltmeleri bulundukları yere olduğu gibi yaz.",
  "Matematiksel ifadeleri LaTeX ile yaz; kimyasal formülleri ve birimleri (CO₂, H₂O, Na⁺, mmHg) LaTeX'e çevirmeden olduğu gibi yaz.",
  "El yazısını da oku.",
  "Markdown, kod bloğu veya ``` kullanma; düz metin yaz.",
  `Görselde okunacak hiçbir yazı yoksa yalnızca ${NO_TEXT} yaz.`,
].join(" ");

/**
 * Slayt, Word resmi ve metin katmanı olan PDF sayfasındaki şekil.
 * Kısa koordinat listesi de geçerlidir; 40 karakter eşiği burada yok.
 */
export const FIGURE_READ_PROMPT = [
  "Bu görsel bir ders sayfası, slayt veya şekildir.",
  "Gördüğün yazıyı aktar.",
  "Bu sayfadaki tüm grafiklerin eksen kesişimlerini, f(x) ve g(x) gibi fonksiyonların işaretli tüm (x, y) koordinat çiftlerini, küme eşleme oklarını (1 → b gibi), şema ve harita etiketlerini ve tablo sayılarını tek tek, hatasız listele.",
  "Görmediğin sayıyı, noktayı veya oku yazma.",
  "Şekil görünmüyor, görünmediği için belirlenemez, sayı uydurma gibi cümle yazma.",
  "Markdown, kod bloğu veya ``` kullanma; düz metin yaz.",
  `Okunacak hiçbir yazı, sayı veya etiket yoksa yalnızca ${NO_TEXT} yaz.`,
].join(" ");

export const FIGURE_APPENDIX_LABEL = "Şekilde işaretli değerler:";

/** Şekil okumasından mazeret cümlesini düşürür. Değer kalmazsa boş döner. */
export function figureTranscript(raw: string): string | null {
  const cleaned = cleanOcrPageText(raw);
  if (!cleaned || isNoTextOcrResponse(cleaned)) return null;
  const kept = cleaned
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/görünmediği için|burada görünmedi/i.test(sentence))
    .join("\n")
    .trim();
  if (!kept || isNoTextOcrResponse(kept)) return null;
  return kept;
}

/** Metin katmanının sonuna şekil okumasını ekler. Boş okuma sayfayı değiştirmez. */
export function appendFigureTranscript(page: string, transcript: string | null | undefined): string {
  const body = transcript?.trim() ?? "";
  if (!body) return page;
  const block = `${FIGURE_APPENDIX_LABEL}\n${body}`;
  const base = page.trim();
  return base ? `${base}\n\n${block}` : block;
}

type Attempt = { text: string | null; tokensIn: number; tokensOut: number; rateLimited: boolean };

/** Bir modelin harcadığı jetonlar; kullanım kaydı model başına bir satır. */
export type ModelUsage = { model: string; tokensIn: number; tokensOut: number };

/** Aynı modelin jetonlarını toplar. */
export function mergeUsage(...lists: ModelUsage[][]): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>();
  for (const entry of lists.flat()) {
    const row = byModel.get(entry.model) ?? { model: entry.model, tokensIn: 0, tokensOut: 0 };
    row.tokensIn += entry.tokensIn;
    row.tokensOut += entry.tokensOut;
    byModel.set(entry.model, row);
  }
  return [...byModel.values()];
}

function usageTotals(usage: ModelUsage[]): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn: usage.reduce((sum, entry) => sum + entry.tokensIn, 0),
    tokensOut: usage.reduce((sum, entry) => sum + entry.tokensOut, 0),
  };
}

/**
 * Fotoğrafı hangi model, hangi sırayla okur: önce asıl model (luna), okuyamazsa güçlü model.
 *
 * 20 Ekim 2026'ya kadar önce gpt-4o-mini okuyordu ("önce ucuz model"). İki ölçüm bunu bitirdi:
 * - Bedel: mini yüksek ayrıntılı bir fotoğrafı ~25.500 girdi jetonu sayıyor (sınav setinin 15
 *   okuması, ~$0,0038); luna'da fotoğraflı bir istek ~1.050 girdi jetonu (~$0,0003, çıktı
 *   dahil). Fotoğrafta ucuz olan artık luna.
 * - Doğruluk: işaretli test fotoğrafının üç okumasının üçünde mini iki sütunlu şıkları yeniden
 *   harflendirdi ve son şıkları düşürdü.
 * Aynı ad iki kez yazılmışsa (yanlış yapılandırma) model bir kez çağrılır.
 */
export function imageReadLadder(): string[] {
  const models = [contentModel(), env.OPENAI_ADVANCED_MODEL].map((model) => model?.trim() ?? "");
  return [...new Set(models.filter(Boolean))];
}

/** Belge başına bu kadar taranmış sayfa luna + yüksek ayrıntı. Sonrası tek hızlı model. */
export const SCAN_LUNA_PAGE_CAP = 40;

/** Sayfa 40'tan sonraysa merdiven tek modele iner; sayfa yine okunur. */
export function imageReadLadderForScan(pageNumber: number): string[] {
  if (!Number.isFinite(pageNumber) || pageNumber <= SCAN_LUNA_PAGE_CAP) return imageReadLadder();
  const fast = env.OPENAI_ADVANCED_MODEL?.trim() || contentModel();
  return fast ? [fast] : imageReadLadder();
}

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
  prompt: string,
  accept: (raw: string) => string | null,
): Promise<Attempt> {
  let rateLimited = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const remaining = deadlineMs - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    try {
      const completion = await openai.chat.completions.create(
        {
          model,
          // Akıl yürüten model düşük çabayla okur: iş aktarmak, çözmek değil.
          ...(isReasoningModel(model) ? { reasoning_effort: "low" as const } : {}),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
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
      return { text: accept(raw), tokensIn, tokensOut, rateLimited };
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
   * İlk model okuyamayıp ikinciye çıktığımızda faturaya iki çağrı da
   * yazılıyor. Yalnızca başarılı olanı kaydetmek, kademeli okumanın gerçek
   * bedelini gizlerdi. `usage` aynı jetonları model model taşır; kayıt
   * oradan yazılır.
   */
  tokensIn: number;
  tokensOut: number;
  usage: ModelUsage[];
  reason?: "not_configured" | "too_large" | "unreadable" | "blocked";
  /** The provider answered 429 at least once — the OCR pool slows down. */
  rateLimited?: boolean;
};

/**
 * Bir fotoğraf bir sayfa. Sıra `imageReadLadder`: ikinci modele ancak ilki
 * OKUYAMADIĞINDA çıkılır.
 *
 * İkisi de okuyamazsa `ok: false`; çağıran taraf kotayı geri veriyor.
 * Okunamayan fotoğraf öğrencinin hakkını yakmamalı.
 */
export async function extractImageText(
  buffer: Buffer,
  mimeType: string,
  options?: { deadlineMs?: number; scanOrdinal?: number; purpose?: "page" | "figure" },
): Promise<ImageReadResult> {
  const empty = { pages: [], ok: false as const, model: null, tokensIn: 0, tokensOut: 0, usage: [] };
  if (!env.OPENAI_API_KEY) return { ...empty, reason: "not_configured" };
  if (buffer.byteLength > MAX_IMAGE_BYTES) return { ...empty, reason: "too_large" };

  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  /*
    Görsel denetimden geçiyor.

    `/api/ai/solve` bunu zaten yapıyor ve gerekçesi burada da geçerli:
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

  const ladder = imageReadLadderForScan(options?.scanOrdinal ?? 1);
  const usage: ModelUsage[] = [];
  let rateLimited = false;

  for (let i = 0; i < ladder.length; i += 1) {
    const model = ladder[i]!;
    // Skip expensive fallback when the step deadline is near.
    if (i > 0 && Date.now() + 25_000 >= pageDeadlineMs) break;
    if (Date.now() >= pageDeadlineMs) break;
    const purpose = options?.purpose ?? "page";
    const attempt = await readWith(
      openai,
      model,
      dataUrl,
      pageDeadlineMs,
      purpose === "figure" ? FIGURE_READ_PROMPT : PROMPT,
      (raw) => {
        if (purpose === "figure") return figureTranscript(raw);
        const cleaned = cleanOcrPageText(raw);
        return isUsableOcrText(cleaned) ? cleaned : null;
      },
    );
    if (attempt.tokensIn || attempt.tokensOut) {
      usage.push({ model, tokensIn: attempt.tokensIn, tokensOut: attempt.tokensOut });
    }
    rateLimited ||= attempt.rateLimited;
    if (attempt.text) {
      return { pages: [attempt.text], ok: true, model, ...usageTotals(usage), usage, rateLimited };
    }
  }

  return {
    pages: [],
    ok: false,
    model: null,
    ...usageTotals(usage),
    usage,
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
  usage: ModelUsage[];
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
  options?: { deadlineMs?: number; scanOrdinals?: number[] },
): Promise<ImagePagesResult> {
  const pages: string[] = new Array(images.length).fill("");
  let readCount = 0;
  let usage: ModelUsage[] = [];
  let blocked = false;

  for (let start = 0; start < images.length; start += PAGE_CONCURRENCY) {
    const wave = images.slice(start, start + PAGE_CONCURRENCY);
    // Per-page extractImageText keeps moderation.
    const results = await Promise.all(
      wave.map((image, offset) =>
        extractImageText(image, mimeType, {
          deadlineMs: options?.deadlineMs,
          scanOrdinal: options?.scanOrdinals?.[start + offset] ?? start + offset + 1,
        }),
      ),
    );

    results.forEach((result, offset) => {
      usage = mergeUsage(usage, result.usage);
      if (result.reason === "blocked") blocked = true;
      if (result.ok && result.pages[0]) {
        pages[start + offset] = result.pages[0];
        readCount += 1;
      }
    });

    if (blocked) break;
  }

  return { pages, readCount, ...usageTotals(usage), usage, blocked };
}
