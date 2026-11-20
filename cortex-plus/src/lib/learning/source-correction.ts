/**
 * Kaynak düzeltme uyarısı (19 Kasım 2026, Faz 1-A §2.1) — ders bağımsız, saf modül.
 *
 * Öğrencinin kaynağında AÇIK ve doğrulanabilir bir bilimsel hata varsa (doğa bilimleri ve matematik: yanlış yazılmış
 * temel yasa, sabit, tanım bağıntısı ya da yerleşik olgu) ünite bir `sourceCorrectionWarning` taşır:
 * `{ documentClaim, verifiedTruth, explanation }`. 1. adımda "Kaynak Düzeltme Uyarısı" kartı çizilir; sonraki bütün
 * adımlar, "Farklı anlat", Sınav Sabahı Kağıdı, özet ve bütün test / Doğru-Yanlış anahtarları `verifiedTruth`'u kullanır.
 *
 * Yanlış alarmı düşük tutan kurallar (kod tarafı, `readModelSourceCorrection`):
 * - Ek model çağrısı yok: mevcut paralel not denetiminin (`note-rule-check-run.ts`) aynı yanıtında gelir.
 * - Model kesinliği "yuksek" ve alan doğa bilimleri / matematik olmalı (hukuk, tarih, tıp, yönetmelik, eşik vb. ASLA).
 * - `documentClaim` kaynakta birebir geçmeli (boşluk ve noktalama farkı hariç); model kaynağın söylemediğini uyduramaz.
 * - İddia ile doğrusu farklı olmalı; uzunluklar sınırlı.
 *
 * Ek düzeltme (19 Kasım 2026, Faz 1-A §2.1 canlı bulgu): aynı belgede birden fazla bariz hata olunca denetim yalnız
 * birini bildiriyordu; öbürü (sözel yazılmış bir orantı kuralı) dersin tamamına yanlış öğretildi. Artık belgedeki
 * bütün bariz hatalar (en çok `SOURCE_CORRECTION_MAX`) döner: ilk hata alanların bugünkü yerinde, kalanlar `others`
 * içinde (kayıt biçimi geriye uyumlu). Sözel kurallar ("X artarsa Y azalır") da aranır; bekçi aynı ilişkiyi başka
 * sözcüklerle tekrarlayan cümleyi de yakalar (`relation-text.ts`).
 */
import { z } from "zod";
import type { FormulaTypo } from "@/lib/learning/formula-typos";
import { quotesOrDenies, relationClaimOf, sentenceRelation, sentences } from "@/lib/learning/relation-text";

export type SourceCorrectionItem = {
  /** Kaynakta yazan (yanlış) ifade, kaynaktaki haliyle. */
  documentClaim: string;
  /** Doğrulanmış doğru bilgi. */
  verifiedTruth: string;
  /** Neden yanlış olduğunun kısa, nazik açıklaması. */
  explanation: string;
};

/** İlk hata alanların bugünkü yerinde; aynı belgedeki öbür bariz hatalar `others` içinde. */
export type SourceCorrectionWarning = SourceCorrectionItem & { others?: SourceCorrectionItem[] };

/** Bir belgeden dönen en çok düzeltme sayısı. */
export const SOURCE_CORRECTION_MAX = 6;

/** Uyarının bütün düzeltmeleri (ilk + öbürleri). */
export function allCorrections(warning: SourceCorrectionWarning | null | undefined): SourceCorrectionItem[] {
  if (!warning) return [];
  const { others, ...first } = warning;
  return [first, ...(others ?? [])];
}

export const SOURCE_CORRECTION_LIMITS = { claim: 240, truth: 240, explanation: 420, minClaim: 6 } as const;

/** Uyarının geçerli olduğu alanlar: doğrulanabilir, evrensel bilgi. Öbür alanlarda kaynak haklıdır. */
export const SOURCE_CORRECTION_DOMAINS = ["fizik", "kimya", "biyoloji", "matematik", "astronomi", "yer_bilimi"] as const;

const sourceCorrectionItemSchema = z.object({
  documentClaim: z.string().min(1).max(SOURCE_CORRECTION_LIMITS.claim),
  verifiedTruth: z.string().min(1).max(SOURCE_CORRECTION_LIMITS.truth),
  explanation: z.string().max(SOURCE_CORRECTION_LIMITS.explanation),
});

export const sourceCorrectionWarningSchema = sourceCorrectionItemSchema.extend({
  others: z.array(sourceCorrectionItemSchema).max(SOURCE_CORRECTION_MAX - 1).optional().catch(undefined),
});

/** Öğrencinin gördüğü kartın başlığı (iç kod adı değil). */
export const SOURCE_CORRECTION_TITLE = "Kaynağında düzeltilmesi gereken bir bilgi var";

/**
 * Karşılaştırma biçimi: harf, rakam ve matematik işaretleri; boşluk ve noktalama düşer. Gösterim farkları tek biçime
 * iner (Faz 1-A §2.1): çarpma işaretleri (· × ∙ ⋅ * ve sayılar/harfler arası "x" değil) "*", bölme (÷ ∕) "/", eksi
 * türleri "-", alt çizgi ve süslü alt simge ayraçları düşer, Unicode alt/üst simge rakamları düz rakama iner.
 */
export function correctionKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/[·×∙⋅•*]/g, "*")
    .replace(/[÷∕]/g, "/")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\s.,;:!?'"’‘“”«»()[\]{}_]+/gu, "");
}

/** Eşittir işaretinin iki yanı: sol terim ve işlem işaretleriyle bağlı sağ taraf (cümledeki ilk boşluklu sözcükte biter). */
const FORMULA_PATTERN =
  /[\p{L}\p{N}_]+(?:\s*[=]\s*[(\p{L}\p{N}_][\p{L}\p{N}_()^]*(?:\s*[·×∙⋅•*/÷∕+\-−^]\s*[(\p{L}\p{N}_][\p{L}\p{N}_()^]*)*)/gu;

/**
 * Metindeki formüller (`F = V · d_cisim · g` gibi), karşılaştırma biçiminde. İddia ya da doğru cümle içinde geçse de
 * formül ayrıca çıkar; bekçi cümlenin tamamını değil formülü arar. Eşittir yoksa boş.
 */
export function formulaKeys(value: string): string[] {
  const out: string[] = [];
  for (const match of value.normalize("NFKC").matchAll(FORMULA_PATTERN)) {
    if (!match[0].includes("=")) continue;
    const key = correctionKey(match[0]);
    if (key.length >= SOURCE_CORRECTION_LIMITS.minClaim && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Bir iddianın aranacak biçimleri: bütün cümle ve içindeki formüller. */
function claimKeys(value: string): string[] {
  const whole = correctionKey(value);
  return [...new Set([whole, ...formulaKeys(value)])].filter((key) => key.length >= SOURCE_CORRECTION_LIMITS.minClaim);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function readItem(value: unknown): SourceCorrectionItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const documentClaim = clean(row.documentClaim, SOURCE_CORRECTION_LIMITS.claim);
  const verifiedTruth = clean(row.verifiedTruth, SOURCE_CORRECTION_LIMITS.truth);
  const explanation = clean(row.explanation, SOURCE_CORRECTION_LIMITS.explanation);
  if (!documentClaim || !verifiedTruth) return null;
  if (correctionKey(documentClaim) === correctionKey(verifiedTruth)) return null;
  return { documentClaim, verifiedTruth, explanation };
}

/** Düzeltmeleri tek uyarıda birleştirir (aynı iddia bir kez); boşsa null. */
export function combineCorrections(items: readonly (SourceCorrectionItem | null | undefined)[]): SourceCorrectionWarning | null {
  const unique: SourceCorrectionItem[] = [];
  for (const item of items) {
    if (!item || unique.some((seen) => correctionKey(seen.documentClaim) === correctionKey(item.documentClaim))) continue;
    unique.push(item);
  }
  const [first, ...others] = unique.slice(0, SOURCE_CORRECTION_MAX);
  if (!first) return null;
  return others.length ? { ...first, others } : first;
}

/** Kayıttan, ağdan ya da istemciden gelen değeri güvenle okur; bozuksa null. Eski tek uyarılı kayıt aynen okunur. */
export function readSourceCorrectionWarning(value: unknown): SourceCorrectionWarning | null {
  const first = readItem(value);
  if (!first) return null;
  const others = (value as { others?: unknown }).others;
  return combineCorrections([first, ...(Array.isArray(others) ? others.map(readItem) : [])]);
}

/**
 * Not denetiminin yanıtındaki `corrections` dizisi (eski biçim: tek `correction`) → uyarı. Her öğe ayrı denetlenir;
 * geçmeyen atılır. Hiçbiri geçmezse null (uyarı yok, ders bugünkü gibi).
 */
export function readModelSourceCorrection(raw: unknown, sourceText: string): SourceCorrectionWarning | null {
  if (!raw || typeof raw !== "object") return null;
  const bag = raw as { corrections?: unknown; correction?: unknown };
  const list = Array.isArray(bag.corrections) ? bag.corrections : bag.correction ? [bag.correction] : [];
  return combineCorrections(list.slice(0, SOURCE_CORRECTION_MAX * 2).map((item) => readModelItem(item, sourceText)));
}

function readModelItem(item: unknown, sourceText: string): SourceCorrectionItem | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (typeof row.confidence !== "string" || !/^y[uü]ksek$/i.test(row.confidence.trim())) return null;
  const domain = typeof row.domain === "string" ? row.domain.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, "_") : "";
  if (!(SOURCE_CORRECTION_DOMAINS as readonly string[]).includes(domain)) return null;
  const warning = readItem(row);
  if (!warning) return null;
  const claim = correctionKey(warning.documentClaim);
  if (claim.length < SOURCE_CORRECTION_LIMITS.minClaim) return null;
  if (!correctionKey(sourceText).includes(claim)) return null;
  // Doğrusu kaynakta da aynen yazıyorsa iddia kaynağın kendi "yanlış" örneği olabilir: uyarı yok.
  if (correctionKey(sourceText).includes(correctionKey(warning.verifiedTruth))) return null;
  // Sözel kural: iddia ve doğrusu aynı iki büyüklük için aynı ilişkiyi söylüyorsa düzeltme yok demektir.
  const said = relationClaimOf(warning.documentClaim);
  const truth = relationClaimOf(warning.verifiedTruth);
  if (said && truth && sentenceRelation(warning.verifiedTruth, said.a, said.b) === said.relation) return null;
  return warning;
}

/** Not denetiminin istemine eklenen görev (aynı çağrı, ek çağrı yok). */
export const SOURCE_CORRECTION_TASK =
  "İKİNCİ GÖREV (kaynak düzeltmesi): Notu baştan sona tara; doğa bilimleri ya da matematikte (fizik, kimya, biyoloji, " +
  "matematik, astronomi, yer bilimi) herkesin doğrulayabileceği AÇIK bilimsel hataların HEPSİNİ bildir (en çok " +
  `${SOURCE_CORRECTION_MAX}; bir hatayı bulunca durma, notun geri kalanını da oku). Yanlış yazılmış temel yasa, evrensel ` +
  "sabit, tanım, yerleşik bilimsel olgu ya da SÖZLE yazılmış temel kural olabilir: orantının yönü (doğru/ters), bir " +
  "büyüklük artınca öbürünün artması ya da azalması, kat ilişkisi (iki katına çıkar / yarıya iner). Sözel kuralda " +
  "verifiedTruth aynı büyüklükleri aynı sözcüklerle anar ve doğru ilişkiyi söyler. Tartışmalı, yoruma açık, yaklaşık, " +
  "güncel değişebilen bilgi; eşik, tarih, hukuk, tıp, yönetmelik, sınıflandırma ve kitaba özgü gösterim ASLA " +
  "bildirilmez. Notun kendisinin 'yanlış' dediği ifade de bildirilmez. Emin olmadığın öğeyi koyma; hata yoksa boş dizi. " +
  '"corrections": [{"documentClaim": "notta geçen yanlış ifade, harfi harfine", "verifiedTruth": "doğrusu, tek cümle", ' +
  '"explanation": "neden yanlış olduğu, öğrenciye nazik 1-2 cümle", "domain": "fizik" | "kimya" | "biyoloji" | ' +
  '"matematik" | "astronomi" | "yer_bilimi", "confidence": "yuksek" | "orta" | "dusuk"}] ya da "corrections": [].';

/**
 * Yazarlara (ders, test, kart, D/Y, podcast, video, "Farklı anlat") giden tek blok; uyarı yoksa boş.
 */
export function sourceCorrectionPromptBlock(warning: SourceCorrectionWarning | null | undefined): string {
  const items = allCorrections(warning);
  if (!items.length) return "";
  const lines = items.map((item) => `Kaynakta «${item.documentClaim}» yazıyor; bu bilimsel olarak yanlış. Doğrusu: «${item.verifiedTruth}».`);
  return (
    `KAYNAK DÜZELTMESİ (kesin${items.length > 1 ? `, ${items.length} hata` : ""}): ${lines.join(" ")} Anlatımda, özette, ` +
    "şema ve karşılaştırma kartlarında, sık yapılan hata (commonMistake) alanında ve bütün soru / Doğru-Yanlış cevap " +
    "anahtarlarında yalnız doğrusunu kullan; aynı yanlışı başka sözcüklerle de yazma. Yanlış ifadeyi doğru bilgi gibi " +
    "yazma; doğru şık, doğru önerme ya da kart cevabı yapma; doğrusunu yanılgı diye gösterme. Uyarı kartını sen yazma, " +
    "ekranda ayrıca gösteriliyor."
  );
}

/** Ders içi kavram denetiminin (lesson-sanity) okuduğu biçim: yanlış → doğru. */
export function correctionAsNoteWarning(warning: SourceCorrectionItem): FormulaTypo {
  return { id: "source_correction", found: warning.documentClaim, standard: warning.verifiedTruth };
}

/** Bütün düzeltmeler kavram denetimi biçiminde. */
export function correctionsAsNoteWarnings(warning: SourceCorrectionWarning | null | undefined): FormulaTypo[] {
  return allCorrections(warning).map(correctionAsNoteWarning);
}

/**
 * Metin kaynağın yanlış iddiasını taşıyor ve doğrusunu taşımıyor mu (anahtar bekçisi). İddia ve doğru, bütün cümle
 * ya da içlerindeki formül olarak aranır; gösterim farkı (· / ×, alt çizgi, boşluk) sonucu değiştirmez.
 */
export function repeatsSourceError(text: string, warning: SourceCorrectionWarning | null | undefined): boolean {
  if (!warning || !text.trim()) return false;
  return allCorrections(warning).some((item) => repeatsItem(text, item) || repeatsRelation(text, item));
}

function repeatsItem(text: string, warning: SourceCorrectionItem): boolean {
  const key = correctionKey(text);
  const truths = claimKeys(warning.verifiedTruth);
  const claims = claimKeys(warning.documentClaim).filter((claim) => !truths.includes(claim));
  if (!claims.some((claim) => key.includes(claim))) return false;
  return !truths.some((truth) => key.includes(truth));
}

/**
 * Sözel kural başka sözcüklerle tekrarlanıyor mu: iddianın iki büyüklüğünü anan ve aynı (yanlış) ilişkiyi söyleyen
 * bir cümle. Yanlışı alıntılayan ya da reddeden cümle ("… değildir", "kaynakta … yazıyor") sayılmaz.
 */
function repeatsRelation(text: string, warning: SourceCorrectionItem): boolean {
  const said = relationClaimOf(warning.documentClaim);
  if (!said) return false;
  if (sentenceRelation(warning.verifiedTruth, said.a, said.b) === said.relation) return false;
  return sentences(text).some((sentence) => !quotesOrDenies(sentence) && sentenceRelation(sentence, said.a, said.b) === said.relation);
}

/**
 * Yanılgı alanı (ör. sık yapılan hata) doğrusunu yanılgı diye mi gösteriyor: düzeltmenin doğru ilişkisini söyleyen
 * cümle "öğrencinin hatası" olarak yazılmış. Yalnız sözel ilişkili düzeltmelerde bakılır.
 */
export function presentsTruthAsMistake(mistake: string, warning: SourceCorrectionWarning | null | undefined): boolean {
  if (!mistake.trim()) return false;
  return allCorrections(warning).some((item) => {
    const said = relationClaimOf(item.documentClaim);
    if (!said) return false;
    const truth = sentenceRelation(item.verifiedTruth, said.a, said.b);
    if (!truth || truth === said.relation) return false;
    return sentences(mistake).some((sentence) => sentenceRelation(sentence, said.a, said.b) === truth);
  });
}

export const SOURCE_CORRECTION_ISSUE = "Kaynak düzeltmesi: doğru cevap kaynağın yanlış bilgisini taşıyor";

/** Çoktan seçmeli soru: doğru işaretli şık kaynağın yanlışını taşıyorsa sorun. */
export function quizKeyRepeatsSourceError(
  question: { correct: readonly string[]; text?: string; explanation?: string },
  warning: SourceCorrectionWarning | null | undefined,
): string | null {
  // Sözel kuralda şık tek başına ilişkiyi söylemez ("İki katına çıkar."): soru kökü + doğru şık ve açıklama da okunur.
  const stem = question.text?.trim() ?? "";
  const keyed = question.correct.some((option) => repeatsSourceError(option, warning) || (stem && repeatsSourceError(`${stem} ${option}`.replace(/[?]\s*/g, " "), warning)));
  const explained = Boolean(question.explanation && repeatsSourceError(question.explanation, warning));
  return keyed || explained ? `${SOURCE_CORRECTION_ISSUE}.` : null;
}

/** Doğru/Yanlış önermesi: kaynağın yanlışı "Doğru" diye işaretlenmişse sorun. */
export function trueFalseKeyRepeatsSourceError(
  item: { text: string; correct: boolean },
  warning: SourceCorrectionWarning | null | undefined,
): boolean {
  return item.correct === true && repeatsSourceError(item.text, warning);
}

/** Kart: arka yüz kaynağın yanlışını taşıyorsa sorun. */
export function cardRepeatsSourceError(
  card: { back: string },
  warning: SourceCorrectionWarning | null | undefined,
): boolean {
  return repeatsSourceError(card.back, warning);
}

/**
 * Ders yazımı başlamadan önce kaynak düzeltme denetimini bekleme tavanı (19 Kasım 2026, Faz 1-A §2.1 canlı bulgu).
 * Paralel denetim ~6 sn'de döndü ama yazar uyarısız başladığı için ders ekranları kaynağın yanlış bağıntısını
 * öğretti. Denetim bu süre içinde biterse yazar, düzeltici ve denetçi doğrusunu baştan okur; bitmezse ders bugünkü
 * gibi sürer ve geç gelen uyarı kavram denetimine gider.
 */
export const SOURCE_CORRECTION_WAIT_MS = 12_000;

/** Söz verilen değer süre içinde gelirse o, gelmezse `undefined`; hata da `undefined` (ders hiçbir zaman düşmez). */
export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
