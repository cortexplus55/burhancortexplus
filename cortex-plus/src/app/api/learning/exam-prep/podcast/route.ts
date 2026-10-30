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
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { pagesMarkedInSource } from "@/lib/learning/source-context";
import { runTeacherPodcast } from "@/lib/learning/teacher-podcast-run";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { publicQuizQuestion } from "@/lib/learning/exam-quiz";

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
  /**
   * Ders sonu "Şimdi dinle" (`lesson-podcast`) false gönderir (30 Ekim 2026, Paket I #9): o yolda dinleme kontrolü
   * yok (20 Ekim kararı: ~20-35 sn bekleme, yeni bir şey ölçmez). Kontrolsüz bölüm önbelleğe YAZILMAZ; yoksa yoldaki
   * podcast adımı o konunun kontrolünü kaybederdi. Önbellekte bölüm varsa ikisi de onu alır.
   */
  listeningCheck: z.boolean().optional(),
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
  const withCheck = parsed.data.listeningCheck !== false;

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
      check: cached.check.map(publicQuizQuestion),
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
    const structured = readLessonV2(lesson?.content_json);
    if (structured) lessonBrief = lessonPodcastBrief(structured);
  }

  const outcome = await runTeacherPodcast(service, {
    mode: topicDocumentId ? "document" : "topic",
    length,
    userId,
    actionCode: "PODCAST_GENERATE",
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
    // Dinleme kontrolü (20 Ekim 2026): bu sayfa göstermez, önbelleğe yazar; aynı konunun yol
    // düğümü önbellekten kontrollü (puanlı, kanıtlı) açılır.
    listeningCheck: withCheck,
  });

  if (!outcome.ok) {
    console.error("podcast_generation_failed", {
      requestId,
      code: outcome.error,
      reasons: outcome.reasons,
    });
    // Kalıcı kayıt (30 Ekim 2026, Paket I #9): ders sonu "Şimdi dinle" de bu hattan; düşüş /admin/ders-hatalari'nda görünsün.
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic.id,
      topicLabel: topic.label,
      kind: "podcast",
      stage: "podcast",
      reason: outcome.error,
      reasons: outcome.reasons,
    });
    return errorResponse(outcome.status, outcome.error, { refunded: true });
  }

  if (withCheck) await writePodcastCache(service, {
    prepId,
    userId,
    topicLabel: topic.label,
    episode: outcome.episode,
    check: outcome.check,
  });

  return NextResponse.json({
    ok: true,
    title: outcome.episode.title,
    chapters: outcome.episode.chapters,
    length,
    reused: false,
    check: outcome.check.map(publicQuizQuestion),
  });
}
