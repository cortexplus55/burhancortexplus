import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { surveyAnswerSchema } from "@/lib/feedback/weekly-survey";
import { surveyEligibility, surveySegment } from "@/lib/feedback/weekly-survey-server";

export const dynamic = "force-dynamic";

/**
 * Haftalık kısa anket (19 Ekim 2026, kapalı beta).
 *
 * GET: bu hafta gösterilsin mi. POST: cevap ya da "Şimdi değil"; ikisi de haftanın satırını yazar,
 * aynı hafta yeniden sorulmaz. Hafta anahtarı istemciden alınmaz, sunucuda hesaplanır.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "weekly-survey-read", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { show, week } = await surveyEligibility(service, userId);
  return NextResponse.json({ show, week });
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "weekly-survey-write", limit: 5, dailyLimit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = surveyAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Cevap okunamadı." }, { status: 400 });

  const eligibility = await surveyEligibility(service, userId);
  if (!eligibility.show) return NextResponse.json({ ok: true, recorded: false });

  const answer = parsed.data;
  const row =
    answer.action === "dismiss"
      ? { dismissed: true }
      : {
          dismissed: false,
          helpfulness: answer.helpfulness,
          recommend: answer.recommend,
          most_used: answer.mostUsed ?? null,
          improve: answer.improve?.trim() ? answer.improve.trim() : null,
        };

  const { error } = await service.from("weekly_surveys").insert({
    user_id: userId,
    week_key: eligibility.week,
    segment: await surveySegment(service, userId),
    ...row,
  });
  // Aynı hafta ikinci gönderim (iki sekme): ilk satır kalır, öğrenciye hata gösterilmez.
  if (error && error.code !== "23505") {
    return NextResponse.json({ ok: false, error: "Cevap kaydedilemedi. Biraz sonra yeniden dene." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, recorded: !error });
}
