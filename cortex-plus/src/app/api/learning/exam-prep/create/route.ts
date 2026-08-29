import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const bodySchema = z.object({
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40).default("okul"),
  targetScore: z.number().int().min(1).max(100).optional(),
  topics: z.array(z.string().min(1).max(120)).min(1).max(24),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-create", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { title, examType, targetScore, topics, note } = parsed.data;
  const topicList = note?.trim()
    ? [...topics, `Sınav notu: ${note.trim()}`]
    : topics;

  const { data: plan, error: planError } = await service
    .from("study_plans")
    .insert({ user_id: userId, title, status: "active" })
    .select("id")
    .single();

  if (planError || !plan) return errorResponse(500, "generation_failed");

  const today = new Date();
  await service.from("study_plan_tasks").insert(
    topicList.map((topic, index) => {
      const due = new Date(today);
      due.setDate(due.getDate() + index + 1);
      return {
        plan_id: plan.id,
        title: topic,
        due_date: due.toISOString().slice(0, 10),
        sort_order: index,
      };
    }),
  );

  const { error: prepError } = await service.from("exam_preps").insert({
    user_id: userId,
    exam_type: examType,
    title,
    target_score: targetScore ?? null,
    study_plan_id: plan.id,
  });

  if (prepError) return errorResponse(500, "generation_failed");

  return NextResponse.json({ ok: true, planId: plan.id });
}
