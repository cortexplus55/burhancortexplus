import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getTeacherEntitlements, incrementTeacherUsage } from "@/lib/teacher/entitlements";

const schema = z.object({
  topic: z.string().min(3).max(500),
  count: z.number().int().min(4).max(10).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { topic, count } = schema.parse(await request.json());
  const questionCount = count ?? 5;
  const service = createServiceClient();

  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isTeacher =
    roles.includes("teacher") ||
    roles.includes("verified_teacher");

  if (isTeacher) {
    const entitlements = await getTeacherEntitlements(service, user.id, roles);
    if (!entitlements?.canGenerateQuiz()) {
      return NextResponse.json({ error: "teacher_quiz_locked" }, { status: 403 });
    }
  }

  const idempotencyKey = `quiz_${user.id}_${Date.now()}`;

  const { data: resId, error: reserveError } = await service.rpc("credit_reserve", {
    p_user_id: user.id,
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
    const parsed = JSON.parse(raw) as {
      title?: string;
      questions?: { question: string; options: string[]; correct: string }[];
    };

    const { data: quiz } = await service
      .from("quizzes")
      .insert({ user_id: user.id, title: parsed.title ?? topic })
      .select("id")
      .single();

    if (quiz && parsed.questions) {
      await service.from("quiz_questions").insert(
        parsed.questions.map((q, i) => ({
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
      const entitlements = await getTeacherEntitlements(service, user.id, roles);
      if (entitlements?.tier === "pending") {
        await incrementTeacherUsage(service, user.id, "quizzes_generated");
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
      title: parsed.title ?? topic,
      questions:
        questions.length > 0
          ? questions
          : (parsed.questions ?? []).map((q, i) => ({
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
