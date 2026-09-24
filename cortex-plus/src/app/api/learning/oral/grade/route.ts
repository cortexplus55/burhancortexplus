import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { recordUserActivity } from "@/lib/streak/record-activity";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        prompt: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .min(1)
    .max(8),
});

const resultSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string().min(1),
  feedback: z.string().min(8),
  missingPoints: z.array(z.string()).optional().default([]),
  suggestedAnswer: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-grade", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const lines = parsedBody.data.items
    .map((item, i) => `${i + 1}. Soru: ${item.prompt}\nCevap: ${item.answer}`)
    .join("\n\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GRADE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON: {"score":number,"verdict":string,"feedback":string,"missingPoints":string[],"suggestedAnswer":string}. score 0-100. feedback puanı neden verdiğini açıklasın.',
    userPrompt: `Sözlü: ${parsedBody.data.title}. Öğrenci cevaplarını değerlendir. Doğru olanı, eksik olanı ve yanlış olanı ayır. Soruda olmayan bir doğruyu puanlama.\n\n${lines}`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  try {
    await recordUserActivity(service, userId, "oral");
  } catch {
    // streak additive
  }

  return NextResponse.json(outcome.data);
}
