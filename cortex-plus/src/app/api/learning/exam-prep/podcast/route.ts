import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { loadPrepDocumentIds, loadTopicTeaching } from "@/lib/documents/teacher-analysis-run";
import { lessonPodcastBrief } from "@/lib/learning/podcast-from-lesson";
import {
  loadPodcastCorpus,
  parsePodcastLength,
  PODCAST_LENGTHS,
  podcastScopeBrief,
  readPodcastCache,
  writePodcastCache,
} from "@/lib/learning/podcast-episode";
import {
  loadSourceContext,
  SourceUnavailableError,
} from "@/lib/learning/source-context";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { pagesMarkedInSource } from "@/lib/learning/source-context";
import { runTeacherPodcast } from "@/lib/learning/teacher-podcast-run";

/**
 * Yoldan bağımsız podcast. Düğüm durumuna dokunmaz; kilitli adım kilitli kalır.
 * Aynı hazırlık, konu ve süre önbellekten döner ve kredi yazılmaz.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  length: z.enum(PODCAST_LENGTHS).optional(),
  clientRequestId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-podcast", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const entitlements = await getUserEntitlements(service, userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, topicId } = parsed.data;
  const length = parsePodcastLength(parsed.data.length);
  const requestId = parsed.data.clientRequestId ?? null;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, document_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, lesson_id")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  const cached = await readPodcastCache(service, prepId, topic.label, length);
  if (cached) {
    return NextResponse.json({
      ok: true,
      title: cached.title,
      chapters: cached.chapters,
      length,
      reused: true,
    });
  }

  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const prepDocs = teachingV2 ? await loadPrepDocumentIds(service, prepId) : [];
  let topicDocumentId = (prep.document_id as string | null) ?? prepDocs[0] ?? null;
  let pageNumbers: number[] = [];

  const linked = await service
    .from("exam_prep_topics")
    .select("document_topic_node_id")
    .eq("id", topic.id)
    .maybeSingle();
  const documentTopicNodeId =
    !linked.error && typeof linked.data?.document_topic_node_id === "string"
      ? linked.data.document_topic_node_id
      : null;
  if (documentTopicNodeId) {
    const { data: topicNode } = await service
      .from("document_topic_nodes")
      .select("document_id")
      .eq("id", documentTopicNodeId)
      .maybeSingle();
    if (topicNode?.document_id) topicDocumentId = topicNode.document_id as string;
    const pages = await service
      .from("document_topic_page_links")
      .select("page_number")
      .eq("topic_id", documentTopicNodeId);
    if (!pages.error && Array.isArray(pages.data)) {
      pageNumbers = pages.data
        .map((row) => Number(row.page_number))
        .filter((page) => Number.isInteger(page) && page > 0);
    }
  }

  /*
    Öğretmen podcast motoru (3 Ekim 2026): konunun bitişik çekirdek sayfaları
    temiz metinle + aynı konunun dersi; belgeyle eşleme, modelin düzeltmesi.
    Eski taslak + satır silen zincir kalktı. Belge yoksa belgesiz kip.
  */
  if (!pageNumbers.length && topicDocumentId) {
    try {
      const found = await loadSourceContext(service, userId, `${prep.title ?? ""} ${topic.label}`, {
        documentId: topicDocumentId,
        sourceBoundaryMode: "documents_only",
      });
      pageNumbers = pagesMarkedInSource(found.block);
    } catch (error) {
      console.error("podcast_source_unavailable", {
        requestId,
        topic: topic.label,
        code: error instanceof SourceUnavailableError ? "source_unavailable" : "source_failed",
      });
    }
  }
  if (topicDocumentId && !pageNumbers.length) {
    console.error("podcast_source_unavailable", { requestId, topic: topic.label, code: "empty" });
    return errorResponse(503, "source_unavailable");
  }
  const edges = topicDocumentId ? await documentRunningHeaders(service, topicDocumentId) : [];
  const clean = topicDocumentId
    ? await ensureCleanPages(service, {
        userId,
        documentId: topicDocumentId,
        pages: corePageRun(pageNumbers),
        edges,
      })
    : [];

  const teaching = teachingV2
    ? await loadTopicTeaching(
        service,
        topicDocumentId ? [topicDocumentId, ...prepDocs] : prepDocs,
        topic.label,
      )
    : null;
  const corpus = await loadPodcastCorpus(service, userId, prepId, topic.label);

  let lessonBrief = "";
  if (topic.lesson_id) {
    const { data: lesson } = await service
      .from("exam_prep_lessons")
      .select("content_json")
      .eq("id", topic.lesson_id)
      .maybeSingle();
    const structured = lessonV2Schema.safeParse(lesson?.content_json);
    if (structured.success) lessonBrief = lessonPodcastBrief(structured.data);
  }

  const outcome = await runTeacherPodcast(service, {
    mode: topicDocumentId ? "document" : "topic",
    length,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    idempotencyKey: `podcast:${userId}:${prepId}:${topicId}:${length}:${requestId ?? crypto.randomUUID()}`,
    topicLabel: topic.label,
    prepTitle: prep.title ?? "Hazırlık",
    pages: clean.map((item) => ({ page: item.page, text: item.text })),
    lessonText: lessonBrief || undefined,
    syllabusLine:
      [
        teachingV2
          ? await podcastScopeBrief(service, prepDocs, topic.label, teaching?.priority ?? null)
          : "",
        corpus.syllabus,
      ]
        .filter(Boolean)
        .join("\n") || undefined,
    runningHeaders: edges,
  });

  if (!outcome.ok) {
    console.error("podcast_generation_failed", {
      requestId,
      code: outcome.error,
      reasons: outcome.reasons,
    });
    return errorResponse(outcome.status, outcome.error, { refunded: true });
  }

  await writePodcastCache(service, {
    prepId,
    userId,
    topicLabel: topic.label,
    episode: outcome.episode,
  });

  return NextResponse.json({
    ok: true,
    title: outcome.episode.title,
    chapters: outcome.episode.chapters,
    length,
    reused: false,
  });
}
