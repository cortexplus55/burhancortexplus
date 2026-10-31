import { ADAPT_MIN_ITEMS } from "@/lib/learning/path-change";
import { istanbulDay } from "@/lib/istanbul-day";
import { whatsappShareHref } from "@/lib/learning/duel-share";

/**
 * Sınav sonrası başarı kartı (31 Ekim 2026, Paket J3 #14). Sınav günü geçince hazırlık sayfası notu sorar; öğrenci
 * yazınca başlangıç seviyesiyle karşılaştıran, paylaşılabilir kart çıkar. Not göçsüz `exam_preps.learning_preferences`
 * içinde durur (`examResult`, sınav saati gibi; `parseLearningPreferences` korur). "Notum henüz açıklanmadı" soruyu
 * üç gün erteler (`examResultSnoozedUntil`). Saf modül: istemci de okur.
 *
 * Başlangıç seviyesi (deterministik, kayıttan; Paket J takip #2, 1 Kasım 2026): önce hazırlığın tamamlanmış seviye
 * tespiti (en az 3 soru), yoksa öğrencinin bu hazırlıkta puanlı bir etkinlik bitirdiği İLK GÜNÜN (İstanbul) ortalaması:
 * o günün bütün tamamlanmış, puanlı kayıtları (tür fark etmez: ders kontrolleri, test, doğru/yanlış, sözlü, kart…),
 * her kayıt eşit ağırlıkta (yüzdelerin ortalaması; 80 kartlık tekrar 5 soruluk testi ezmesin). En az 2 maddelik kayıt
 * sayılır: 1/1 kayıtlar (dinledi, hazır) ölçüm değil, bitirme işaretidir — uydurma %100 yazılmaz. Hiç puanlı kayıt
 * yoksa başlangıç yazılmaz, yalnız not görünür. Hazırlık skoru anlık görüntüsü şemada yok (o yüzden üçüncü kaynak yok).
 * Kaydedilmiş, başlangıcı boş not okunurken yeniden hesaplanır (hazırlık sayfası).
 */

export const EXAM_RESULT_ASK = "Sınavın nasıl geçti? Notunu yaz";
export const EXAM_RESULT_LATER = "Notum henüz açıklanmadı";
export const EXAM_RESULT_SAVE = "Kartımı oluştur";
export const EXAM_RESULT_SNOOZE_DAYS = 3;

/** `level`: seviye tespiti; `first_day_activity`: ilk çalışma gününün ortalaması; `first_test`: eski kayıtlar. */
export type ExamBaselineSource = "level" | "first_day_activity" | "first_test";
export type ExamBaseline = { pct: number; source: ExamBaselineSource; count?: number };
const BASELINE_SOURCES: readonly ExamBaselineSource[] = ["level", "first_day_activity", "first_test"];
/** İlk gün ortalamasına giren kaydın en az madde sayısı (1/1 bitirme işareti ölçüm sayılmaz). */
export const FIRST_DAY_MIN_ITEMS = 2;
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
  const baselineSource = BASELINE_SOURCES.includes(row.baselineSource as ExamBaselineSource)
    ? (row.baselineSource as ExamBaselineSource)
    : null;
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
  const scored = input.attempts
    .filter(
      (row) =>
        typeof row.score === "number" &&
        typeof row.total === "number" &&
        row.total >= FIRST_DAY_MIN_ITEMS &&
        row.score >= 0 &&
        !Number.isNaN(Date.parse(row.createdAt)),
    )
    .map((row) => ({ day: istanbulDay(new Date(row.createdAt)), pct: Math.min(100, (row.score! / row.total!) * 100) }));
  if (!scored.length) return null;
  const firstDay = scored.reduce((min, row) => (row.day < min ? row.day : min), scored[0].day);
  const sameDay = scored.filter((row) => row.day === firstDay);
  const avg = Math.round(sameDay.reduce((sum, row) => sum + row.pct, 0) / sameDay.length);
  return { pct: Math.max(0, Math.min(100, avg)), source: "first_day_activity", count: sameDay.length };
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

export function examResultSubline(trend: ExamResultTrend, source?: ExamBaselineSource | null): string {
  const from =
    trend === "none" || !source
      ? ""
      : source === "level"
        ? " Başlangıç: seviye tespitin."
        : source === "first_day_activity"
          ? " Başlangıç: bu hazırlıkta çalıştığın ilk günün ortalaması."
          : " Başlangıç: bu hazırlıkta çözdüğün ilk test.";
  if (trend === "up") return `Emeğin karşılığını aldın. Kartı sınıf grubuna atabilirsin.${from}`;
  if (trend === "same") return `Seviyeni sınav gününe kadar taşıdın.${from}`;
  if (trend === "down") return `Bu sınav istediğin gibi geçmemiş olabilir; bir dahaki sınava birlikte daha güçlü hazırlanırız.${from}`;
  return "Notun kaydedildi. Bu hazırlıkta puanlı bir etkinlik çözülmediği için başlangıçla karşılaştırma yok.";
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
