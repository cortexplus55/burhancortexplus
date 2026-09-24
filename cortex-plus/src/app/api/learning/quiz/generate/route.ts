import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { verifyEducationalContent } from "@/lib/ai/quality-gate";
import {
  commitCredits,
  recordUsage,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { errorResponse, withUser } from "@/lib/api/guards";
import { env } from "@/lib/env";
import { getTeacherEntitlements, incrementTeacherUsage } from "@/lib/teacher/entitlements";
import { CONTENT_STYLE, SYSTEM_GUARDRAIL } from "@/lib/ai/generate";

const schema = z.object({
  topic: z.string().min(3).max(500),
  count: z.number().int().min(4).max(10).optional(),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional(),
  operationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "quiz-generate",
    limit: 8,
    dailyLimit: 60,
  });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;
  const user = { id: userId };

  // Eskiden `schema.parse` idi: geçersiz gövde 400 yerine 500 döndürüyordu,
  // yani her bozuk istek hata raporuna düşüyordu.
  const parsedBody = schema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { topic, count, difficulty } = parsedBody.data;
  const questionCount = count ?? 5;
  const difficultyHint =
    difficulty === "easy"
      ? "Sorular kolay seviyede olsun."
      : difficulty === "hard"
        ? "Sorular zor seviyede olsun."
        : difficulty === "mixed"
          ? "Kolay, orta ve zor karışık olsun."
          : "Sorular orta seviyede olsun.";

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

  const operationId = parsedBody.data.operationId ?? crypto.randomUUID();
  const idempotencyKey = `quiz:${operationId}`;
  const reserve = await reserveCredits(service, user.id, "QUIZ_GENERATE", idempotencyKey);
  if (!reserve.ok) {
    if (reserve.reason === "insufficient_credits") {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }
    if (reserve.reason === "operation_in_progress") {
      return errorResponse(409, "operation_in_progress");
    }
    if (reserve.reason === "operation_completed") {
      return errorResponse(409, "operation_completed");
    }
    return NextResponse.json({ error: "reserve_failed" }, { status: 503 });
  }
  const resId = reserve.reservationId;

  try {
    if (!env.OPENAI_API_KEY) throw new Error("no_openai");
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_STANDARD_MODEL,
      messages: [
        {
          role: "system",
          content:
            `${SYSTEM_GUARDRAIL}\n${CONTENT_STYLE}\n` +
            "JSON döndür: { title, questions: [{ question, options: string[4], correct }] }. " +
            "Şıklar birbirinden ayırt edilebilir olsun; 'hepsi' ya da 'hiçbiri' yazma. " +
            "correct alanı, options dizisindeki metnin birebir aynısı olmalı.",
        },
        { role: "user", content: `Konu: ${topic}. ${questionCount} soruluk quiz üret. ${difficultyHint} Çeldiriciler gerçek bir yanılgıdan gelsin. Konuda olmayan formül yazma.` },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const verified = await verifyEducationalContent({ client: openai, context: `Konu: ${topic}. ${questionCount} soruluk quiz üret.`, draft: raw, format: 'JSON: {title:string,questions:[{question:string,options:string[],correct:string}]}. correct bir seçenek metni olmalı.' });
    await recordUsage(service, { userId, actionCode: "QUIZ_GENERATE", model: env.OPENAI_ADVANCED_MODEL, tokensIn: verified.tokensIn, tokensOut: verified.tokensOut, reservationId: resId });
    const parsed = z.object({
      title: z.string().min(1),
      questions: z.array(z.object({ question: z.string().min(1), options: z.array(z.string()).length(4), correct: z.string() }).refine(q => q.options.includes(q.correct))).length(questionCount),
    }).parse(JSON.parse(verified.content)) as {
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

    await commitCredits(service, resId);

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
    await refundCredits(service, resId);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}
