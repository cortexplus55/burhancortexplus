import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { generatePodcastFromLesson } from "@/lib/learning/podcast-from-lesson";
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

  // Ses üretimi podcast maliyetinin %98,4'ü; Plus'a özel. 10 Eylül'de
  // dersten türeyen içeriği canlıda görebilmek için geçici olarak
  // kaldırılmıştı, doğrulama bitince geri kondu.
  const premium = await isPremiumUser(service, userId);
  if (!premium) return errorResponse(402, "premium_required");

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

  // Reddedilen taslakların gerekçesi. Podcast üretimi bir kez susarak
  // tıkandı ve altı tur tahminle uğraşıldı; ölçüm sebebi tek turda
  // buldu. Gerekçe logda kalıyor, yanıta girmiyor: doğrulayıcının iç
  // mesajı öğrencinin göreceği bir şey değil.
  const rejections: string[][] = [];

  const outcome = await generatePodcastFromLesson({
    service,
    userId,
    isPremium: premium,
    prepTitle: prep.title ?? "Hazırlık",
    topicLabel: topic.label ?? "Konu",
    lesson,
    onReject: (issues) => rejections.push(issues),
  });
  if (!outcome.ok) {
    console.error("lesson podcast rejected", {
      topicId,
      attempts: rejections.length,
      rejections,
    });
    return errorResponse(outcome.status, outcome.error);
  }

  return NextResponse.json({
    title: outcome.data.title,
    chapters: outcome.data.chapters,
  });
}
