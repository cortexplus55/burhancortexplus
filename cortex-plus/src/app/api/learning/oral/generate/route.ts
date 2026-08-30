import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
});

const resultSchema = z.object({
  title: z.string().min(1),
  questions: z
    .array(
      z.object({
        prompt: z.string().min(8),
        hint: z.string().optional(),
      }),
    )
    .min(3)
    .max(6),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-generate", limit: 6 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON: {"title":string,"questions":[{"prompt":string,"hint":string}]}. 5 açık uçlu sözlü sorusu. Kısa, net, Türkçe.',
    userPrompt: `Konu: ${parsedBody.data.topic}. Gerçek bir sözlü sınav gibi 5 soru yaz.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json(outcome.data);
}
