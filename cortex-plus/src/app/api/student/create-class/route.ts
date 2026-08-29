import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({ name: z.string().min(2).max(80) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const service = createServiceClient();
  const joinCode = randomBytes(3).toString("hex").toUpperCase();
  const { data: classroom, error } = await service
    .from("classrooms")
    .insert({
      teacher_id: user.id,
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
    student_id: user.id,
  });

  return NextResponse.json({ ok: true, joinCode, classroomId: classroom.id });
}
