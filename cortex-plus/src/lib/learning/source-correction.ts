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
 * - İddia ile doğrusu farklı olmalı; uzunluklar sınırlı; tek uyarı.
 */
import { z } from "zod";
import type { FormulaTypo } from "@/lib/learning/formula-typos";

export type SourceCorrectionWarning = {
  /** Kaynakta yazan (yanlış) ifade, kaynaktaki haliyle. */
  documentClaim: string;
  /** Doğrulanmış doğru bilgi. */
  verifiedTruth: string;
  /** Neden yanlış olduğunun kısa, nazik açıklaması. */
  explanation: string;
};

export const SOURCE_CORRECTION_LIMITS = { claim: 240, truth: 240, explanation: 420, minClaim: 6 } as const;

/** Uyarının geçerli olduğu alanlar: doğrulanabilir, evrensel bilgi. Öbür alanlarda kaynak haklıdır. */
export const SOURCE_CORRECTION_DOMAINS = ["fizik", "kimya", "biyoloji", "matematik", "astronomi", "yer_bilimi"] as const;

export const sourceCorrectionWarningSchema = z.object({
  documentClaim: z.string().min(1).max(SOURCE_CORRECTION_LIMITS.claim),
  verifiedTruth: z.string().min(1).max(SOURCE_CORRECTION_LIMITS.truth),
  explanation: z.string().max(SOURCE_CORRECTION_LIMITS.explanation),
});

/** Öğrencinin gördüğü kartın başlığı (iç kod adı değil). */
export const SOURCE_CORRECTION_TITLE = "Kaynağında düzeltilmesi gereken bir bilgi var";

/** Karşılaştırma biçimi: harf, rakam ve matematik işaretleri; boşluk ve noktalama düşer. */
export function correctionKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\s.,;:!?'"’‘“”«»()[\]{}]+/gu, "");
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Kayıttan, ağdan ya da istemciden gelen değeri güvenle okur; bozuksa null. */
export function readSourceCorrectionWarning(value: unknown): SourceCorrectionWarning | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const documentClaim = clean(row.documentClaim, SOURCE_CORRECTION_LIMITS.claim);
  const verifiedTruth = clean(row.verifiedTruth, SOURCE_CORRECTION_LIMITS.truth);
  const explanation = clean(row.explanation, SOURCE_CORRECTION_LIMITS.explanation);
  if (!documentClaim || !verifiedTruth) return null;
  if (correctionKey(documentClaim) === correctionKey(verifiedTruth)) return null;
  return { documentClaim, verifiedTruth, explanation };
}

/**
 * Not denetiminin yanıtındaki `correction` alanı → uyarı. Geçmeyen her durumda null (uyarı yok, ders bugünkü gibi).
 */
export function readModelSourceCorrection(raw: unknown, sourceText: string): SourceCorrectionWarning | null {
  if (!raw || typeof raw !== "object") return null;
  const item = (raw as { correction?: unknown }).correction;
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (typeof row.confidence !== "string" || !/^y[uü]ksek$/i.test(row.confidence.trim())) return null;
  const domain = typeof row.domain === "string" ? row.domain.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, "_") : "";
  if (!(SOURCE_CORRECTION_DOMAINS as readonly string[]).includes(domain)) return null;
  const warning = readSourceCorrectionWarning(row);
  if (!warning) return null;
  const claim = correctionKey(warning.documentClaim);
  if (claim.length < SOURCE_CORRECTION_LIMITS.minClaim) return null;
  if (!correctionKey(sourceText).includes(claim)) return null;
  // Doğrusu kaynakta da aynen yazıyorsa iddia kaynağın kendi "yanlış" örneği olabilir: uyarı yok.
  if (correctionKey(sourceText).includes(correctionKey(warning.verifiedTruth))) return null;
  return warning;
}

/** Not denetiminin istemine eklenen görev (aynı çağrı, ek çağrı yok). */
export const SOURCE_CORRECTION_TASK =
  "İKİNCİ GÖREV (kaynak düzeltmesi): Notta doğa bilimleri ya da matematikte (fizik, kimya, biyoloji, matematik, " +
  "astronomi, yer bilimi) herkesin doğrulayabileceği, AÇIK bir bilimsel hata var mı? Yanlış yazılmış temel yasa, " +
  "evrensel sabit, tanım ya da yerleşik bilimsel olgu olabilir. Varsa en belirgin TEK hatayı bildir. Tartışmalı, " +
  "yoruma açık, yaklaşık, güncel değişebilen bilgi; eşik, tarih, hukuk, tıp, yönetmelik, sınıflandırma ve kitaba özgü " +
  "gösterim ASLA bildirilmez. Notun kendisinin 'yanlış' dediği ifade de bildirilmez. Emin değilsen null döndür. " +
  '"correction": {"documentClaim": "notta geçen yanlış ifade, harfi harfine", "verifiedTruth": "doğrusu, tek cümle", ' +
  '"explanation": "neden yanlış olduğu, öğrenciye nazik 1-2 cümle", "domain": "fizik" | "kimya" | "biyoloji" | ' +
  '"matematik" | "astronomi" | "yer_bilimi", "confidence": "yuksek" | "orta" | "dusuk"} ya da "correction": null.';

/**
 * Yazarlara (ders, test, kart, D/Y, podcast, video, "Farklı anlat") giden tek blok; uyarı yoksa boş.
 */
export function sourceCorrectionPromptBlock(warning: SourceCorrectionWarning | null | undefined): string {
  if (!warning) return "";
  return (
    `KAYNAK DÜZELTMESİ (kesin): Kaynakta «${warning.documentClaim}» yazıyor; bu bilimsel olarak yanlış. Doğrusu: ` +
    `«${warning.verifiedTruth}». Anlatımda, özette, kartlarda ve bütün soru / Doğru-Yanlış cevap anahtarlarında yalnız ` +
    "doğrusunu kullan. Yanlış ifadeyi doğru bilgi gibi yazma; doğru şık, doğru önerme ya da kart cevabı yapma. Uyarı " +
    "kartını sen yazma, ekranda ayrıca gösteriliyor."
  );
}

/** Ders içi kavram denetiminin (lesson-sanity) okuduğu biçim: yanlış → doğru. */
export function correctionAsNoteWarning(warning: SourceCorrectionWarning): FormulaTypo {
  return { id: "source_correction", found: warning.documentClaim, standard: warning.verifiedTruth };
}

/** Metin kaynağın yanlış iddiasını taşıyor ve doğrusunu taşımıyor mu (anahtar bekçisi). */
export function repeatsSourceError(text: string, warning: SourceCorrectionWarning | null | undefined): boolean {
  if (!warning || !text.trim()) return false;
  const key = correctionKey(text);
  const claim = correctionKey(warning.documentClaim);
  if (claim.length < SOURCE_CORRECTION_LIMITS.minClaim || !key.includes(claim)) return false;
  return !key.includes(correctionKey(warning.verifiedTruth));
}

export const SOURCE_CORRECTION_ISSUE = "Kaynak düzeltmesi: doğru cevap kaynağın yanlış bilgisini taşıyor";

/** Çoktan seçmeli soru: doğru işaretli şık kaynağın yanlışını taşıyorsa sorun. */
export function quizKeyRepeatsSourceError(
  question: { correct: readonly string[] },
  warning: SourceCorrectionWarning | null | undefined,
): string | null {
  return question.correct.some((option) => repeatsSourceError(option, warning)) ? `${SOURCE_CORRECTION_ISSUE}.` : null;
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
