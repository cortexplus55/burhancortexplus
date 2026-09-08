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
  const outcome = await generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "QUIZ_GENERATE",
    isPremium: input.isPremium,
    difficulty: input.difficulty,
    verificationMode: input.verificationMode,
    schemaHint:
      'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string,"learningObjective":string,"misconceptionTag":string}]}. correct, options içinden olmalı. Çoklu doğru şıklarda multi true, correct dizi ve en az iki bağımsız doğru seçenek olmalı; tek doğru varsa multi false olmalı. "Hepsi doğrudur", "hiçbiri" veya başka seçenekleri özetleyen seçenekler kullanma. Doğru seçenek kümesi açıklamayla birebir uyuşmalı. Her soruyu matematiksel ve bilimsel doğruluk açısından ikinci kez kontrol et. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.' +
      pedagogyHint +
      (input.schemaHintExtra ? ` ${input.schemaHintExtra}` : ""),
    userPrompt: input.userPrompt,
    parse: (raw) => {
      const questions = parseQuizQuestions(raw);
      if (!questions) return null;
      if (input.teachingV2) {
        const issues = validateQuizPedagogy(questions, { requireObjective: true });
        if (issues.length) return null;
      }
      return { questions };
    },
  });
  if (!outcome.ok) return outcome;
  return { ok: true, questions: outcome.data.questions };
}
