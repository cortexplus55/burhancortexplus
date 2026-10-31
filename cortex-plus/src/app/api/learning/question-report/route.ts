import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { awardStars } from "@/lib/stars/award";
import { istanbulDay } from "@/lib/istanbul-day";
import { checkReportedQuestion } from "@/lib/learning/question-report/check";
import { loadReportTarget } from "@/lib/learning/question-report/apply";
import {
  REPORT_ALREADY,
  REPORT_DAILY_REWARD_CAP,
  REPORT_GIFT_CREDITS,
  REPORT_REASON_IDS,
  REPORT_REJECTED,
  REPORT_STARS,
  REPORT_THANKS,
  REPORT_THANKS_CAPPED,
  REPORT_UNAVAILABLE,
} from "@/lib/learning/question-report/copy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  source: z.enum(["node", "mock"]),
  targetId: z.string().uuid(),
  questionRef: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASON_IDS),
  note: z.string().max(400).optional().nullable(),
});

/**
 * "🚩 Soruda hata bildir" (31 Ekim 2026, Paket J2 #10). Soru sunucudaki kayıttan okunur, tek model çağrısıyla
 * denetlenir; hatalıysa düzeltilir ya da geçersiz sayılıp tam puan verilir ve öğrenci hediye kredi + yıldız alır.
 * Ödül günde en çok 3 bildirim için (SQL'de yarışsız tavan), aynı soru aynı öğrenciden bir kez. Saatte 10, günde 30
 * bildirim: her bildirim bir model çağrısı.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "question-report", limit: 10, windowSeconds: 3_600, dailyLimit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bildirim okunamadı." }, { status: 400 });
  const { source, targetId, questionRef, reason } = parsed.data;
  const note = parsed.data.note?.replace(/\s+/g, " ").trim() || null;

  const target = await loadReportTarget(service, { userId, source, targetId, questionRef });
  if ("error" in target) {
    const message =
      target.error === "building"
        ? "Test hâlâ hazırlanıyor; son soru gelince bildirebilirsin."
        : target.error === "not_graded"
          ? "Denemeyi bitirince sonuç ekranından bildirebilirsin."
          : "Bu soru bulunamadı.";
    return NextResponse.json({ error: message, code: target.error }, { status: target.error === "not_found" ? 404 : 409 });
  }
  if (target.alreadyVoided) return NextResponse.json({ ok: true, verdict: "valid", message: REPORT_ALREADY, rewarded: false });

  const { data: report, error: insertError } = await service
    .from("question_reports")
    .insert({
      user_id: userId,
      source,
      target_id: targetId,
      question_ref: questionRef,
      prep_id: target.prepId,
      reason,
      note,
      question_snapshot: target.question,
    })
    .select("id")
    .single();
  if (insertError?.code === "23505") {
    return NextResponse.json({ ok: true, verdict: "duplicate", message: REPORT_ALREADY, rewarded: false });
  }
  if (insertError || !report) {
    console.warn("question_report_insert_failed", insertError?.message);
    return NextResponse.json({ error: REPORT_UNAVAILABLE }, { status: 503 });
  }

  const decision = await checkReportedQuestion(service, { userId, question: target.question, reason, note });
  if (!decision) {
    // Denetim yapılamadı: bildirim yeniden gönderilebilsin diye satır kalmaz (aynı soru bir kez kuralı yanılmasın).
    await service.from("question_reports").delete().eq("id", report.id);
    return NextResponse.json({ error: REPORT_UNAVAILABLE }, { status: 503 });
  }

  if (!decision.valid) {
    await service
      .from("question_reports")
      .update({ verdict: "invalid", issue_kind: decision.kind, explanation: decision.explanation, resolved_at: new Date().toISOString() })
      .eq("id", report.id);
    console.info("question_report", JSON.stringify({ source, verdict: "invalid", reason }));
    return NextResponse.json({
      ok: true,
      verdict: "invalid",
      message: decision.explanation ? `${REPORT_REJECTED} ${decision.explanation}` : REPORT_REJECTED,
      rewarded: false,
    });
  }

  let fix;
  try {
    fix = await target.apply(decision);
  } catch (error) {
    console.warn("question_report_apply_failed", error instanceof Error ? error.message : String(error));
    await service.from("question_reports").update({ verdict: "error", issue_kind: decision.kind }).eq("id", report.id);
    return NextResponse.json({ error: REPORT_UNAVAILABLE }, { status: 503 });
  }
  await service
    .from("question_reports")
    .update({
      verdict: "valid",
      issue_kind: decision.kind,
      explanation: decision.explanation,
      corrected: decision.correctedKey ? { key: decision.correctedKey, action: decision.action } : { action: decision.action },
      resolved_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  const day = istanbulDay();
  const { data: claimed } = await service.rpc("claim_question_report_reward", {
    p_report: report.id,
    p_day: day,
    p_cap: REPORT_DAILY_REWARD_CAP,
  });
  let rewarded = false;
  if (claimed === true) {
    rewarded = true;
    await service
      .rpc("credit_gift", {
        p_user_id: userId,
        p_amount: REPORT_GIFT_CREDITS,
        p_key: `question-report:${report.id}`,
        p_meta: { reason: "question_report", report_id: report.id, source },
      })
      .then(
        () => undefined,
        () => undefined,
      );
    await awardStars(service, { userId, source: "prep", ref: `report:${report.id}`, amount: REPORT_STARS });
  }
  console.info("question_report", JSON.stringify({ source, verdict: "valid", kind: decision.kind, action: decision.action, rewarded }));

  return NextResponse.json({
    ok: true,
    verdict: "valid",
    action: decision.action,
    message: rewarded ? REPORT_THANKS : REPORT_THANKS_CAPPED,
    explanation: decision.explanation,
    rewarded,
    ...fix,
  });
}
