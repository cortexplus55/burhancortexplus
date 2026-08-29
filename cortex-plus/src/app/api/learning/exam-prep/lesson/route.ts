import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

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
    .select("id, title")
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

  let contentMd = "";
  if (convId) {
    const { data: rows } = await service
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(40);

    const lines = (rows ?? [])
      .filter((m) => typeof m.content === "string" && m.content.trim())
      .map((m) => `**${m.role === "user" ? "Sen" : "Cortex"}:** ${(m.content as string).trim()}`);

    contentMd = lines.slice(-12).join("\n\n");
  }

  if (!contentMd.trim()) {
    contentMd = `${prep.title ?? "Ders"} oturumu — sohbet özeti henüz yok.`;
  }

  const title = `${prep.title ?? "Sınav"} · ders`;

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
