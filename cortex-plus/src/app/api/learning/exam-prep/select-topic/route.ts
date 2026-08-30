import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-select-topic", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, intro_completed_at")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id")
    .eq("id", parsed.data.topicId)
    .eq("exam_prep_id", parsed.data.prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  await service
    .from("exam_preps")
    .update({ active_topic_id: topic.id })
    .eq("id", prep.id);

  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, status")
    .eq("exam_prep_id", prep.id)
    .order("sort_order");

  if (needsExamIntro(prep.intro_completed_at, nodes ?? [])) {
    return NextResponse.json({ ok: true, nextHref: examPrepIntroHref(prep.id) });
  }

  const node = (nodes ?? []).find((row) => row.status === "ready");
  return NextResponse.json({
    ok: true,
    nextHref: node
      ? examPrepNodeHref(prep.id, node.id)
      : examPrepHomeHref(prep.id),
  });
}
