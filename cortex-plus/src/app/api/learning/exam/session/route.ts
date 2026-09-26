import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  DEADLINE_GRACE_SEC,
  deadlinePassed,
  examDeadlineFromDuration,
  remainingExamSeconds,
} from "@/lib/learning/mock-exam";

const startSchema = z.object({
  examId: z.string().uuid(),
});

const saveSchema = z.object({
  examId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.union([z.string(), z.array(z.string())])),
  flaggedIds: z.array(z.string().uuid()).optional(),
  cursorIndex: z.number().int().min(0).optional(),
});

/** Süreyi sunucuda başlat / devam ettir. */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-start", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "start";

  if (action === "save") {
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(400, "invalid_input");

    const { data: exam } = await service
      .from("practice_exams")
      .select("id, user_id, deadline_at")
      .eq("id", parsed.data.examId)
      .maybeSingle();
    if (!exam || exam.user_id !== userId) return errorResponse(404, "not_found");
    if (deadlinePassed(exam.deadline_at as string | null, Date.now(), DEADLINE_GRACE_SEC)) {
      return errorResponse(409, "deadline_passed");
    }

    // Aktif attempt yoksa answers jsonb'yi exam üzerinde tutmak için attempts'e draft yaz
    const { data: open } = await service
      .from("practice_exam_attempts")
      .select("id")
      .eq("exam_id", parsed.data.examId)
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      await service
        .from("practice_exam_attempts")
        .update({
          answers: parsed.data.answers,
          flagged_ids: parsed.data.flaggedIds ?? null,
        })
        .eq("id", open.id);
    } else {
      await service.from("practice_exam_attempts").insert({
        exam_id: parsed.data.examId,
        user_id: userId,
        answers: parsed.data.answers,
        flagged_ids: parsed.data.flaggedIds ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      timeLeftSec: remainingExamSeconds(exam.deadline_at as string | null),
    });
  }

  const parsed = startSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: exam } = await service
    .from("practice_exams")
    .select("id, user_id, duration_minutes, started_at, deadline_at")
    .eq("id", parsed.data.examId)
    .maybeSingle();

  if (!exam || exam.user_id !== userId) return errorResponse(404, "not_found");

  let startedAt = exam.started_at as string | null;
  let deadlineAt = exam.deadline_at as string | null;

  if (!startedAt || !deadlineAt) {
    const times = examDeadlineFromDuration(Number(exam.duration_minutes ?? 40));
    startedAt = times.started_at;
    deadlineAt = times.deadline_at;
    await service
      .from("practice_exams")
      .update({ started_at: startedAt, deadline_at: deadlineAt })
      .eq("id", exam.id);
  }

  const { data: draft } = await service
    .from("practice_exam_attempts")
    .select("id, answers, flagged_ids")
    .eq("exam_id", exam.id)
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    startedAt,
    deadlineAt,
    timeLeftSec: remainingExamSeconds(deadlineAt),
    answers: (draft?.answers as Record<string, unknown>) ?? {},
    flaggedIds: (draft?.flagged_ids as string[]) ?? [],
  });
}
