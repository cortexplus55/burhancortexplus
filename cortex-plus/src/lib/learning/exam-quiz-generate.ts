import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import { parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { repairQuizPedagogy, validateQuizPedagogy } from "@/lib/learning/teaching-standards";

const QUIZ_GATE = {
  requireObjective: false,
  requireMisconceptionTag: true,
  requireDistractorRefutation: true,
} as const;

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
    ? " Her soruda learningObjective, explanation ve misconceptionTag zorunlu. explanation en az bir yanlış şıkkın gerçekte ne olduğunu söylesin. multi yalnızca birden fazla bağımsız doğru varken."
    : "";
  const schemaHint =
    'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string,"learningObjective":string,"misconceptionTag":string}]}. correct, options içinden olmalı. Çoklu doğru şıklarda multi true, correct dizi ve en az iki bağımsız doğru seçenek olmalı; tek doğru varsa multi false olmalı. "Hepsi doğrudur", "hiçbiri" veya başka seçenekleri özetleyen seçenekler kullanma. Doğru seçenek kümesi açıklamayla birebir uyuşmalı. Her soruyu matematiksel ve bilimsel doğruluk açısından ikinci kez kontrol et. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.' +
    pedagogyHint +
    (input.schemaHintExtra ? ` ${input.schemaHintExtra}` : "");

  let lastIssues: string[] = [];
  const questionsFrom = (raw: unknown): QuizQuestion[] | null => {
    const parsed = parseQuizQuestions(raw);
    if (!parsed) return null;
    return input.teachingV2 ? repairQuizPedagogy(parsed) : parsed;
  };

  const parse = (raw: unknown) => {
    const questions = questionsFrom(raw);
    if (!questions) {
      lastIssues = ["Quiz şeması geçersiz."];
      return null;
    }
    if (input.teachingV2) {
      const issues = validateQuizPedagogy(questions, QUIZ_GATE);
      if (issues.length) {
        lastIssues = issues;
        return null;
      }
    }
    lastIssues = [];
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
    allowIndependentAccept: false,
    activityKind: "quiz",
    /**
     * Bağımsız kapı temizse ileri denetçi açılmaz. Denetçi, doğru stokiyometri
     * sonucunu kaynakta yazmıyor diye reddedip taslağı ders şekline çeviriyordu;
     * ayrıştırıcı da bunu biçim hatası diye öğrenciye yazıyordu.
     */
    trustIndependent: input.teachingV2 ? true : undefined,
    reviewDraft: input.teachingV2
      ? (draft) => {
          try {
            const questions = questionsFrom(JSON.parse(draft));
            return questions ? JSON.stringify({ questions }) : draft;
          } catch {
            return draft;
          }
        }
      : undefined,
    describeParseFailure: () => lastIssues,
    buildIndependent: input.teachingV2
      ? (_content, parsed) => {
          const questions = parsed ? questionsFrom(parsed) : null;
          return {
            pedagogyIssues: questions
              ? validateQuizPedagogy(questions, QUIZ_GATE)
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
