import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExamPlan, daysUntilExam, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";

export async function insertExamPrepGraph(
  service: SupabaseClient,
  input: {
    userId: string;
    title: string;
    examType: string;
    topics: string[];
    examDate: string;
    targetScore?: number;
  },
) {
  const { data: plan, error: planError } = await service
    .from("study_plans")
    .insert({ user_id: input.userId, title: input.title, status: "active" })
    .select("id")
    .single();

  if (planError || !plan) return { error: "generation_failed" as const };

  const days = daysUntilExam(input.examDate);
  await service.from("study_plan_tasks").insert(
    input.topics.map((topic, index) => {
      const due = new Date(`${input.examDate}T00:00:00`);
      due.setDate(due.getDate() - Math.max(0, days - 1 - index));
      return {
        plan_id: plan.id,
        title: topic,
        due_date: due.toISOString().slice(0, 10),
        sort_order: index,
      };
    }),
  );

  const { data: prep, error: prepError } = await service
    .from("exam_preps")
    .insert({
      user_id: input.userId,
      exam_type: input.examType,
      title: input.title,
      target_score: input.targetScore ?? null,
      study_plan_id: plan.id,
      exam_date: input.examDate,
    })
    .select("id")
    .single();

  if (prepError || !prep) return { error: "generation_failed" as const };

  await service.from("exam_prep_topics").insert(
    input.topics.map((label, sort_order) => ({
      exam_prep_id: prep.id,
      label,
      sort_order,
      status: "ready",
    })),
  );

  const nodes = buildExamPlan(days);
  await service.from("exam_prep_nodes").insert(
    nodes.map((node, index) => ({
      exam_prep_id: prep.id,
      kind: node.kind,
      title: node.title,
      day_index: node.dayIndex,
      sort_order: node.sortOrder,
      status: index === 0 ? "ready" : "locked",
    })),
  );

  await service.from("exam_prep_sessions").insert({
    exam_prep_id: prep.id,
    user_id: input.userId,
    status: "active",
  });

  return { prepId: prep.id as string, days };
}

export async function ensurePrepNodes(
  service: SupabaseClient,
  prep: { id: string; exam_date?: string | null },
) {
  const { data: existing } = await service
    .from("exam_prep_nodes")
    .select("id")
    .eq("exam_prep_id", prep.id)
    .limit(1);

  if (existing?.length) return;

  const examDate =
    prep.exam_date ??
    new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  if (!prep.exam_date) {
    await service.from("exam_preps").update({ exam_date: examDate }).eq("id", prep.id);
  }

  const nodes = buildExamPlan(daysUntilExam(examDate));
  await service.from("exam_prep_nodes").insert(
    nodes.map((node, index) => ({
      exam_prep_id: prep.id,
      kind: node.kind,
      title: node.title,
      day_index: node.dayIndex,
      sort_order: node.sortOrder,
      status: index === 0 ? "ready" : "locked",
    })),
  );
}

export type PrepNodeRow = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  day_index: number;
  sort_order: number;
  status: "locked" | "ready" | "done";
};
