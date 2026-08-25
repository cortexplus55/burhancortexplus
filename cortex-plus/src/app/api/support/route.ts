import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(4000),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "support", limit: 5 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { error } = await service.from("support_requests").insert({
    user_id: userId,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  if (error) return errorResponse(500, "generation_failed");

  await auditLog(service, {
    actorId: userId,
    action: "support.created",
    entityType: "support_request",
  });

  return NextResponse.json({ ok: true });
}
