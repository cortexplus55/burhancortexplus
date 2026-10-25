import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { billingExempt } from "@/lib/billing/free-preview";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { prepTopicSource } from "@/lib/learning/prep-topic-source";
import { resolveVideoStyle } from "@/lib/learning/video-lesson";
import { runVideoLesson } from "@/lib/learning/video-run";
import { loadPrepDocumentIds, loadTopicTeaching } from "@/lib/documents/teacher-analysis-run";

export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  style: z.string().optional(),
  visualStyle: z.string().optional(),
  clientRequestId: z.string().uuid().optional(),
});

/**
 * Video ders üretimi (17 Ekim 2026, Astra'daki gibi; yalnız Plus). Senaryo, sahne
 * resimleri ve sesleri tek işte; olmazsa kredi iade. Dönen kimlikle oynatıcı açılır.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-video", limit: 4, dailyLimit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const entitlements = await getUserEntitlements(service, userId);
  if (!requireFeature(entitlements, "video") && !(await billingExempt(service, userId))) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, topicId } = parsed.data;
  const style = resolveVideoStyle(parsed.data.visualStyle ?? parsed.data.style);

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, document_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");
  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  const source = await prepTopicSource(service, {
    userId,
    prepId,
    prepTitle: String(prep.title ?? ""),
    prepDocumentId: (prep.document_id as string | null) ?? null,
    topicId,
    topicLabel: String(topic.label),
  });
  if (!source) return errorResponse(503, "source_unavailable");

  // "Öğretmen gözü" (18 Ekim 2026): sahnelerin kilit bilgileri "Sınavda sorulur" maddelerinden.
  const teaching =
    source.mode === "topic"
      ? null
      : await loadTopicTeaching(
          service,
          await loadPrepDocumentIds(service, prepId).catch(() => [] as string[]),
          String(topic.label),
          source.pages.map((page) => page.page),
        ).catch(() => null);

  const outcome = await runVideoLesson(service, {
    userId,
    prepId,
    topicId,
    topicLabel: String(topic.label),
    prepTitle: String(prep.title ?? "Hazırlık"),
    mode: source.mode,
    pages: source.pages,
    examPoints: teaching?.examPoints ?? [],
    style,
    idempotencyKey: `video:${userId}:${prepId}:${topicId}:${style}:${parsed.data.clientRequestId ?? crypto.randomUUID()}`,
  });
  if (!outcome.ok) {
    console.error("video_generation_failed", { code: outcome.error, reasons: outcome.reasons });
    return errorResponse(outcome.status, outcome.error, { refunded: true });
  }
  return NextResponse.json({ ok: true, videoId: outcome.videoId });
}
