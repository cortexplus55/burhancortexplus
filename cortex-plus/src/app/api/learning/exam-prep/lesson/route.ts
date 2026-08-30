import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { formatStructuredLesson } from "@/lib/learning/exam-lesson";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson", limit: 16 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, topicId, force } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, lesson_id, status")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();

  if (!topic) return errorResponse(404, "not_found");

  if (topic.lesson_id && !force) {
    return NextResponse.json({ ok: true, lessonId: topic.lesson_id, reused: true });
  }

  const lessonSchema = z.object({
    title: z.string().min(2).max(120),
    overview: z.string().min(20),
    sections: z
      .array(z.object({ heading: z.string().min(2), body: z.string().min(20) }))
      .min(2)
      .max(5),
    example: z.object({
      prompt: z.string().min(8),
      solution: z.string().min(8),
    }),
    summary: z.array(z.string().min(2)).min(2).max(6),
    nextFocus: z.array(z.string().min(2)).min(1).max(4),
  });

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca JSON: {"title":string,"overview":string,"sections":[{"heading":string,"body":string}],"example":{"prompt":string,"solution":string},"summary":string[],"nextFocus":string[]}',
    userPrompt: `Öğrenci için Türkçe, tek konuluk sınav hazırlık dersi yaz.
Sınav: ${prep.title ?? "Hazırlık"} (${prep.exam_type ?? ""}).
Bu dersin konusu YALNIZCA: ${topic.label}.
Başka konulara sapma. Anlatım + 1 çözümlü örnek + özet + sonraki odak.`,
    parse: (raw) => {
      const result = lessonSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  const contentMd = outcome.ok
    ? formatStructuredLesson(outcome.data)
    : `## ${topic.label}\n\nBu konu için anlatım henüz üretilemedi. Tekrar dene.`;
  const title = outcome.ok ? outcome.data.title : topic.label;

  const { data: lesson, error: lessonError } = await service
    .from("exam_prep_lessons")
    .insert({
      exam_prep_id: prepId,
      topic_id: topicId,
      title,
      content_md: contentMd,
    })
    .select("id")
    .single();

  if (lessonError || !lesson) return errorResponse(500, "generation_failed");

  await service
    .from("exam_prep_topics")
    .update({
      lesson_id: lesson.id,
      status: topic.status === "done" ? "done" : "in_progress",
    })
    .eq("id", topicId)
    .eq("exam_prep_id", prepId);

  return NextResponse.json({ ok: true, lessonId: lesson.id, reused: false });
}

const patchSchema = z.object({
  lessonId: z.string().uuid(),
  liked: z.boolean(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson-like", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: lesson } = await service
    .from("exam_prep_lessons")
    .select("id, exam_prep_id")
    .eq("id", parsed.data.lessonId)
    .maybeSingle();

  if (!lesson) return errorResponse(404, "not_found");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", lesson.exam_prep_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { error } = await service
    .from("exam_prep_lessons")
    .update({ liked: parsed.data.liked })
    .eq("id", lesson.id);

  if (error) return errorResponse(500, "generation_failed");

  return NextResponse.json({ ok: true, liked: parsed.data.liked });
}
