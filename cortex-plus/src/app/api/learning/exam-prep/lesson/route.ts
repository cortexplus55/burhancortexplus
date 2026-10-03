import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

/*
  Eski konu dersi üretimi (POST) 3 Ekim 2026'da silindi: dersler hazırlığın
  yolundaki düğümlerden öğretmen motoruyla gelir. Kayıtlı derslerin
  "beğendim" işareti burada kalıyor.
*/

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
