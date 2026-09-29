import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { DUEL_QUESTIONS, duelCode, toDuelQuestions } from "@/lib/learning/duel";

const bodySchema = z.object({ prepId: z.string().uuid() });

/** En az bu kadar sağlam soru çıkmazsa düello kurulmaz (kredi iade edilir). */
const MIN_QUESTIONS = 5;

/**
 * Yeni düello: hazırlığın çalışılan konusundan 7 tek doğrulu soru.
 * Quiz üretimiyle aynı ücret (QUIZ_GENERATE); soruları aynı doğrulayıcılar
 * süzüyor (üs/matematik anahtarı, belirsiz şık).
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-duel", limit: 6 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, active_topic_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  // Tablo yoksa (migration uygulanmadıysa) soru üretip kredi düşmeden dur.
  const { error: tableError } = await service.from("prep_duels").select("id").limit(1);
  if (tableError) return errorResponse(503, "duel_unavailable");

  let topicLabel: string | null = null;
  if (prep.active_topic_id) {
    const { data: topic } = await service
      .from("exam_prep_topics")
      .select("label")
      .eq("id", prep.active_topic_id)
      .maybeSingle();
    topicLabel = (topic?.label as string | undefined)?.trim() || null;
  }
  const subject = (prep.title as string | null) ?? (prep.exam_type as string);
  const scope = topicLabel ? `${subject} — konu: ${topicLabel}` : subject;

  const outcome = await generateExamQuiz({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    difficulty: "medium",
    verificationMode: "schema",
    idempotencyKey: `duel:${prepId}:${Date.now()}`,
    userPrompt: `${scope}. Düello için ${DUEL_QUESTIONS + 2} çoktan seçmeli soru. Her soruda tam 4 şık ve TEK doğru cevap (multi false). Soru kökü kısa olsun; 20 saniyede okunup cevaplanabilsin. Uzun hesap isteyen soru yazma.`,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const questions = toDuelQuestions(outcome.questions);
  if (questions.length < MIN_QUESTIONS) return errorResponse(502, "generation_failed");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = duelCode();
    const { error } = await service.from("prep_duels").insert({
      exam_prep_id: prepId,
      creator_id: userId,
      title: subject,
      topic_label: topicLabel,
      questions,
      share_code: code,
    });
    if (!error) return NextResponse.json({ code });
    // Benzersiz kod çakışması dışındaki hatada tekrar denemenin anlamı yok.
    if (error.code !== "23505") return errorResponse(500, "save_failed");
  }
  return errorResponse(500, "save_failed");
}
