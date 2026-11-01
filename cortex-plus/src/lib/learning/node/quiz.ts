/** Konu testi ve tuzak testi (zayıf nokta): öğretmen test motoru. */
import "server-only";
import { loadOfficialOutcome } from "@/lib/curriculum/prep-outcome";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { runTeacherQuiz } from "@/lib/learning/teacher-quiz-run";
import { quizDifficulty } from "@/lib/learning/teacher-quiz";
import { lessonBackbone } from "@/lib/learning/lesson-backbone";
import { loadPreviousItems } from "@/lib/learning/previous-items";
import { practiceCoverage, practiceVariantFromTitle } from "@/lib/learning/practice-coverage";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { teachingActivityForKind } from "@/lib/learning/teaching-standards";
import { quizOpenStagesLog } from "@/lib/learning/quiz-delivery";
import { NodeGenerationError, actionForKind } from "./shared";
import { withSupport, type LessonCore } from "./teacher-pages";
import type { NodePayloadInput } from "./generate";

/**
 * Öğretmen test motoru (2 Ekim 2026): temiz çekirdek sayfalar → tek öğretmen
 * istemi → soruları bağımsız çözen denetim → sorunlu sorunun modelce
 * düzeltilmesi. Kod soru metnine bir şey eklemez; yeterli soru çıkmazsa
 * kredi iade, test gösterilmez.
 */

export async function teacherQuizPayload(
  input: NodePayloadInput,
  activity: ReturnType<typeof teachingActivityForKind>,
  /** null: belgesiz hazırlık; sorular konunun yerleşik bilgisinden. */
  core: LessonCore | null,
  count: number,
) {
  const startedAt = input.requestStartedAt ?? Date.now();
  const edges = core ? await documentRunningHeaders(input.service, core.documentId) : [];
  const clean = core
    ? await ensureCleanPages(input.service, {
        userId: input.userId,
        documentId: core.documentId,
        pages: corePageRun(core.pages),
        edges,
      })
    : [];
  // Tekrar yasağı ve test dilimi (25 Ekim 2026, canlı test P1-2): önceki kökler yazara yasak listesi,
  // konu testinin varyantı konunun alt başlıklarından başka bir dilim.
  // Etkinlikler arası (30 Ekim 2026, Paket I #8): önerme, kart, sözlü sorusu ve yoklanan bölüm de listede; bu
  // konunun öğeleri önce.
  const previousStems =
    input.prepId && input.userId
      ? await loadPreviousItems(input.service, {
          userId: input.userId,
          prepId: input.prepId,
          kind: "quiz",
          excludeNodeId: input.nodeId ?? null,
          topic: input.topicLabel,
          topicId: input.topicId ?? null,
        })
      : [];
  const variant = input.sessionMeta?.practiceVariant ?? practiceVariantFromTitle(input.nodeTitle);
  const coverage =
    input.kind === "quiz"
      ? practiceCoverage(variant, lessonBackbone(clean, { topicLabel: input.topicLabel, runningHeaders: edges }))
      : undefined;
  const outcome = await runTeacherQuiz(input.service, {
    mode: core ? "document" : "topic",
    focus: input.kind === "gaps" ? "gaps" : "practice",
    previousStems,
    ...(coverage ? { coverage } : {}),
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `quiz:${input.prepId ?? "x"}:${input.topicLabel}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    topicLabel: input.topicLabel,
    prepTitle: input.prepTitle,
    pages: withSupport(clean, core),
    count,
    learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
    examPoints: input.examPoints,
    runningHeaders: edges,
    officialOutcome: await loadOfficialOutcome(input.service, input.prepId, input.topicLabel),
    difficulty: quizDifficulty(input.requestedDifficulty),
    // Konu testinde bir soru çok cevaplı (17 Ekim 2026, Astra'daki gibi); tuzak testi tek cevaplı.
    multi: input.kind === "quiz" && count >= 5,
    // Yoldaki konu testinin kuralları ve dersi (20 Ekim 2026); tuzak testi (gaps) bugünkü gibi.
    scope: input.kind === "quiz" ? "topic_test" : undefined,
    lesson: input.kind === "quiz" ? (input.lessonQuiz ?? undefined) : undefined,
    // Öğrenci bekliyor: pedagojik ince ayar turu yok (önceden yazım bütün turları koşar).
    urgent: input.charge !== false,
    startedAt,
    onPlayable:
      input.kind === "quiz" && input.onLessonPublish && input.charge !== false
        ? (questions) => {
            if (!questions.length) return;
            void input.onLessonPublish?.({
              type: "quiz",
              questions: questions.slice(0, count),
              promised: count,
              teachingStandard: activity,
              engine: "teacher",
            });
          }
        : undefined,
  });
  if (outcome.ok) {
    console.info(
      "quiz_open_stages",
      quizOpenStagesLog({
        topic: input.topicLabel,
        kind: input.kind,
        stages: outcome.stages,
        kept: outcome.questions.length,
        streamed: Boolean(input.kind === "quiz" && input.onLessonPublish && input.charge !== false),
        prefetched: input.charge === false,
      }),
    );
  }
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  // Pedagojik sorunu düzelmeden geri konan soru: test öğrenciye gider, neden yönetimde görünsün.
  if (outcome.softKept) {
    await recordLessonGenerationFailure(input.service, {
      userId: input.userId,
      prepId: input.prepId ?? null,
      topicId: input.topicId ?? null,
      topicLabel: input.topicLabel,
      kind: "quiz",
      stage: "set",
      reason: "pedagogy_salvaged",
      reasons: [`${outcome.softKept} soru düzelmeden geri kondu`, ...(outcome.salvaged ?? [])],
    });
  }
  return { type: "quiz", questions: outcome.questions, teachingStandard: activity, engine: "teacher" };
}
