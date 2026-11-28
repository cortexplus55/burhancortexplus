/**
 * `action: "answer-check"` (Faz 2, madde 7.3): etkin test / Doğru-Yanlış sorusunun anında geri bildirimi sunucuda.
 *
 * Öğrenci "Kontrol et" deyince (D/Y'de önermeyi seçince) cevap kayıtta KİLİTLENİR, sonra yalnız o sorunun anahtarı ve
 * açıklaması döner. Kilitli sorunun cevabı sonradan değişmez (`applyAnswerLocks`; bitişte de aynı kural), yani anahtarı
 * görmek cevabı düzeltmeye yaramaz. `reveal` ile yenilenen sayfa yalnız ZATEN kilitli soruların anahtarını geri alır.
 * Zamanlı yazılı denemede anında geri bildirim yok (400). Notlandırma değişmez: bitişte kayıtlı paketle notlanır.
 */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { ANSWER_LOCK_KEY, applyAnswerLocks, lockedKeys } from "@/lib/learning/answer-lock";
import type { NodeContext } from "@/lib/learning/node/context";
import {
  canonicalQuizAnswer,
  quizCheckFeedback,
  resolveQuizIndex,
  storedQuizQuestion,
  type QuizCheckQuestion,
} from "@/lib/learning/answer-check-core";
import { storedTrueFalseKey } from "@/lib/learning/answer-key-consistency";

type StoredTrueFalse = { text?: unknown; correct?: unknown; explanation?: unknown; correctedStatement?: unknown };

export const ANSWER_CHECK_REVEAL_MAX = 60;

/** Kayıtlı paketteki tek sorunun öğrenciye açılan geri bildirimi; soru yoksa null. */
export function answerFeedback(
  payload: Record<string, unknown>,
  index: number,
): { kind: "quiz"; question: QuizCheckQuestion } | { kind: "true_false"; item: Record<string, unknown> } | null {
  if (payload.type === "quiz") {
    const question = storedQuizQuestion(payload, index);
    // Oturum paketiyle aynı süzgeç (28 Kasım 2026, P0): ekran ham metinle süzülmüş metni karşılaştırmasın.
    return question ? { kind: "quiz", question: quizCheckFeedback(question) } : null;
  }
  if (payload.type === "true_false" && Array.isArray(payload.items)) {
    const raw = payload.items[index] as StoredTrueFalse | undefined;
    if (!raw || typeof raw.correct !== "boolean") return null;
    return {
      kind: "true_false",
      item: {
        // Kayıtlı önermenin işlemi yanlışsa anahtar puanla aynı kapıdan okunur (Faz 1-A §3).
        correct: storedTrueFalseKey(raw as { text?: unknown; correct: boolean }),
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
        ...(typeof raw.correctedStatement === "string" ? { correctedStatement: raw.correctedStatement } : {}),
      },
    };
  }
  return null;
}

/** Bu soru kayıtta kilitli mi (testte `__locked`; D/Y'de cevap verilmiş olması kilittir). */
export function answerLocked(payloadType: unknown, answers: Record<string, unknown>, key: string): boolean {
  if (payloadType === "true_false") return answers[key] !== undefined;
  return lockedKeys(answers).includes(key);
}

export async function answerCheckAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, parsed, prepId, nodeId, kind } = context;
  const attemptId = parsed.data.attemptId;
  if (!attemptId) return errorResponse(400, "invalid_input");
  // Zamanlı yazılı denemede anahtar sınav bitene kadar kapalı.
  if (kind === "written_exam") return errorResponse(400, "invalid_input");

  const { data: attempt, error } = await service
    .from("exam_prep_node_attempts")
    .select("id, status, payload, answers")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (error) return errorResponse(503, "attempt_lookup_failed");
  if (!attempt?.payload) return errorResponse(404, "not_found");
  const payload = attempt.payload as Record<string, unknown>;
  if (payload.type !== "quiz" && payload.type !== "true_false") return errorResponse(400, "invalid_input");
  const saved = (attempt.answers as Record<string, unknown> | null) ?? {};
  const completed = attempt.status === "completed";

  // Yenilenen sayfa: yalnız kilitli (bitmiş kayıtta bütün) soruların anahtarı.
  const reveal = parsed.data.revealIndexes;
  if (reveal?.length) {
    const out: Record<string, unknown> = {};
    for (const index of reveal.slice(0, ANSWER_CHECK_REVEAL_MAX)) {
      const key = String(index);
      if (!completed && !answerLocked(payload.type, saved, key)) continue;
      const feedback = answerFeedback(payload, index);
      if (feedback) out[key] = feedback.kind === "quiz" ? feedback.question : feedback.item;
    }
    return NextResponse.json({ ok: true, revealed: out });
  }

  const asked = parsed.data.questionIndex;
  if (asked == null) return errorResponse(400, "invalid_input");
  // Ekranın gördüğü kök (28 Kasım 2026, P0): o sıradaki soru o kök değilse sunucu başka soruyu notlamaz.
  const index = payload.type === "quiz" ? resolveQuizIndex(payload, asked, parsed.data.questionText) : asked;
  if (index == null) {
    console.warn("answer_check_question_mismatch", { attemptId: attempt.id, asked });
    return errorResponse(409, "question_mismatch");
  }
  const key = String(index);
  const feedback = answerFeedback(payload, index);
  if (!feedback) return errorResponse(400, "invalid_input");
  if (attempt.status !== "active" && !completed) return errorResponse(409, "attempt_not_active");

  let answer: unknown = saved[key];
  if (!completed && !answerLocked(payload.type, saved, key)) {
    const submitted = parsed.data.answer;
    let locked: unknown = submitted;
    if (payload.type === "true_false") {
      if (typeof submitted !== "boolean") return errorResponse(400, "invalid_input");
    } else {
      // Kilide yalnız sorunun kendi şıkkı yazılır (şıktaki metniyle); şıklarda karşılığı olmayan cevap reddedilir.
      const question = storedQuizQuestion(payload, index);
      locked = question ? canonicalQuizAnswer(question, submitted) : null;
      if (locked == null) {
        console.warn("answer_check_invalid_answer", { attemptId: attempt.id, index });
        return errorResponse(400, "invalid_answer");
      }
    }
    const next = applyAnswerLocks(saved, {
      ...saved,
      [key]: locked,
      ...(payload.type === "quiz" ? { [ANSWER_LOCK_KEY]: [...new Set([...lockedKeys(saved), key])] } : {}),
    });
    // Cevap ve kilit kayda yazılır (sürüm denetimli ara kayıt kilidi korur: `save` sunucudaki kilitleri uygular).
    const { error: writeError } = await service
      .from("exam_prep_node_attempts")
      .update({ answers: next })
      .eq("id", attempt.id)
      .eq("user_id", userId)
      .eq("status", "active");
    if (writeError) {
      console.warn("answer_check_lock_failed", { attemptId: attempt.id, code: writeError.code ?? null });
      return errorResponse(503, "save_failed");
    }
    answer = next[key];
  }

  return NextResponse.json({
    ok: true,
    index,
    answer,
    ...(feedback.kind === "quiz" ? { question: feedback.question } : { item: feedback.item }),
  });
}
