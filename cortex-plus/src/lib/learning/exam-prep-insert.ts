import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExamPlan, daysUntilExam, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";

export type ExamPrepNodeInsert = {
  kind: PlanNodeKind;
  title: string;
  day_index: number;
  sort_order: number;
  status: "locked" | "ready" | "done";
};

export async function insertExamPrepGraph(
  service: SupabaseClient,
  input: {
    userId: string;
    title: string;
    examType: string;
    topics: string[];
    examDate: string;
    targetScore?: number;
    /** Hazırlığın dayandığı belge; seçilmezse arama tüm belgelere düşer. */
    documentId?: string | null;
    /** When set (Stage 4 v2), replaces legacy buildExamPlan nodes. */
    nodes?: ExamPrepNodeInsert[];
  },
) {
  const days = daysUntilExam(input.examDate);
  const tasks = input.topics.map((topic, index) => {
    const due = new Date(`${input.examDate}T00:00:00`);
    due.setDate(due.getDate() - Math.max(0, days - 1 - index));
    return { title: topic, due_date: due.toISOString().slice(0, 10), sort_order: index };
  });
  const nodes =
    input.nodes ??
    buildExamPlan(days).map((node, index) => ({
      kind: node.kind,
      title: node.title,
      day_index: node.dayIndex,
      sort_order: node.sortOrder,
      status: (index === 0 ? "ready" : "locked") as "ready" | "locked",
    }));
  // One transaction: any failed child insert rolls back the whole graph.
  // Never retry with separate writes or drop the selected source.
  const { data, error } = await service.rpc("create_exam_prep_graph", {
    p_input: {
      userId: input.userId,
      title: input.title,
      examType: input.examType,
      topics: input.topics,
      examDate: input.examDate,
      targetScore: input.targetScore,
      documentId: input.documentId ?? null,
      tasks,
      nodes,
    },
  });
  if (error || typeof data !== "string" || !data) {
    return { error: "generation_failed" as const };
  }
  return { prepId: data, days };
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
