/** Podcast: öğretmen podcast motoru ve dinleme kontrolü. */
import "server-only";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { runTeacherPodcast } from "@/lib/learning/teacher-podcast-run";
import { sessionSignalsPrompt } from "@/lib/learning/session-signals";
import { lessonPodcastBrief } from "@/lib/learning/podcast-from-lesson";
import type { PodcastLength } from "@/lib/learning/podcast-episode";
import { prepTopicLabels, prepTopicScopeLine } from "@/lib/documents/generation-context";
import { ALL_TOPICS_LABEL } from "@/lib/learning/prep-wide-target";
import { NodeGenerationError, actionForKind } from "./shared";
import { withSupport, type LessonCore } from "./teacher-pages";
import type { NodePayloadInput } from "./generate";

/**
 * Öğretmen podcast motoru (2 Ekim 2026): aynı konunun denetlenmiş dersi +
 * temiz çekirdek sayfalar → tek öğretmen istemi → belgeyle eşleme → modelin
 * düzeltmesi. Sorun kalırsa podcast gösterilmez, kredi iade.
 */
export async function teacherPodcastEpisode(
  input: NodePayloadInput,
  core: LessonCore | null,
  length: PodcastLength,
) {
  const startedAt = Date.now();
  const edges = core ? await documentRunningHeaders(input.service, core.documentId) : [];
  const clean = core
    ? await ensureCleanPages(input.service, {
        userId: input.userId,
        documentId: core.documentId,
        pages: corePageRun(core.pages),
        edges,
      })
    : [];
  // Belgeli podcast hazırlığın öbür konularının kısımlarını bölüm yapmaz; sayfada kalan her şey bu konunundur (`prepTopicScopeLine`).
  const siblings = core && input.prepId && input.topicLabel !== ALL_TOPICS_LABEL ? await prepTopicLabels(input.service, input.prepId) : [];
  const outcome = await runTeacherPodcast(input.service, {
    mode: core ? "document" : "topic",
    length,
    userId: input.userId,
    actionCode: actionForKind(input.kind),
    idempotencyKey: input.idempotencyKey ?? `podcast:${input.prepId ?? "x"}:${input.topicLabel}:${length}:${Date.now()}`,
    freeMeter: input.freeMeter,
    charge: input.charge,
    topicLabel: input.topicLabel,
    prepTitle: input.prepTitle,
    pages: withSupport(clean, core),
    lessonText: input.lessonContent ? lessonPodcastBrief(input.lessonContent) : undefined,
    syllabusLine:
      [input.grounding?.trim() ?? "", siblings.length ? prepTopicScopeLine(input.topicLabel, siblings) : ""]
        .filter(Boolean)
        .join("\n") || undefined,
    learnerLine: sessionSignalsPrompt(input.familiarity, input.mood),
    examPoints: input.examPoints,
    runningHeaders: edges,
    startedAt,
    // Dinleme kontrolü (20 Ekim 2026): senaryodan üç soru; yazılamazsa podcast kontrolsüz gelir.
    listeningCheck: true,
    // Öğrenci bekliyorsa kontrol yayımdan sonra yazılır (30 Ekim 2026); önceden yazımda bugünkü gibi birlikte.
    deferListeningCheck: input.charge !== false && Boolean(input.onPodcastCheckLater),
  });
  if (!outcome.ok) throw new NodeGenerationError(outcome.status, outcome.error, outcome.reasons);
  if (outcome.checkLater) input.onPodcastCheckLater?.(outcome.checkLater);
  return { episode: outcome.episode, check: outcome.check, deferred: Boolean(outcome.checkLater) };
}
