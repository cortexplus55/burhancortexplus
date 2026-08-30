import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { continueHref } from "@/lib/learning/exam-prep-progress";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  action: z.enum(["complete", "reopen"]).default("complete"),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-topic", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, topicId, action } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id")
    .eq("id", topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();

  if (!topic) return errorResponse(404, "not_found");

  const { error } = await service
    .from("exam_prep_topics")
    .update(
      action === "complete"
        ? { status: "done", completed_at: new Date().toISOString() }
        : { status: "in_progress", completed_at: null },
    )
    .eq("id", topicId);

  if (error) return errorResponse(500, "generation_failed");

  const { data: rows } = await service
    .from("exam_prep_topics")
    .select("id, label, sort_order, status, lesson_id")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const topics = (rows ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    sortOrder: row.sort_order as number,
    status: (row.status as "ready" | "in_progress" | "done") ?? "ready",
    lessonId: (row.lesson_id as string | null) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    nextHref: continueHref(prepId, topics),
  });
}
