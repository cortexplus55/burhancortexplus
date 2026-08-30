import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getClassroomAccess } from "@/lib/student/classroom-access";

const bodySchema = z.object({
  classroomId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "classroom-post", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const access = await getClassroomAccess(service, parsed.data.classroomId, userId);
  if (!access.allowed || !access.room) return errorResponse(404, "not_found");

  const { data: post, error } = await service
    .from("classroom_posts")
    .insert({
      classroom_id: parsed.data.classroomId,
      user_id: userId,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error || !post) return errorResponse(500, "generation_failed");

  revalidatePath(`/siniflar/${parsed.data.classroomId}`);
  return NextResponse.json({ ok: true, postId: post.id });
}
