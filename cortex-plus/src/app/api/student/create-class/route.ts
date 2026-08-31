import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api/guards";

const bodySchema = z.object({ name: z.string().min(2).max(80) });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "create-class", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const joinCode = randomBytes(3).toString("hex").toUpperCase();
  const { data: classroom, error } = await service
    .from("classrooms")
    .insert({
      teacher_id: userId,
      name: parsed.data.name.trim(),
      join_code: joinCode,
    })
    .select("id")
    .single();

  if (error || !classroom) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await service.from("classroom_members").insert({
    classroom_id: classroom.id,
    student_id: userId,
  });

  revalidatePath("/siniflar");
  return NextResponse.json({ ok: true, joinCode, classroomId: classroom.id });
}
