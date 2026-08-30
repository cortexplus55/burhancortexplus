import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
});

const resultSchema = z.object({
  title: z.string().min(1),
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        correct: z.boolean(),
        explanation: z.string().min(4),
      }),
    )
    .min(4)
    .max(10),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "true-false", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "QUIZ_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON: {"title":string,"items":[{"text":string,"correct":boolean,"explanation":string}]}. 8 kısa Türkçe iddia yaz. Yarısı doğru, yarısı yanlış olsun.',
    userPrompt: `Konu: ${parsedBody.data.topic}. 8 doğru/yanlış iddiası üret.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const { data: quiz } = await service
    .from("quizzes")
    .insert({ user_id: userId, title: outcome.data.title })
    .select("id")
    .single();

  if (quiz) {
    await service.from("quiz_questions").insert(
      outcome.data.items.map((item, index) => ({
        quiz_id: quiz.id,
        question_text: item.text,
        options: ["Doğru", "Yanlış"],
        correct_answer: item.correct ? "Doğru" : "Yanlış",
        sort_order: index,
      })),
    );
  }

  return NextResponse.json({
    quizId: quiz?.id ?? null,
    title: outcome.data.title,
    items: outcome.data.items.map((item, index) => ({
      id: `${quiz?.id ?? "tf"}-${index}`,
      text: item.text,
      correct: item.correct,
      explanation: item.explanation,
    })),
  });
}
