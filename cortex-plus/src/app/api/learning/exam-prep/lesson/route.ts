import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { formatStructuredLesson } from "@/lib/learning/exam-lesson";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-lesson", limit: 16 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, sessionId, conversationId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  let convId = conversationId;
  if (!convId && sessionId) {
    const { data: session } = await service
      .from("exam_prep_sessions")
      .select("conversation_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    convId = session?.conversation_id ?? undefined;
  }

  if (!convId) {
    const { data: fallbackSession } = await service
      .from("exam_prep_sessions")
      .select("conversation_id")
      .eq("exam_prep_id", prepId)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    convId = fallbackSession?.conversation_id ?? undefined;
  }

  let transcript = "";
  if (convId) {
    const { data: rows } = await service
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(40);

    transcript = (rows ?? [])
      .filter((m) => typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map((m) => `${m.role === "user" ? "Öğrenci" : "Öğretmen"}: ${(m.content as string).trim()}`)
      .join("\n");
  }

  const { data: topics } = await service
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const topicLabels = (topics ?? []).map((t) => t.label as string);

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
    userPrompt: `Öğrenci için Türkçe, sınava hazırlık dersi yaz. Sınav: ${prep.title ?? "Hazırlık"} (${prep.exam_type ?? ""}). Konular: ${
      topicLabels.join(", ") || "genel tekrar"
    }. Sohbet notları:\n${transcript || "Sohbet henüz yok; konuları temelden anlat."}\n\nAnlatım + 1 çözümlü örnek + özet + sonraki odak. Astra tarzı ders notu; sohbet dökümü değil.`,
    parse: (raw) => {
      const result = lessonSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  const contentMd = outcome.ok
    ? formatStructuredLesson(outcome.data)
    : transcript
      ? transcript
          .split("\n")
          .map((line) =>
            line.startsWith("Öğrenci:")
              ? `**Sen:** ${line.slice(8).trim()}`
              : `**Cortex:** ${line.replace(/^Öğretmen:\s*/, "").trim()}`,
          )
          .join("\n\n")
      : `${prep.title ?? "Ders"} — anlatım henüz üretilemedi. Çalışma oturumuna dönüp birkaç soru sor.`;

  const title = outcome.ok
    ? outcome.data.title
    : `${prep.title ?? "Sınav"} · ders`;

  const { data: lesson, error: lessonError } = await service
    .from("exam_prep_lessons")
    .insert({
      exam_prep_id: prepId,
      title,
      content_md: contentMd,
      conversation_id: convId ?? null,
    })
    .select("id")
    .single();

  if (lessonError || !lesson) return errorResponse(500, "generation_failed");

  if (sessionId) {
    await service
      .from("exam_prep_sessions")
      .update({ lesson_id: lesson.id })
      .eq("id", sessionId)
      .eq("user_id", userId);
  } else {
    await service
      .from("exam_prep_sessions")
      .update({ lesson_id: lesson.id })
      .eq("exam_prep_id", prepId)
      .eq("user_id", userId)
      .eq("status", "active");
  }

  return NextResponse.json({ ok: true, lessonId: lesson.id });
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
