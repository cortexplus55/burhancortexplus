import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { errorResponse, readJson, withUser } from "@/lib/api/guards";
import { newIdempotencyKey } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { getTeacherEntitlements, incrementTeacherUsage } from "@/lib/teacher/entitlements";

const schema = z.object({
  topic: z.string().min(3).max(500),
  count: z.number().int().min(4).max(10).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "quiz", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { topic, count } = parsed.data;
  const questionCount = count ?? 5;

  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isTeacher =
    roles.includes("teacher") ||
    roles.includes("verified_teacher");

  if (isTeacher) {
    const entitlements = await getTeacherEntitlements(service, userId, roles);
    if (!entitlements?.canGenerateQuiz()) {
      return NextResponse.json({ error: "teacher_quiz_locked" }, { status: 403 });
    }
  }

  const idempotencyKey = newIdempotencyKey(`quiz_${userId}`);

  const { data: resId, error: reserveError } = await service.rpc("credit_reserve", {
    p_user_id: userId,
    p_action_code: "QUIZ_GENERATE",
    p_idempotency_key: idempotencyKey,
  });
  if (reserveError) {
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  try {
    if (!env.OPENAI_API_KEY) throw new Error("no_openai");
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_STANDARD_MODEL,
      messages: [
        {
          role: "system",
          content:
            "JSON döndür: { title, questions: [{ question, options: string[4], correct }] }",
        },
        { role: "user", content: `Konu: ${topic}. ${questionCount} soruluk quiz üret.` },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const generated = JSON.parse(raw) as {
      title?: string;
      questions?: { question: string; options: string[]; correct: string }[];
    };

    const { data: quiz } = await service
      .from("quizzes")
      .insert({ user_id: userId, title: generated.title ?? topic })
      .select("id")
      .single();

    if (quiz && generated.questions) {
      await service.from("quiz_questions").insert(
        generated.questions.map((q, i) => ({
          quiz_id: quiz.id,
          question_text: q.question,
          options: q.options,
          correct_answer: q.correct,
          sort_order: i,
        })),
      );
    }

    const { data: rows } = quiz
      ? await service
          .from("quiz_questions")
          .select("id, question_text, options, correct_answer, sort_order")
          .eq("quiz_id", quiz.id)
          .order("sort_order")
      : { data: null };

    await service.rpc("credit_commit", { p_reservation_id: resId });

    if (isTeacher) {
      const entitlements = await getTeacherEntitlements(service, userId, roles);
      if (entitlements?.tier === "pending") {
        await incrementTeacherUsage(service, userId, "quizzes_generated");
      }
    }

    const questions = (rows ?? []).map((q) => ({
      id: q.id as string,
      text: q.question_text as string,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      correct: (q.correct_answer as string) ?? "",
    }));

    return NextResponse.json({
      quizId: quiz?.id,
      title: generated.title ?? topic,
      questions:
        questions.length > 0
          ? questions
          : (generated.questions ?? []).map((q, i) => ({
              id: `q-${i}`,
              text: q.question,
              options: q.options,
              correct: q.correct,
            })),
    });
  } catch {
    await service.rpc("credit_refund", { p_reservation_id: resId });
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}
