import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getClassroomAccess } from "@/lib/student/classroom-access";

const bodySchema = z.object({
  classroomId: z.string().uuid(),
  prepId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "classroom-share-prep", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const access = await getClassroomAccess(service, parsed.data.classroomId, userId);
  if (!access.allowed || !access.room) return errorResponse(404, "not_found");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { error } = await service
    .from("exam_preps")
    .update({ classroom_id: parsed.data.classroomId })
    .eq("id", prep.id)
    .eq("user_id", userId);

  if (error) return errorResponse(500, "generation_failed");

  revalidatePath(`/siniflar/${parsed.data.classroomId}`);
  revalidatePath("/siniflar");
  return NextResponse.json({ ok: true });
}
