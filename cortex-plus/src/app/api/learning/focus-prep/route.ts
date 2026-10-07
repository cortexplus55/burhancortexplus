import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { focusPrepCookieHeader } from "@/lib/learning/focus-prep";

const bodySchema = z.object({
  prepId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "learning-focus-prep",
    limit: 60,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", focusPrepCookieHeader(parsed.data.prepId));
  return response;
}
