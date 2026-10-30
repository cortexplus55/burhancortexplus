/** Öğrenciye giden gövde: cevap anahtarı mühürlenir, ders biçimi istemcinin okuduğuna çevrilir, metin süzgeçten geçer. */
import "server-only";
import { podcastCheckOf } from "@/lib/learning/podcast-check";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { studentSafePayload } from "@/lib/learning/student-safe-text";
import type { OralQuestionDraft } from "@/lib/learning/oral-exam";
import { normalizeQuizQuestion, publicQuizQuestion, sealedQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { cardsAsShown, type LessonReviewCard } from "@/lib/learning/teaching-standards";
import { sealStoredLesson } from "@/lib/learning/lesson-play-v3";
import { isAdminUser } from "@/lib/auth/roles";
import { prepLanguage } from "@/lib/learning/teacher-brain";

/** Ekrana giden kart listesi notlandırmanınkiyle aynı işlevden (`cardsAsShown`, 30 Ekim 2026). */
export function withLessonReviewCards(
  payload: Record<string, unknown>,
  reviewCards: LessonReviewCard[],
) {
  return cardsAsShown(payload, reviewCards);
}

export async function publicPayloadForUser(
  service: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
  reviewCards: LessonReviewCard[] = [],
  nodeKind?: PlanNodeKind,
  language: ReturnType<typeof prepLanguage> = "tr",
  lessonFormat: 2 | 3 = 2,
) {
  const isLesson = payload.type === "lesson";
  const isAdmin = isLesson ? await isAdminUser(service, userId) : false;
  return studentSafePayload(publicNodePayload(payload, reviewCards, nodeKind, { isAdmin, language, lessonFormat }), {
    keepQualityReport: isAdmin,
  });
}

export function publicNodePayload(
  payload: Record<string, unknown>,
  reviewCards: LessonReviewCard[] = [],
  nodeKind?: PlanNodeKind,
  options: {
    isAdmin?: boolean;
    qualityReport?: { rule: string; excerpt: string }[];
    language?: ReturnType<typeof prepLanguage>;
    lessonFormat?: 2 | 3;
  } = {},
) {
  const decorated = withLessonReviewCards(payload, reviewCards);
  if (decorated.type === "oral") {
    const questions = ((decorated.questions as OralQuestionDraft[]) ?? []).map((question) => {
      const { expectedPoints, rubricCriteria, learningObjective, ...visible } = question;
      void expectedPoints;
      void rubricCriteria;
      void learningObjective;
      return visible;
    });
    return { ...decorated, questions };
  }
  if (decorated.type === "lesson" && decorated.lesson && typeof decorated.lesson === "object") {
    const sealed = sealStoredLesson(decorated.lesson, {
      language: options.language ?? "tr",
      format: options.lessonFormat ?? 2,
    });
    if (!sealed) return { ...decorated, lesson: undefined, qualityReport: undefined };
    const report =
      options.qualityReport ??
      (Array.isArray(decorated.qualityReport)
        ? (decorated.qualityReport as { rule: string; excerpt: string }[])
        : undefined);
    return {
      ...decorated,
      lesson: {
        ...sealed,
        ...(options.isAdmin && report?.length ? { qualityReport: report } : {}),
      },
      // Kalite raporu kökte kalmasın; yalnız kurucu dersine gömülür.
      qualityReport: undefined,
    };
  }
  // Dinleme kontrolü testteki gibi anında geri bildirimli: doğru şık istemciye gider (20 Ekim 2026).
  if (decorated.type === "podcast") {
    const check = podcastCheckOf(decorated);
    return check.length ? { ...decorated, check: check.map(publicQuizQuestion) } : decorated;
  }
  if (decorated.type !== "quiz") return decorated;
  const seal = nodeKind === "written_exam";
  // İstemci notlandırmanın okuduğu biçimi görür (30 Ekim 2026, Paket I #7): `scoreAttempt` soruyu
  // `normalizeQuizQuestion` ile okuyor (kırpılmış şık, harften çözülmüş doğru); ekran ham soruyu görünce
  // anında geri bildirimdeki "Doğru" ile kayıtlı puan ayrışıyordu. Okunamayan soru ham hâliyle kalır.
  const questions = ((decorated.questions as QuizQuestion[]) ?? []).map((raw) => {
    const question = normalizeQuizQuestion(raw as Parameters<typeof normalizeQuizQuestion>[0]) ?? raw;
    return seal ? sealedQuizQuestion(question) : publicQuizQuestion(question);
  });
  return { ...decorated, questions };
}
