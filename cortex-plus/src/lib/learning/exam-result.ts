import { ADAPTIVE_KINDS, ADAPT_MIN_ITEMS } from "@/lib/learning/path-change";
import { whatsappShareHref } from "@/lib/learning/duel-share";

/**
 * Sınav sonrası başarı kartı (31 Ekim 2026, Paket J3 #14). Sınav günü geçince hazırlık sayfası notu sorar; öğrenci
 * yazınca başlangıç seviyesiyle karşılaştıran, paylaşılabilir kart çıkar. Not göçsüz `exam_preps.learning_preferences`
 * içinde durur (`examResult`, sınav saati gibi; `parseLearningPreferences` korur). "Notum henüz açıklanmadı" soruyu
 * üç gün erteler (`examResultSnoozedUntil`). Saf modül: istemci de okur.
 *
 * Başlangıç seviyesi (deterministik, kayıttan): önce hazırlığın tamamlanmış seviye tespiti (en az 3 soru), yoksa
 * yolda ilk tamamlanan puanlı adım (konu testi, doğru/yanlış, sözlü, soru-cevap; en az 3 soru — yolun kendini
 * ayarladığı adımlarla aynı küme, `ADAPTIVE_KINDS`). İkisi de yoksa başlangıç yazılmaz, yalnız not görünür.
 * Başlangıç not kaydedilirken donar: sonradan eklenen kayıt kartı değiştirmez.
 */

export const EXAM_RESULT_ASK = "Sınavın nasıl geçti? Notunu yaz";
export const EXAM_RESULT_LATER = "Notum henüz açıklanmadı";
export const EXAM_RESULT_SAVE = "Kartımı oluştur";
export const EXAM_RESULT_SNOOZE_DAYS = 3;

export type ExamBaselineSource = "level" | "first_test";
export type ExamBaseline = { pct: number; source: ExamBaselineSource };
export type StoredExamResult = { score: number; at: string; baselinePct: number | null; baselineSource: ExamBaselineSource | null };
export type ExamResultTrend = "up" | "same" | "down" | "none";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 0–100 tam sayı; değilse null. */
export function parseExamScore(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() ? Number(raw.trim().replace(",", ".")) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  return value >= 0 && value <= 100 ? value : null;
}

const pctOrNull = (raw: unknown): number | null =>
  typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw) : null;

export function parseStoredExamResult(raw: unknown): StoredExamResult | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const score = parseExamScore(row.score);
  if (score == null) return undefined;
  const at = typeof row.at === "string" && !Number.isNaN(Date.parse(row.at)) ? row.at : "";
  const baselinePct = pctOrNull(row.baselinePct);
  const baselineSource = row.baselineSource === "level" || row.baselineSource === "first_test" ? row.baselineSource : null;
  return { score, at, baselinePct, baselineSource: baselinePct == null ? null : baselineSource };
}

export function parseSnoozedUntil(raw: unknown): string | undefined {
  return typeof raw === "string" && DAY_RE.test(raw) ? raw : undefined;
}

export type BaselineAttempt = { kind: string; score: number | null; total: number | null; createdAt: string };

function pct(score: number | null | undefined, total: number | null | undefined): number | null {
  if (typeof score !== "number" || typeof total !== "number" || total < ADAPT_MIN_ITEMS) return null;
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
}

export function chooseExamBaseline(input: {
  intro?: { score: number | null; total: number | null } | null;
  attempts: readonly BaselineAttempt[];
}): ExamBaseline | null {
  const level = pct(input.intro?.score, input.intro?.total);
  if (level != null) return { pct: level, source: "level" };
  const first = [...input.attempts]
    .filter((row) => ADAPTIVE_KINDS.has(row.kind) && pct(row.score, row.total) != null)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
  return first ? { pct: pct(first.score, first.total)!, source: "first_test" } : null;
}

export function examResultTrend(baselinePct: number | null, score: number): ExamResultTrend {
  if (baselinePct == null) return "none";
  if (score > baselinePct) return "up";
  return score === baselinePct ? "same" : "down";
}

/**
 * Kartın cümlesi: "🎓 Başlangıç: %42 → Sınav Notu: 88 (+46 Puan Artış!)". Artış yoksa "+" ve "Artış" yazılmaz;
 * düşüşte eksi sayı da yazılmaz (kart nazik kalır, alt satır `examResultSubline`).
 */
export function examResultCardText(input: { baselinePct: number | null; score: number }): string {
  const { baselinePct, score } = input;
  const trend = examResultTrend(baselinePct, score);
  if (trend === "none") return `🎓 Sınav Notu: ${score}`;
  const head = `🎓 Başlangıç: %${baselinePct} → Sınav Notu: ${score}`;
  if (trend === "up") return `${head} (+${score - baselinePct!} Puan Artış!)`;
  if (trend === "same") return `${head} (Başladığın seviyeyi korudun)`;
  return head;
}

export function examResultSubline(trend: ExamResultTrend): string {
  if (trend === "up") return "Emeğin karşılığını aldın. Kartı sınıf grubuna atabilirsin.";
  if (trend === "same") return "Seviyeni sınav gününe kadar taşıdın.";
  if (trend === "down") return "Bu sınav istediğin gibi geçmemiş olabilir; bir dahaki sınava birlikte daha güçlü hazırlanırız.";
  return "Notun kaydedildi. Başlangıç ölçümün olmadığı için karşılaştırma yok.";
}

/** Düşüş kartı paylaşıma açılmaz: öğrenci kendini kötü hissettiren bir kartı gruba atmaya yönlendirilmez. */
export function examResultShareable(trend: ExamResultTrend): boolean {
  return trend !== "down";
}

export function examResultShareText(cardText: string): string {
  return `${cardText} Cortex Plus ile hazırlandım.`;
}

/** Paylaşım bağlantısı tanıtım sayfasının mutlak adresi; öğrencinin adı ya da hazırlığı bağlantıda yok. */
export function examResultWhatsappHref(cardText: string, landingUrl: string): string {
  return whatsappShareHref(examResultShareText(cardText), landingUrl);
}

/** Sınav günü (İstanbul) geçti mi. */
export function examDatePassed(examDate: string | null | undefined, today: string): boolean {
  return typeof examDate === "string" && DAY_RE.test(examDate) && examDate < today;
}

/** Not sorulsun mu: sınav geçti, not yok, erteleme bitti. */
export function examResultDue(input: {
  examDate: string | null | undefined;
  today: string;
  result?: StoredExamResult | null;
  snoozedUntil?: string | null;
}): boolean {
  if (!examDatePassed(input.examDate, input.today) || input.result) return false;
  return !(input.snoozedUntil && input.snoozedUntil > input.today);
}
