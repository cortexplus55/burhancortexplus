import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import { coerceQuizQuestions, parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { repairQuizPedagogy, validateQuizPedagogy } from "@/lib/learning/teaching-standards";
import {
  refineVerifiedChoices,
  verifyChoiceSet,
  type VerifiedChoice,
} from "@/lib/learning/question-verifier";

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
    ? " Her soruda learningObjective, explanation, misconceptionTag ve optionWhy zorunlu. optionWhy, options ile aynı uzunlukta; her şık için bir cümle (doğru şıkta gerekçe, diğerlerinde o şıkkın neden uymadığı). misconceptionTag, tuzakta adı geçen yanlış anlamın adı. multi yalnızca birden fazla bağımsız doğru varken."
    : "";
  const schemaHint =
    'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string,"learningObjective":string,"misconceptionTag":string,"optionWhy":string[]}]}. correct, options içinden olmalı. optionWhy her şık için tek cümle, options ile aynı sırada. Çoklu doğru şıklarda multi true, correct dizi ve en az iki bağımsız doğru seçenek olmalı; tek doğru varsa multi false olmalı. "Hepsi doğrudur", "hiçbiri" veya başka seçenekleri özetleyen seçenekler kullanma. Çeldirici, sorunun kavramına ait makul bir yanlış anlama olsun; soruda geçmeyen ve doğru şıkla aynı türden olmayan seçenek yazma. Doğru seçenek kümesi açıklamayla birebir uyuşmalı. Tek doğru cevabı olmayan ya da kendi içinde çözülemeyen soru yazma. Her soruyu matematiksel ve bilimsel doğruluk açısından ikinci kez kontrol et. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.' +
    pedagogyHint +
    (input.schemaHintExtra ? ` ${input.schemaHintExtra}` : "");

  const asChoices = (questions: QuizQuestion[]): VerifiedChoice[] =>
    questions.map((question) => ({
      text: question.text,
      options: question.options,
      correct: question.correct,
      multi: question.multi,
      explanation: question.explanation,
      learningObjective: question.learningObjective,
      misconceptionTag: question.misconceptionTag,
      optionWhy: question.optionWhy,
      topic: question.topic,
      needsSolver: question.needsSolver,
    }));

  const fromChoices = (questions: VerifiedChoice[]): QuizQuestion[] =>
    questions.map((question) => ({
      text: question.text,
      options: question.options,
      correct: question.correct,
      multi: question.multi,
      explanation: question.explanation,
      learningObjective: question.learningObjective,
      misconceptionTag: question.misconceptionTag,
      optionWhy: question.optionWhy,
      topic: question.topic,
      needsSolver: question.needsSolver,
    }));

  let lastIssues: string[] = [];
  const questionsFrom = (raw: unknown): QuizQuestion[] | null => {
    const parsed = parseQuizQuestions(raw) ?? coerceQuizQuestions(raw);
    if (!parsed) return null;
    const repaired = input.teachingV2 ? repairQuizPedagogy(parsed) : parsed;
    const verified = verifyChoiceSet(asChoices(repaired), input.sourceExcerpt ?? "", 3);
    if (!verified) {
      lastIssues = ["Bağımsız doğrulama soruyu tutmadı. Tek doğru cevabı olan yeni soru yaz."];
      return null;
    }
    const settled = input.teachingV2 ? repairQuizPedagogy(fromChoices(verified)) : fromChoices(verified);
    return settled;
  };

  const parse = (raw: unknown) => {
    const questions = questionsFrom(raw);
    if (!questions) {
      if (!lastIssues.length) lastIssues = ["Quiz şeması geçersiz."];
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
    refineParsed: async (value, ask) => {
      const refined = await refineVerifiedChoices(
        asChoices(value.questions),
        ask,
        input.sourceExcerpt ?? "",
        3,
      );
      if (!refined) return null;
      const questions = input.teachingV2 ? repairQuizPedagogy(fromChoices(refined)) : fromChoices(refined);
      const ready = questions.filter((question) => !question.needsSolver).map((question) => {
        const { needsSolver: _drop, ...rest } = question;
        void _drop;
        return rest;
      });
      if (ready.length < 3) return null;
      if (input.teachingV2) {
        const issues = validateQuizPedagogy(ready, QUIZ_GATE);
        if (issues.length) {
          lastIssues = issues;
          return null;
        }
      }
      return { questions: ready };
    },
  });

  if (!outcome.ok) return outcome;
  return { ok: true, questions: outcome.data.questions };
}
