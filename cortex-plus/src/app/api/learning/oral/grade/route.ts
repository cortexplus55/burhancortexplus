import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { recordUserActivity } from "@/lib/streak/record-activity";
import {
  oralPercentScore,
  reconcileOralGrade,
  sanitizeGap,
} from "@/lib/learning/oral-review";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        prompt: z.string().min(1),
        answer: z.string().min(1),
        expectedPoints: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(8),
});

const resultSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  verdict: z.string().min(1).optional(),
  feedback: z.string().min(8).optional(),
  missingPoints: z.array(z.string()).optional().default([]),
  suggestedAnswer: z.string().optional().default(""),
  items: z
    .array(
      z.object({
        index: z.number().int().min(0),
        correct: z.boolean(),
        gap: z.string().max(400).optional().nullable(),
      }),
    )
    .optional(),
  correctCount: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-grade", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const lines = parsedBody.data.items
    .map(
      (item, i) =>
        `${i + 1}. index=${i}\nSoru: ${item.prompt}\nCevap: ${item.answer}`,
    )
    .join("\n\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GRADE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON: {"items":[{"index":number,"correct":boolean,"gap":string|null}],"correctCount":number,"verdict":string,"feedback":string,"missingPoints":string[],"suggestedAnswer":string}. Kaynakta hazır çözüm cümlesi yok diye 0 verme; rubriğe göre değerlendir. gap alanına soru metnini yazma.',
    userPrompt: `Sözlü: ${parsedBody.data.title}. Öğrenci cevaplarını değerlendir.\n\n${lines}`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const answers: Record<string, unknown> = {};
  parsedBody.data.items.forEach((item, index) => {
    answers[String(index)] = item.answer;
  });
  const reconciled = reconcileOralGrade({
    questions: parsedBody.data.items.map((item) => ({
      prompt: item.prompt,
      expectedPoints: item.expectedPoints,
    })),
    answers,
    modelItems: outcome.data.items ?? null,
    modelCorrectCount: outcome.data.correctCount ?? null,
  });
  const score = oralPercentScore(reconciled.correctCount, reconciled.total);
  const missingPoints = reconciled.items
    .filter((item) => !item.correct && item.gap)
    .map((item) => item.gap!)
    .filter(Boolean);
  // Strip any residual prompt echoes from model missingPoints.
  const cleanedMissing = [
    ...new Set(
      [
        ...missingPoints,
        ...(outcome.data.missingPoints ?? []).map((gap, i) =>
          sanitizeGap(gap, parsedBody.data.items[i]?.prompt ?? ""),
        ),
      ].filter((g): g is string => Boolean(g)),
    ),
  ];

  try {
    await recordUserActivity(service, userId, "oral");
  } catch {
    // streak additive
  }

  return NextResponse.json({
    score,
    verdict: outcome.data.verdict ?? (score >= 70 ? "İyi" : "Geliştir"),
    feedback:
      outcome.data.feedback ??
      `Doğru: ${reconciled.correctCount}/${reconciled.total}.`,
    missingPoints: cleanedMissing,
    suggestedAnswer: outcome.data.suggestedAnswer ?? "",
    correctIndices: reconciled.correctIndices,
    items: reconciled.items,
  });
}
