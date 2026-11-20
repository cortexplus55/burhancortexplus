import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { examResultCardText, examResultTrend } from "@/lib/learning/exam-result";
import { saveExamFeedback } from "@/lib/learning/exam-feedback";

/**
 * Sınav sonrası başarı toplayıcı (Faz 7, 20 Kasım 2026): "🎓 Sınavın Nasıl Geçti?" kartının gönderimi. Yalnız
 * hazırlığın sahibi, yalnız sınav gününün ertesinden itibaren. Serbest metin kırpılır, reddedilmez; hazırlık puanı
 * imzalı anlık görüntüden okunur. Göçten önce tablo yoksa not `learning_preferences.examResult`a yazılır, yorum
 * kaydedilmez ve öğrenciye söylenir (`exam-feedback.ts`). "Notum henüz açıklanmadı" bugünkü `exam-result` ucunda.
 */

const bodySchema = z.object({
  prepId: z.string().uuid(),
  actualScore: z.string().trim().min(1).max(400),
  comment: z.string().trim().min(1).max(8000),
  displayName: z.string().max(800).nullish(),
  allowPublicShowcase: z.boolean().optional(),
  readinessToken: z.string().max(600).nullish(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-feedback", limit: 6, dailyLimit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const outcome = await saveExamFeedback(service, { ...parsed.data, userId });
  if (!outcome.ok) {
    return outcome.message
      ? NextResponse.json({ error: outcome.message, code: outcome.code }, { status: outcome.status })
      : errorResponse(outcome.status, outcome.code);
  }
  const { result } = outcome;
  return NextResponse.json({
    ok: true,
    testimonialSaved: outcome.testimonialSaved,
    message: outcome.message,
    result,
    ...(result
      ? {
          text: examResultCardText({ baselinePct: result.baselinePct, score: result.score }),
          trend: examResultTrend(result.baselinePct, result.score),
        }
      : {}),
  });
}
