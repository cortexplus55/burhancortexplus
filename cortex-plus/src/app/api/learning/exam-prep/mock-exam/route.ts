import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  prepId: z.string().uuid(),
});

const resultSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(5),
        correct: z.string().min(1),
        multi: z.boolean().optional(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-mock", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, user_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");

  const { data: topics } = await service
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const topicLabels = (topics ?? []).map((t) => t.label as string);

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"questions":[{"text":string,"options":string[],"correct":string,"multi":boolean}]}. correct, options içinden olmalı.',
    userPrompt: `Sınav: ${prep.title} (${prep.exam_type}). Konular: ${topicLabels.join(", ")}. 5 çoktan seçmeli soru; en az birinde multi true.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      if (!result.success) return null;
      const valid = result.data.questions.filter((q) => q.options.includes(q.correct));
      return valid.length ? { questions: valid } : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const { data: exam, error: examError } = await service
    .from("practice_exams")
    .insert({
      user_id: userId,
      title: `${prep.title} · deneme`,
      duration_minutes: 30,
      exam_prep_id: prepId,
    })
    .select("id")
    .single();

  if (examError || !exam) return errorResponse(500, "generation_failed");

  await service.from("practice_exam_questions").insert(
    outcome.data.questions.map((q, sort_order) => ({
      exam_id: exam.id,
      question_text: q.text,
      question_type: q.multi ? "multi_mcq" : "mcq",
      options: q.options,
      correct_answer: q.correct,
      sort_order,
    })),
  );

  return NextResponse.json({ ok: true, examId: exam.id });
}
