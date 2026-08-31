import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api/guards";

const bodySchema = z.object({ name: z.string().min(2).max(80) });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "bootstrap-class", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const joinCode = randomBytes(3).toString("hex").toUpperCase();
  const { error } = await service.from("classrooms").insert({
    teacher_id: userId,
    name: parsed.data.name,
    join_code: joinCode,
  });

  if (error) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, joinCode });
}
