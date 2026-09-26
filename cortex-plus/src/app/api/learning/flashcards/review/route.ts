import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { upsertCardReview } from "@/lib/learning/flashcard-reviews";
import { nextCardSchedule, scheduleHint } from "@/lib/learning/spaced-repetition";

const bodySchema = z.object({
  cardKey: z.string().min(1).max(200),
  cardSource: z.enum(["node", "studio", "mistake", "misconception"]),
  rating: z.enum(["missed", "hard", "knew"]),
  examPrepId: z.string().uuid().optional().nullable(),
  topicLabel: z.string().max(200).optional().nullable(),
  examDate: z.string().max(32).optional().nullable(),
  /** İstemci önizleme için mevcut durum (iyimser UI). */
  previewState: z
    .object({
      ease: z.number().optional(),
      intervalDays: z.number().optional(),
      reps: z.number().int().optional(),
      lapses: z.number().int().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "flashcard-review",
    limit: 60,
    dailyLimit: 800,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  try {
    const result = await upsertCardReview(service, {
      userId,
      cardKey: parsed.data.cardKey,
      cardSource: parsed.data.cardSource,
      rating: parsed.data.rating,
      examPrepId: parsed.data.examPrepId,
      topicLabel: parsed.data.topicLabel,
      examDate: parsed.data.examDate,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[flashcards/review]", err);
    return errorResponse(500, "review_failed");
  }
}

/** İstemci buton alt metni için saf önizleme (DB yazmadan). */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "flashcard-review-preview", limit: 30 });
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const rating = url.searchParams.get("rating");
  if (rating !== "missed" && rating !== "hard" && rating !== "knew") {
    return errorResponse(400, "invalid_input");
  }
  const ease = Number(url.searchParams.get("ease") ?? 2.5);
  const intervalDays = Number(url.searchParams.get("intervalDays") ?? 0);
  const reps = Number(url.searchParams.get("reps") ?? 0);
  const lapses = Number(url.searchParams.get("lapses") ?? 0);
  const examDate = url.searchParams.get("examDate") ?? undefined;
  const next = nextCardSchedule(
    { ease, intervalDays, reps, lapses },
    rating,
    new Date(),
    examDate || undefined,
  );
  return NextResponse.json({
    intervalDays: next.intervalDays,
    dueAt: next.dueAt.toISOString(),
    hint: scheduleHint(next),
    requeueAfter: next.requeueAfter ?? null,
    mastered: next.mastered,
  });
}
