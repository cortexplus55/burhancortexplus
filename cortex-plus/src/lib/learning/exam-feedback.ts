import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import {
  EXAM_FEEDBACK_COMMENT_LATER,
  EXAM_FEEDBACK_LIMITS,
  EXAM_FEEDBACK_NEEDS_NUMBER,
  EXAM_FEEDBACK_THANKS,
  cleanFeedbackText,
  examDatePassed,
  parseExamScore,
  type StoredExamResult,
} from "@/lib/learning/exam-result";
import { loadExamBaseline } from "@/lib/learning/exam-result-load";
import { missingRelation } from "@/lib/learning/missing-column";
import { readReadinessToken } from "@/lib/learning/readiness-snapshot";

/**
 * Sınav sonrası başarı toplayıcı (Faz 7, 20 Kasım 2026). "🎓 Sınavın Nasıl Geçti?" kartının kaydı:
 *   1. Hazırlık öğrencinin mi, sınav günü geçti mi (sınav gününün başından 24 saat; `examDatePassed`).
 *   2. Yorum `exam_feedback_testimonials`a (hazırlık başına tek satır; yeniden gönderim günceller). Hazırlık puanı
 *      tarayıcıdan değil, sayfanın imzaladığı anlık görüntüden (`readiness-snapshot.ts`).
 *   3. Not 0-100 arası tam sayıysa bugünkü başarı kartı yolu da çalışır (`learning_preferences.examResult`,
 *      başlangıçla karşılaştırma ve paylaşım). Yorum kaydedildiyse `examFeedbackAt` soruyu kapatır.
 * Göçten önce (tablo yok): not sayıysa yalnız 3. adım ve öğrenciye yorumun kaydedilemediği söylenir; sayı değilse
 * hiçbir şey yazılmaz, nazik ret. Hiçbir durumda istek düşmez.
 */

export const EXAM_FEEDBACK_TABLE = "exam_feedback_testimonials";

export type ExamFeedbackInput = {
  prepId: string;
  userId: string;
  actualScore: string;
  comment: string;
  displayName?: string | null;
  allowPublicShowcase?: boolean;
  readinessToken?: string | null;
};

export type ExamFeedbackOutcome =
  | { ok: true; testimonialSaved: boolean; result: StoredExamResult | null; message: string }
  | { ok: false; status: number; code: string; message?: string };

export async function saveExamFeedback(
  service: SupabaseClient,
  input: ExamFeedbackInput,
  now: Date = new Date(),
): Promise<ExamFeedbackOutcome> {
  const actualScore = cleanFeedbackText(input.actualScore, EXAM_FEEDBACK_LIMITS.score);
  const comment = cleanFeedbackText(input.comment, EXAM_FEEDBACK_LIMITS.comment);
  const displayName = cleanFeedbackText(input.displayName, EXAM_FEEDBACK_LIMITS.name) || null;
  if (!actualScore || !comment) return { ok: false, status: 400, code: "invalid_input" };

  const { data: prep, error: prepError } = await service
    .from("exam_preps")
    .select("id, exam_date, learning_preferences")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (prepError) return { ok: false, status: 500, code: "save_failed" };
  if (!prep) return { ok: false, status: 404, code: "not_found" };
  if (!examDatePassed((prep.exam_date as string | null) ?? null, istanbulDay(now))) {
    return { ok: false, status: 409, code: "exam_not_passed", message: "Sınavın ertesi gününden itibaren not kaydedilir." };
  }

  const predicted = readReadinessToken(input.readinessToken, { prepId: prep.id as string, userId: input.userId }, now.getTime());
  let testimonialSaved = false;
  try {
    const { error } = await service.from(EXAM_FEEDBACK_TABLE).upsert(
      {
        user_id: input.userId,
        exam_prep_id: prep.id as string,
        predicted_readiness_pct: predicted,
        actual_score: actualScore,
        comment,
        allow_public_showcase: input.allowPublicShowcase === true,
        display_name: displayName,
      },
      { onConflict: "exam_prep_id" },
    );
    if (!error) testimonialSaved = true;
    else console.warn(missingRelation(error) ? "exam_feedback_table_missing" : "exam_feedback_save_failed", { code: error.code ?? "unknown" });
  } catch (caught) {
    console.warn("exam_feedback_save_failed", { code: caught instanceof Error ? caught.name : "throw" });
  }

  const score = parseExamScore(actualScore);
  if (!testimonialSaved && score == null) {
    return { ok: false, status: 503, code: "feedback_unavailable", message: EXAM_FEEDBACK_NEEDS_NUMBER };
  }

  const raw =
    prep.learning_preferences && typeof prep.learning_preferences === "object" && !Array.isArray(prep.learning_preferences)
      ? (prep.learning_preferences as Record<string, unknown>)
      : {};
  let result: StoredExamResult | null = null;
  const next: Record<string, unknown> = { ...raw };
  if (score != null) {
    const baseline = await loadExamBaseline(service, { prepId: prep.id as string, userId: input.userId });
    result = { score, at: now.toISOString(), baselinePct: baseline?.pct ?? null, baselineSource: baseline?.source ?? null };
    next.examResult = result;
  }
  if (testimonialSaved) next.examFeedbackAt = now.toISOString();
  delete next.examResultSnoozedUntil;

  const { error: prefsError } = await service
    .from("exam_preps")
    .update({ learning_preferences: next })
    .eq("id", prep.id as string)
    .eq("user_id", input.userId);
  if (prefsError) {
    console.warn("exam_feedback_prefs_failed", { code: prefsError.code ?? "unknown" });
    // Yorum kaydedildiyse kayıt yerinde (soru bir dahaki açılışta yeniden çıkabilir, aynı satır güncellenir).
    if (!testimonialSaved) return { ok: false, status: 500, code: "save_failed" };
    result = null;
  }

  return {
    ok: true,
    testimonialSaved,
    result,
    message: testimonialSaved ? EXAM_FEEDBACK_THANKS : EXAM_FEEDBACK_COMMENT_LATER,
  };
}
