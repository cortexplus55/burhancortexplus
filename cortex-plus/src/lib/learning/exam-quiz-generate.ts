import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import { parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";

export async function generateExamQuiz(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  userPrompt: string;
}): Promise<{ ok: true; questions: QuizQuestion[] } | { ok: false; status: number; error: string }> {
  const outcome = await generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "QUIZ_GENERATE",
    isPremium: input.isPremium,
    schemaHint:
      'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string}]}. correct, options içinden olmalı. Çoklu doğru şıklarda multi true ve correct dizi. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.',
    userPrompt: input.userPrompt,
    parse: (raw) => {
      const questions = parseQuizQuestions(raw);
      return questions ? { questions } : null;
    },
  });
  if (!outcome.ok) return outcome;
  return { ok: true, questions: outcome.data.questions };
}
