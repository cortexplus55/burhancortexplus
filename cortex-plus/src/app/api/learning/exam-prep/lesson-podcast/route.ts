import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { lessonPodcastBrief } from "@/lib/learning/podcast-from-lesson";
import { DEFAULT_PODCAST_LENGTH } from "@/lib/learning/podcast-formats";
import { runTeacherPodcast } from "@/lib/learning/teacher-podcast-run";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";

/**
 * Ders bitince önerilen sesli tekrar.
 *
 * Podcast planın öğrenme adımı olmaktan çıktı; öğrenci konuyu okuyup
 * bitirdikten sonra isterse dinliyor. Bu yüzden ayrı bir uç: plan düğümü
 * değil, dersin devamı. Ders yoksa podcast de yok — dinlenecek bir şey
 * kalmadığı gibi, olguyu ham PDF'ten ikinci kez çıkarma riski de geri
 * gelirdi.
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson-podcast", limit: 6 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, topicId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  // Sesli tekrar kayıtlı ücretsizde açık; üretim kredi yer. Misafir
  // withUser sayesinde buraya gelemez.
  const entitlements = await getUserEntitlements(service, userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  const { data: row } = await service
    .from("exam_prep_lessons")
    .select("content_json")
    .eq("topic_id", topicId)
    .not("content_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lesson = row?.content_json
    ? lessonV2Schema.safeParse(row.content_json).data ?? null
    : null;
  if (!lesson) return errorResponse(409, "lesson_required");

  // Öğretmen podcast motoru (3 Ekim 2026): dersin kendisi kaynak; belgeyle
  // eşleme ve modelin düzeltmesi. Eski tek-taslak zinciri kalktı.
  const outcome = await runTeacherPodcast(service, {
    mode: "document",
    length: DEFAULT_PODCAST_LENGTH,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    idempotencyKey: `lesson-podcast:${userId}:${topicId}:${crypto.randomUUID()}`,
    topicLabel: topic.label ?? "Konu",
    prepTitle: prep.title ?? "Hazırlık",
    pages: [],
    lessonText: lessonPodcastBrief(lesson),
  });
  if (!outcome.ok) {
    console.error("lesson podcast rejected", { topicId, reasons: outcome.reasons });
    return errorResponse(outcome.status, outcome.error);
  }

  return NextResponse.json({
    title: outcome.episode.title,
    chapters: outcome.episode.chapters,
  });
}
