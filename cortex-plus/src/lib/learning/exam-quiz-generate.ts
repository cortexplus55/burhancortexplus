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
  /** Stage 7: source excerpt for independent source checks. */
  sourceExcerpt?: string;
  requireSourceSupport?: boolean;
  sourcePages?: number[];
  /** Shared key if caller already reserved this user operation elsewhere. */
  idempotencyKey?: string;
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

  // Single reservation: draft retries + optional independent-only accept stay inside generateJson.
  const outcome = await generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "QUIZ_GENERATE",
    isPremium: input.isPremium,
    difficulty: input.difficulty ?? (input.teachingV2 ? "hard" : undefined),
    verificationMode: input.verificationMode,
    validationProfile: input.teachingV2 ? "v2" : "legacy",
    idempotencyKey: input.idempotencyKey,
    maxDraftAttempts: input.teachingV2 ? 2 : 1,
    allowIndependentAccept: input.teachingV2 && input.verificationMode !== "schema",
    activityKind: "quiz",
    buildIndependent: input.teachingV2
      ? (_content, parsed) => {
          const questions = parsed ? parseQuizQuestions(parsed) : null;
          return {
            pedagogyIssues: questions
              ? validateQuizPedagogy(questions, { requireObjective: false })
              : ["Quiz şeması geçersiz."],
            minItems: 3,
            sourceExcerpt: input.sourceExcerpt,
            requireSourceSupport: input.requireSourceSupport,
            sourcePages: input.sourcePages,
            subjectHint: "quiz",
          };
        }
      : undefined,
    schemaHint,
    userPrompt: input.userPrompt,
    parse,
  });

  if (!outcome.ok) return outcome;
  return { ok: true, questions: outcome.data.questions };
}
