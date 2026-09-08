import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import { parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { validateQuizPedagogy } from "@/lib/learning/teaching-standards";

export async function generateExamQuiz(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  userPrompt: string;
  difficulty?: "easy" | "medium" | "hard";
  verificationMode?: "full" | "schema";
  /** Stage 5: enforce pedagogy validators (fail closed via quality gate). */
  teachingV2?: boolean;
  schemaHintExtra?: string;
}): Promise<{ ok: true; questions: QuizQuestion[] } | { ok: false; status: number; error: string }> {
  const pedagogyHint = input.teachingV2
    ? " Her soruda learningObjective (kısa hedef) ve explanation zorunlu. misconceptionTag isteğe bağlı. multi yalnızca birden fazla bağımsız doğru varken."
    : "";
  const schemaHint =
    'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string,"learningObjective":string,"misconceptionTag":string}]}. correct, options içinden olmalı. Çoklu doğru şıklarda multi true, correct dizi ve en az iki bağımsız doğru seçenek olmalı; tek doğru varsa multi false olmalı. "Hepsi doğrudur", "hiçbiri" veya başka seçenekleri özetleyen seçenekler kullanma. Doğru seçenek kümesi açıklamayla birebir uyuşmalı. Her soruyu matematiksel ve bilimsel doğruluk açısından ikinci kez kontrol et. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.' +
    pedagogyHint +
    (input.schemaHintExtra ? ` ${input.schemaHintExtra}` : "");

  const parse = (raw: unknown) => {
    const questions = parseQuizQuestions(raw);
    if (!questions) return null;
    if (input.teachingV2) {
      const issues = validateQuizPedagogy(questions, { requireObjective: false });
      if (issues.length) return null;
      const missingObj = questions.every((q) => !q.learningObjective?.trim());
      if (missingObj) return null;
    }
    return { questions };
  };

  const run = (opts: {
    userPrompt: string;
    verificationMode?: "full" | "schema";
    difficulty?: "easy" | "medium" | "hard";
  }) =>
    generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: "QUIZ_GENERATE",
      isPremium: input.isPremium,
      difficulty: opts.difficulty ?? input.difficulty,
      verificationMode: opts.verificationMode ?? input.verificationMode,
      schemaHint,
      userPrompt: opts.userPrompt,
      parse,
    });

  let outcome = await run({ userPrompt: input.userPrompt });
  if (
    input.teachingV2 &&
    !outcome.ok &&
    outcome.error === "content_verification_failed"
  ) {
    outcome = await run({
      difficulty: "hard",
      userPrompt: `${input.userPrompt}
Önceki taslak reddedildi. Daha kısa sorular yaz; tek doğru şık (multi false) tercih et; learningObjective ve explanation her soruda olsun; yalnızca kaynak alıntılarındaki tanımlara dayan.`,
    });
  }
  if (
    input.teachingV2 &&
    !outcome.ok &&
    outcome.error === "content_verification_failed"
  ) {
    // Last resort: local schema + pedagogy validators still required; AI review skipped.
    outcome = await run({
      difficulty: "hard",
      verificationMode: "schema",
      userPrompt: `${input.userPrompt}
Yalnızca tek doğru şık (multi false). Kısa, kaynaktan doğrulanabilir; learningObjective + explanation zorunlu.`,
    });
  }

  if (!outcome.ok) return outcome;
  return { ok: true, questions: outcome.data.questions };
}
