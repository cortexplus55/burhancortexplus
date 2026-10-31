import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeQuizQuestion,
  publicQuizQuestion,
  scoreQuizAnswers,
  type PublicQuizQuestion,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import { reviewPromptKey, type StoredReviewItem } from "@/lib/learning/review-items";
import type { ReportDecision, ReportedQuestion } from "@/lib/learning/question-report/decision";

/**
 * Bildirilen sorunun kaynağı ve düzeltmesi (31 Ekim 2026, Paket J2 #10). Soru her zaman SUNUCUDAKİ kayıttan okunur;
 * öğrencinin gönderdiği soru metnine güvenilmez. Hatalı bulunan soru geçersiz sayılır ve tam puan alır; anahtar
 * kesinse ayrıca düzeltilir. Puan yeniden hesaplanır; tekrar listesi ve Yanlışlar Defteri bozuk soruyu bir daha sormaz
 * (satır silinmez: tekrar "expired", defter "mastered").
 */

export type ReportSource = "node" | "mock";

export type ReportTarget = {
  question: ReportedQuestion;
  prepId: string | null;
  alreadyVoided: boolean;
  apply: (decision: ReportDecision) => Promise<AppliedFix>;
};

export type AppliedFix = {
  /** Yoldaki testte ekranın yerine koyacağı soru. */
  question?: PublicQuizQuestion;
  /** Bitmiş denemede ya da testte yeni puan. */
  score?: number;
  total?: number;
};

export type TargetError = "not_found" | "unsupported" | "building" | "not_graded";

const CHOICE_TYPES = new Set(["mcq", "multi_mcq", "true_false"]);

export async function loadReportTarget(
  service: SupabaseClient,
  input: { userId: string; source: ReportSource; targetId: string; questionRef: string },
): Promise<ReportTarget | { error: TargetError }> {
  return input.source === "node" ? loadNodeTarget(service, input) : loadMockTarget(service, input);
}

async function loadNodeTarget(
  service: SupabaseClient,
  input: { userId: string; targetId: string; questionRef: string },
): Promise<ReportTarget | { error: TargetError }> {
  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, user_id, exam_prep_id, status, payload, answers")
    .eq("id", input.targetId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== input.userId) return { error: "not_found" };
  const payload = (attempt.payload ?? {}) as { type?: string; building?: boolean; questions?: unknown[] };
  if (payload.type !== "quiz" || !Array.isArray(payload.questions)) return { error: "unsupported" };
  // Test hâlâ yazılıyorsa yazım kaydın üzerine yazar; düzeltme kaybolur.
  if (payload.building === true) return { error: "building" };
  const index = Number(input.questionRef);
  const raw = Number.isInteger(index) && index >= 0 ? payload.questions[index] : null;
  const question = raw ? normalizeQuizQuestion(raw as Parameters<typeof normalizeQuizQuestion>[0]) : null;
  if (!raw || !question) return { error: "not_found" };
  const prepId = (attempt.exam_prep_id as string | null) ?? null;

  return {
    prepId,
    alreadyVoided: question.voided === true,
    question: {
      type: "choice",
      text: question.text,
      options: question.options,
      correct: question.correct,
      multi: question.multi,
      explanation: question.explanation ?? null,
      steps: question.steps ?? null,
    },
    apply: async (decision) => {
      const fixed = voidedRow(raw as Record<string, unknown>, decision);
      const questions = [...(payload.questions as unknown[])];
      questions[index] = fixed;
      const nextPayload = { ...payload, questions };
      const update: Record<string, unknown> = { payload: nextPayload };
      let rescored: { score: number; total: number } | null = null;
      if (attempt.status === "completed") {
        const playable = questions
          .map((row) => normalizeQuizQuestion(row as Parameters<typeof normalizeQuizQuestion>[0]))
          .filter((row): row is QuizQuestion => row !== null);
        rescored = scoreQuizAnswers(playable, (attempt.answers ?? {}) as Record<string, unknown>);
        update.score = rescored.score;
        update.total = rescored.total;
      }
      const { error } = await service.from("exam_prep_node_attempts").update(update).eq("id", attempt.id);
      if (error) throw new Error(error.message);
      if (prepId) await retireReviewItem(service, input.userId, prepId, question);
      const shown = normalizeQuizQuestion(fixed as Parameters<typeof normalizeQuizQuestion>[0]);
      return {
        question: shown ? publicQuizQuestion(shown) : undefined,
        ...(rescored ? { score: rescored.score, total: rescored.total } : {}),
      };
    },
  };
}

/** Kayıtlı soru satırının geçersiz (ve gerekiyorsa anahtarı düzeltilmiş) hâli. Eski açıklama yanlış anahtarı anlatır. */
export function voidedRow(raw: Record<string, unknown>, decision: ReportDecision): Record<string, unknown> {
  const note = decision.explanation || undefined;
  if (decision.action === "fix" && decision.correctedKey?.length) {
    const { optionWhy: _why, optionReasons: _reasons, steps: _steps, ...rest } = raw;
    void _why;
    void _reasons;
    void _steps;
    return {
      ...rest,
      correct: decision.correctedKey,
      ...(note ? { explanation: note } : {}),
      voided: true,
      keyFixed: true,
      ...(note ? { voidNote: note } : {}),
    };
  }
  return { ...raw, voided: true, ...(note ? { voidNote: note } : {}) };
}

async function retireReviewItem(service: SupabaseClient, userId: string, prepId: string, question: QuizQuestion) {
  const key = reviewPromptKey({
    mode: "choice",
    prompt: question.text,
    options: question.options,
    correct: question.correct,
    multi: question.multi,
  } as StoredReviewItem);
  await service
    .from("exam_prep_review_items")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .eq("prompt_key", key)
    .eq("status", "active")
    .then(
      () => undefined,
      () => undefined,
    );
}

async function loadMockTarget(
  service: SupabaseClient,
  input: { userId: string; targetId: string; questionRef: string },
): Promise<ReportTarget | { error: TargetError }> {
  const { data: exam } = await service
    .from("practice_exams")
    .select("id, user_id, exam_prep_id")
    .eq("id", input.targetId)
    .maybeSingle();
  if (!exam || exam.user_id !== input.userId) return { error: "not_found" };
  const { data: row } = await service
    .from("practice_exam_questions")
    .select("id, question_text, question_type, options, correct_answer, correct_answers, explanation, model_answer, rubric")
    .eq("id", input.questionRef)
    .eq("exam_id", input.targetId)
    .maybeSingle();
  if (!row) return { error: "not_found" };
  // Bildirim inceleme ekranında: notlanmış deneme şart (puan ona yazılır).
  const { data: attempt } = await service
    .from("practice_exam_attempts")
    .select("id")
    .eq("exam_id", input.targetId)
    .eq("user_id", input.userId)
    .not("completed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt) return { error: "not_graded" };
  const { data: review } = await service
    .from("practice_exam_item_reviews")
    .select("id, verdict, feedback")
    .eq("attempt_id", attempt.id)
    .eq("question_id", row.id)
    .maybeSingle();

  const type = String(row.question_type ?? "mcq");
  const options = Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [];
  const correctList = Array.isArray(row.correct_answers) ? (row.correct_answers as unknown[]).map(String).filter(Boolean) : [];
  const correct = correctList.length ? correctList : row.correct_answer ? [String(row.correct_answer)] : [];
  const choice = CHOICE_TYPES.has(type) && options.length >= 2;
  const rubric = Array.isArray(row.rubric)
    ? (row.rubric as Array<{ text?: string; criterion?: string } | string>)
        .map((item) => (typeof item === "string" ? item : item.text ?? item.criterion ?? ""))
        .filter(Boolean)
    : [];
  const alreadyVoided = Boolean((review?.feedback as { voided?: boolean } | null)?.voided);

  return {
    prepId: (exam.exam_prep_id as string | null) ?? null,
    alreadyVoided,
    question: {
      type: choice ? "choice" : "open",
      text: String(row.question_text ?? ""),
      options: choice ? options : [],
      correct: choice ? correct : [],
      multi: type === "multi_mcq",
      explanation: (row.explanation as string | null) ?? null,
      modelAnswer: (row.model_answer as string | null) ?? null,
      rubric,
    },
    apply: async (decision) => {
      const note = decision.explanation || null;
      if (decision.action === "fix" && decision.correctedKey?.length) {
        await service
          .from("practice_exam_questions")
          .update({
            correct_answer: decision.correctedKey[0],
            correct_answers: type === "multi_mcq" ? decision.correctedKey : null,
            ...(note ? { explanation: note } : {}),
          })
          .eq("id", row.id);
      }
      if (review) {
        const { data: full } = await service
          .from("practice_exam_item_reviews")
          .select("points_max")
          .eq("id", review.id)
          .maybeSingle();
        await service
          .from("practice_exam_item_reviews")
          .update({
            is_correct: true,
            verdict: "dogru",
            points_earned: Number(full?.points_max ?? 1),
            ...(note ? { explanation: note } : {}),
            feedback: { met: [], missed: [], note: note ?? undefined, voided: true },
          })
          .eq("id", review.id);
      }
      // Puan, notlandırmanın kuralıyla: kazanılan / en çok puan.
      const { data: rows } = await service
        .from("practice_exam_item_reviews")
        .select("points_earned, points_max")
        .eq("attempt_id", attempt.id);
      let earned = 0;
      let max = 0;
      for (const item of rows ?? []) {
        earned += Number(item.points_earned ?? 0);
        max += Number(item.points_max ?? 0);
      }
      const score = max > 0 ? Math.min(100, Math.round((earned / max) * 100)) : undefined;
      if (score != null) await service.from("practice_exam_attempts").update({ score }).eq("id", attempt.id);
      // Defter bozuk soruyu bir daha sormasın: düzeltmede doğru anahtar, geçersizde defterden çıkmış sayılır.
      await service
        .from("mistake_entries")
        .update(
          decision.action === "fix" && decision.correctedKey?.length
            ? { correct_answer: decision.correctedKey.join(" | "), ...(note ? { explanation: note } : {}) }
            : { mastered_at: new Date().toISOString() },
        )
        .eq("user_id", input.userId)
        .eq("source_question_id", row.id)
        .then(
          () => undefined,
          () => undefined,
        );
      return score != null ? { score, total: 100 } : {};
    },
  };
}
