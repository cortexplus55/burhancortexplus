import { z } from "zod";

/**
 * Anlatarak öğrenme — anlatımın değerlendirilmesi.
 *
 * Buranın işi not vermek değil. Bir konuyu ezberleyen öğrenci de doğru
 * cümleler kurabilir; ezberi anlamadan ayıran şey, cümlelerin arasındaki
 * bağların olup olmadığı. Bu yüzden model "kaç puan" değil, üç ayrı şey
 * söylüyor: yanlış olan, hiç değinilmeyen ve ezber kokan yerler.
 *
 * Sonda tek bir soru var. Anlatımı okuyup "güzel olmuş" demek öğrenciye
 * hiçbir şey öğretmez; asıl sınav, anlattığını başka bir açıdan sorulunca
 * hâlâ kurabilmek.
 */

export const explainVerdicts = ["anladin", "kismen", "ezber"] as const;
export type ExplainVerdict = (typeof explainVerdicts)[number];

export const explainSchema = z.object({
  verdict: z.enum(explainVerdicts),
  summary: z.string().min(1),
  /** Anlatımda yanlış ya da eksik kalan noktalar. */
  gaps: z
    .array(z.object({ point: z.string().min(1), why: z.string().min(1) }))
    .default([]),
  /** Hiç değinilmemiş ama konunun kalbinde olan başlıklar. */
  missed: z.array(z.string()).default([]),
  /** Anlaşıldığını sınayan tek soru. */
  followUp: z.string().min(1),
});

export type ExplainReview = z.infer<typeof explainSchema>;

export const VERDICT_LABEL: Record<ExplainVerdict, string> = {
  anladin: "Anlamışsın",
  kismen: "Kısmen anlamışsın",
  ezber: "Ezber gibi duruyor",
};

export const VERDICT_HINT: Record<ExplainVerdict, string> = {
  anladin:
    "Bağları kurmuşsun, kendi cümlelerinle anlatmışsın. Aşağıdaki soruyu da yanıtlayabiliyorsan bu konu tamam.",
  kismen:
    "Doğru parçalar var ama aralarındaki bağ zayıf. Aşağıdaki eksiklere bakıp bir kez daha anlatmayı dene.",
  ezber:
    "Cümleler doğru ama tanımların tekrarı gibi. Ezber, soru biraz değişince çöker — konuyu kendi kelimelerinle yeniden kurmayı dene.",
};

/** Anlatım için en az kelime. Altında değerlendirilecek bir şey yok. */
export const MIN_WORDS = 15;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isLongEnough(text: string): boolean {
  return wordCount(text) >= MIN_WORDS;
}

export function buildExplainPrompt(topic: string, explanation: string): string {
  return [
    `Konu: ${topic}`,
    "",
    "Öğrencinin kendi anlatımı:",
    `"""${explanation}"""`,
    "",
    "Bu anlatımı değerlendir. Kurallar:",
    "- Not verme, puan verme. Amaç öğrencinin neyi anlamadığını göstermek.",
    "- `gaps`: anlatımdaki yanlış ya da yarım kalan noktalar. Her biri için `point` (anlatımdan alıntı ya da özet) ve `why` (neden eksik) yaz.",
    "- `missed`: hiç değinmediği ama konunun kalbinde olan başlıklar. En fazla 4 tane, kısa.",
    "- `verdict`: kendi cümleleriyle bağ kurmuşsa \"anladin\"; parçalar doğru ama bağ zayıfsa \"kismen\"; tanım tekrarı gibiyse \"ezber\".",
    "- `followUp`: anlattığı şeyi başka bir açıdan sınayan TEK soru. Anlatımda geçen bir cümleyi tekrar sordurma.",
    "- Türkçe yaz, kısa ve doğrudan konuş. Övgü cümlesi kurma.",
    // Ürünün tamamı öğrenciye \"sen\" diye hitap ediyor; model kendi başına
    // \"siz\"e kayıyordu ve tek ekranda iki farklı ses duyuluyordu.
    "- Öğrenciye \"sen\" diye hitap et, \"siz\" kullanma.",
  ].join("\n");
}

export const EXPLAIN_SCHEMA_HINT =
  'JSON: {"verdict":"anladin"|"kismen"|"ezber","summary":string,"gaps":[{"point":string,"why":string}],"missed":string[],"followUp":string}';
