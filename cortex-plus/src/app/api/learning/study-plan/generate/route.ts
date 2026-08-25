import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  goal: z.string().min(3).max(300),
  weeks: z.number().int().min(1).max(12).default(4),
  hoursPerWeek: z.number().int().min(1).max(60).default(8),
});

const resultSchema = z.object({
  title: z.string().min(1),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        dayOffset: z.number().int().min(0).max(120).default(0),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "study-plan", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { goal, weeks, hoursPerWeek } = parsedBody.data;

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON şemasını döndür: {"title": string, "tasks": [{"title": string, "dayOffset": number}]}. dayOffset bugünden itibaren gün sayısıdır.',
    userPrompt: `Hedef: ${goal}. Süre: ${weeks} hafta. Haftalık çalışma: ${hoursPerWeek} saat. Gerçekçi, ölçülebilir görevlerden oluşan bir çalışma planı üret.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const { data: plan, error } = await service
    .from("study_plans")
    .insert({ user_id: userId, title: outcome.data.title })
    .select("id")
    .single();

  if (error || !plan) return errorResponse(500, "generation_failed");

  const today = new Date();
  await service.from("study_plan_tasks").insert(
    outcome.data.tasks.map((task, index) => {
      const due = new Date(today);
      due.setDate(due.getDate() + task.dayOffset);
      return {
        plan_id: plan.id,
        title: task.title,
        due_date: due.toISOString().slice(0, 10),
        sort_order: index,
      };
    }),
  );

  return NextResponse.json({
    planId: plan.id,
    title: outcome.data.title,
    taskCount: outcome.data.tasks.length,
    creditsUsed: outcome.cost,
  });
}
