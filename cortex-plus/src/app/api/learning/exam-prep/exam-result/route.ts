import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { addDays, istanbulDay } from "@/lib/istanbul-day";
import {
  EXAM_RESULT_SNOOZE_DAYS,
  examResultCardText,
  examResultTrend,
  type StoredExamResult,
} from "@/lib/learning/exam-result";
import { loadExamBaseline } from "@/lib/learning/exam-result-load";

/**
 * Sınav sonrası notu (31 Ekim 2026, Paket J3 #14). Göçsüz: `exam_preps.learning_preferences` içine `examResult`
 * (not, zaman, kayıt anındaki başlangıç) ya da "notum henüz açıklanmadı" için `examResultSnoozedUntil` (3 gün)
 * yazılır. Tercihlerin geri kalanı olduğu gibi kalır. Yalnız hazırlığın sahibi, yalnız sınav günü gelmişse.
 */

const bodySchema = z.union([
  z.object({ prepId: z.string().uuid(), score: z.number().int().min(0).max(100) }),
  z.object({ prepId: z.string().uuid(), later: z.literal(true) }),
]);

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-result", limit: 10, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, exam_date, learning_preferences")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const today = istanbulDay();
  const examDate = (prep.exam_date as string | null) ?? null;
  if (!examDate || examDate > today) {
    return NextResponse.json({ error: "Sınav günü gelmeden not kaydedilmez.", code: "exam_not_passed" }, { status: 409 });
  }

  const raw =
    prep.learning_preferences && typeof prep.learning_preferences === "object" && !Array.isArray(prep.learning_preferences)
      ? (prep.learning_preferences as Record<string, unknown>)
      : {};

  let next: Record<string, unknown>;
  let result: StoredExamResult | null = null;
  if ("score" in parsed.data) {
    const baseline = await loadExamBaseline(service, { prepId: prep.id as string, userId });
    result = {
      score: parsed.data.score,
      at: new Date().toISOString(),
      baselinePct: baseline?.pct ?? null,
      baselineSource: baseline?.source ?? null,
    };
    next = { ...raw, examResult: result };
    delete next.examResultSnoozedUntil;
  } else {
    next = { ...raw, examResultSnoozedUntil: addDays(today, EXAM_RESULT_SNOOZE_DAYS) };
  }

  const { error } = await service
    .from("exam_preps")
    .update({ learning_preferences: next })
    .eq("id", prep.id as string)
    .eq("user_id", userId);
  if (error) return errorResponse(500, "save_failed");

  if (!result) return NextResponse.json({ ok: true, snoozed: true });
  return NextResponse.json({
    ok: true,
    result,
    text: examResultCardText({ baselinePct: result.baselinePct, score: result.score }),
    trend: examResultTrend(result.baselinePct, result.score),
  });
}
