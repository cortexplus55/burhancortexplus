/**
 * Açılışın (`action: "start"`) aşamalar arasında taşıdığı değerler. Bağlamdan gelenler (`NodeContext`) açılışta
 * değişebilir (konu yönlendirme, yerel oturumun seçtiği konu); aşama modülleri yalnız okuduklarını alır.
 */
import "server-only";
import type { FreeMeter } from "@/lib/billing/free-meters";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import type { LessonQuizContext } from "@/lib/learning/lesson-quiz-context";
import type { prefetchVariant } from "@/lib/learning/lesson-prefetch";
import type { AttemptRow } from "@/lib/learning/attempt-lifecycle-persist";
import type { NodeContext } from "./context";

/** Son kontrolün hazır soruları ve sorusu olmayan konular (konu başına üretim). */
export type FinalFill = { seed: QuizQuestion[]; topics: string[]; perTopic: number; previousStems?: string[] };

export type StartLocals = {
  sessionMeta: NodeContext["sessionMeta"];
  topic: NodeContext["topic"];
  topicDocumentId: NodeContext["topicDocumentId"];
  topicNodeId: NodeContext["topicNodeId"];
  topicSourceRefs: NodeContext["topicSourceRefs"];
  topicLabel: NodeContext["topicLabel"];
  topicWiden: NodeContext["topicWiden"];
  title: NodeContext["title"];
  /** Önceden yazımın ısınma isteği. */
  warm: boolean;
  /** Ders konuya kaydedilince sıradaki konu testini derse göre yeniler. */
  refreshTopicQuiz: (topicId: string | null | undefined) => void;
  clientRequestId: string | undefined;
  existingForKey: AttemptRow | null;
  voiceSession: boolean;
  premium: boolean;
  freeMeter: FreeMeter | null;
  practiceTopics: string[] | undefined;
  finalFill: FinalFill | null;
  retargetedTopic: string | null;
  quizLesson: LessonQuizContext | null;
  variant: ReturnType<typeof prefetchVariant>;
  peekBuildingMs: number | null;
};

