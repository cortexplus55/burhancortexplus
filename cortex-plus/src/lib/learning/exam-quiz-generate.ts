import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import type { ActionCode } from "@/lib/env";
import { coerceQuizQuestions, parseQuizQuestions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { repairQuizPedagogy, validateQuizPedagogy } from "@/lib/learning/teaching-standards";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";
import {
  refineVerifiedChoices,
  verifyChoiceQuestion,
  verifyChoiceSet,
  type VerifiedChoice,
} from "@/lib/learning/question-verifier";
import { quizClaimIssues } from "@/lib/learning/tutor-quant";
import { absoluteClaimIssues } from "@/lib/learning/absolute-claims";
import { exponentKeyWrong } from "@/lib/learning/exponent-key";
import { mathKeyWrong, mathOptionsAmbiguous } from "@/lib/learning/math-key";
import { unitCircleKeyWrong } from "@/lib/learning/unit-circle";

const QUIZ_GATE = {
  requireObjective: false,
  requireMisconceptionTag: true,
  requireDistractorRefutation: true,
} as const;

/*
  Deterministik kapının düşürdüğü soru için yeniden yazma notu. Eskiden
  ikinci taslak yalnızca "doğrulama tutmadı" duyuyordu; aynı kalıbı
  (ör. "Bu şık yanlıştır; (1, 1) olamaz.") yeniden yazıyordu.
*/
const DROP_GUIDANCE: Record<string, string> = {
  answer_key: "Cevap anahtarını hesapla yeniden doğrula.",
  equivalent_options: "İki şık aynı değeri ya da aynı noktaları farklı sırayla yazmasın.",
  option_why_restates:
    "Yanlış şık gerekçesi şıkkı tekrar edip 'olamaz' ya da 'değildir' demekle kalmasın; o şıkkın gerçekte ne olduğunu ya da hangi hatadan geldiğini yaz.",
  unit_circle_fact: "Birim çember noktalarını kontrol et (0° → (1, 0), 90° → (0, 1)); gerekçe doğru noktayı reddetmesin.",
};

export async function generateExamQuiz(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  userPrompt: string;
  difficulty?: "easy" | "medium" | "hard";
  verificationMode?: "full" | "schema";
  /** Stage 5: enforce pedagogy validators (fail closed via quality gate). */
  teachingV2?: boolean;
  /** Diagnostic retries stay within one credit reservation. */
  maxDraftAttempts?: 1 | 2 | 3;
  /** Verify each displayed explanation against its own option. */
  verifyOptionReasoning?: boolean;
  schemaHintExtra?: string;
  /** Stage 7: source excerpt for independent source checks. */
  sourceExcerpt?: string;
  requireSourceSupport?: boolean;
  sourcePages?: number[];
  /** Shared key if caller already reserved this user operation elsewhere. */
  idempotencyKey?: string;
  /** Yazılı deneme motoru PRACTICE_EXAM_GENERATE ile tek ücret keser. */
  actionCode?: ActionCode;
}): Promise<{ ok: true; questions: QuizQuestion[] } | { ok: false; status: number; error: string }> {
  const pedagogyHint = input.teachingV2
    ? " Her soruda learningObjective, explanation, misconceptionTag ve optionWhy zorunlu. optionWhy, options ile aynı uzunlukta; her şık için bir cümle (doğru şıkta gerekçe, diğerlerinde o şıkkın neden uymadığı). misconceptionTag, tuzakta adı geçen yanlış anlamın adı. multi yalnızca birden fazla bağımsız doğru varken. Yazamıyorsan optionReasons[şıkMetni] alanında O ŞIKKA özgü hata nedenini de ekleyebilirsin (hangi yanlış hesap o sayıyı verir); aynı cümleyi tekrarlama."
    : "";
  const schemaHint =
    'JSON: {"questions":[{"text":string,"options":string[],"correct":string|string[],"multi":boolean,"explanation":string,"learningObjective":string,"misconceptionTag":string,"optionWhy":string[],"steps":string[],"optionReasons":{"yanlışŞık":"neden"}}]}. correct, options içinden olmalı. steps yalnızca hesap ya da birden fazla ara sonuç isteyen soruda: 2-5 kısa adım, sırayla; her adım tek bir işlem ve kendi içinde doğru; son adım doğru şıkkın değerine varır. Tek adımda cevaplanan bilgi sorusunda steps yazma. optionWhy her şık için tek cümle, options ile aynı sırada. Yanlış şıkkın optionWhy satırı şıkkı tekrar edip "olamaz" ya da "değildir" demekle kalmasın; o şıkkın gerçekte ne olduğunu söylesin (ör. "(1, 0) 0°\'nin noktasıdır"). İki şık aynı değerleri ya da noktaları farklı sırayla yazmasın. Çoklu doğru şıklarda multi true, correct dizi ve en az iki bağımsız doğru seçenek olmalı; tek doğru varsa multi false olmalı. "Hepsi doğrudur", "hiçbiri" veya başka seçenekleri özetleyen seçenekler kullanma. Çeldirici, sorunun kavramına ait makul bir yanlış anlama olsun; soruda geçmeyen ve doğru şıkla aynı türden olmayan seçenek yazma. Doğru seçenek kümesi açıklamayla birebir uyuşmalı. Tek doğru cevabı olmayan ya da kendi içinde çözülemeyen soru yazma. "Hangisi doğrudur / hangisi özelliğidir" diye soruyorsan diğer şıkların her biri kesin yanlış olsun: iki doğru kuralı yan yana şık yapma; kural bir koşula bağlıysa (aynı taban, aynı üs gibi) koşulu şıkta ya da kökte yaz. Her soruyu matematiksel ve bilimsel doğruluk açısından ikinci kez kontrol et. explanation: 1-2 cümlelik net Türkçe çözüm gerekçesi.' +
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
      optionReasons: question.optionReasons,
      optionWhy: question.optionWhy,
      steps: question.steps,
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
      optionReasons: question.optionReasons,
      optionWhy: question.optionWhy,
      steps: question.steps,
      topic: question.topic,
      needsSolver: question.needsSolver,
    }));

  let lastIssues: string[] = [];
  let loggedCandidateFailure = false;
  const questionsFrom = (raw: unknown): QuizQuestion[] | null => {
    const parsed = parseQuizQuestions(raw) ?? coerceQuizQuestions(raw);
    if (!parsed) return null;
    const surfaced = parsed.map((question) => ({
      ...question,
      text: repairTurkishSurface(question.text),
      ...(question.explanation ? { explanation: repairTurkishSurface(question.explanation) } : {}),
      options: question.options.map((option) => repairTurkishSurface(option)),
      correct: question.correct.map((option) => repairTurkishSurface(option)),
      ...(question.learningObjective
        ? { learningObjective: repairTurkishSurface(question.learningObjective) }
        : {}),
      ...(question.optionWhy
        ? { optionWhy: question.optionWhy.map((line) => repairTurkishSurface(line)) }
        : {}),
      ...(question.steps ? { steps: question.steps.map((line) => repairTurkishSurface(line)) } : {}),
      ...(question.optionReasons
        ? {
            optionReasons: Object.fromEntries(
              Object.entries(question.optionReasons).map(([key, value]) => [
                key,
                repairTurkishSurface(value),
              ]),
            ),
          }
        : {}),
    }));
    // Cevap anahtarı hesapla çelişen tek cevaplı soru düşer ("(3⁴)²" için
    // 3¹², "sin 30°" için √3/2, "90°" için (1, 0) gibi). Bkz.
    // exponent-key.ts, math-key.ts, unit-circle.ts.
    const keyDrops: string[] = [];
    const keyed = surfaced.filter((question) => {
      if (question.multi) return true;
      const keyedCheck = {
        type: "mcq",
        prompt: question.text,
        options: question.options,
        answerIndex: question.options.indexOf(question.correct[0] ?? ""),
      };
      const reason =
        exponentKeyWrong(keyedCheck) === true ||
        mathKeyWrong(keyedCheck) === true ||
        unitCircleKeyWrong(keyedCheck) === true
          ? "answer_key"
          : mathOptionsAmbiguous(keyedCheck)
            ? "equivalent_options"
            : null;
      if (reason) keyDrops.push(reason);
      return !reason;
    });
    const repaired = input.teachingV2 ? repairQuizPedagogy(keyed) : keyed;
    // A six-question draft has spare candidates. Reject an unsupported
    // question on its own instead of discarding the entire valid batch.
    const grounded = input.requireSourceSupport && input.sourceExcerpt?.trim()
      ? repaired.filter((question) => absoluteClaimIssues({ questions: [question] }, input.sourceExcerpt).length === 0)
      : repaired;
    const verified = verifyChoiceSet(asChoices(grounded), input.sourceExcerpt ?? "", 3);
    if (!verified) {
      const outcomes = asChoices(grounded).map((question) => verifyChoiceQuestion(question, input.sourceExcerpt ?? ""));
      const reasons = [
        ...new Set([...keyDrops, ...outcomes.map((row) => row.reason).filter((reason): reason is string => Boolean(reason))]),
      ];
      // Eskiden yalnızca v2 yolunda yazılıyordu; tanışma testi (eski yol)
      // "structural" diye düştüğünde hangi sorunun neden elendiği görünmüyordu.
      if (!loggedCandidateFailure) {
        loggedCandidateFailure = true;
        console.warn("quiz_candidates_rejected", {
          parsed: parsed.length,
          keyDropped: keyDrops.length,
          grounded: grounded.length,
          kept: outcomes.filter((row) => row.status === "keep").length,
          unresolved: outcomes.filter((row) => row.status === "unresolved").length,
          dropped: outcomes.filter((row) => row.status === "drop").length,
          reasons,
        });
      }
      lastIssues = [
        "Bağımsız doğrulama soruyu tutmadı. Tek doğru cevabı olan yeni soru yaz.",
        ...reasons.flatMap((reason) => (DROP_GUIDANCE[reason] ? [DROP_GUIDANCE[reason]] : [])),
      ];
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
      const issues = [
        ...validateQuizPedagogy(questions, QUIZ_GATE),
        ...quizClaimIssues(questions, input.sourceExcerpt ?? ""),
      ];
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
    actionCode: input.actionCode ?? "QUIZ_GENERATE",
    isPremium: input.isPremium,
    difficulty: input.difficulty ?? (input.teachingV2 ? "hard" : undefined),
    verificationMode: input.verificationMode,
    validationProfile: input.teachingV2 ? "v2" : "legacy",
    idempotencyKey: input.idempotencyKey,
    maxDraftAttempts: input.maxDraftAttempts ?? (input.teachingV2 ? 2 : 1),
    allowIndependentAccept: false,
    activityKind: "quiz",
    /**
     * Bağımsız kapı temizse ileri denetçi açılmaz. Denetçi, doğru stokiyometri
     * sonucunu kaynakta yazmıyor diye reddedip taslağı ders şekline çeviriyordu;
     * ayrıştırıcı da bunu biçim hatası diye öğrenciye yazıyordu.
     */
    trustIndependent: input.teachingV2 && !input.verifyOptionReasoning ? true : undefined,
    reviewerAddendum: input.verifyOptionReasoning
      ? "Her sorunun kökünün belirli ve tek doğru yanıtı olup olmadığını, cevabın ve HER optionWhy satırının aynı sıradaki şıkla ve kaynakla doğruluğunu ayrı ayrı kontrol et. Bir ölçü birimini tek bir sabit değer sanan, bağlam vermeden 'hangi değer kullanılır' diyen veya birden fazla doğru yorumu olan soruyu reddet. Yanlış şık gerekçesindeki eşitlik, sayı, birim veya kavram hatasını onaylama. Yalnızca gerçek bilgi/ölçme hatasında approved false; üslup önerileri için approved true döndür. Hata varsa hangi soru/şıkta neyin yanlış olduğunu issues içinde açıkça yaz."
      : undefined,
    requireReviewerApproval: input.verifyOptionReasoning,
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
              ? [
                  ...validateQuizPedagogy(questions, QUIZ_GATE),
                  ...quizClaimIssues(questions, input.sourceExcerpt ?? ""),
                ]
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
        const issues = [
          ...validateQuizPedagogy(ready, QUIZ_GATE),
          ...quizClaimIssues(ready, input.sourceExcerpt ?? ""),
        ];
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
