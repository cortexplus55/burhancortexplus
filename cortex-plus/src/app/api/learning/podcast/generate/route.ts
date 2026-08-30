import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
});

const resultSchema = z.object({
  title: z.string().min(1),
  tagline: z.string().min(1),
  chapters: z
    .array(z.object({ title: z.string().min(1), script: z.string().min(40) }))
    .min(3)
    .max(6),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast", limit: 6 });
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
      'Yalnızca şu JSON: {"title":string,"tagline":string,"chapters":[{"title":string,"script":string}]}. 4-5 bölüm. Script konuşma dilinde Türkçe, her bölüm 80-160 kelime.',
    userPrompt: `Konu: ${parsedBody.data.topic}. Öğrenci için 5 dakikalık podcast senaryosu yaz.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json(outcome.data);
}
