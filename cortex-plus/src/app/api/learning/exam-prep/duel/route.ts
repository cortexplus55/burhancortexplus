import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { DUEL_QUESTIONS, duelCode, toDuelQuestions } from "@/lib/learning/duel";
import { commitCredits, refundCredits } from "@/lib/credits/service";
import { EMPTY_SOURCE_CONTEXT, loadSourceContext } from "@/lib/learning/source-context";
import {
  resolvePrepSourceMode,
  shouldSearchSources,
  topicFence,
} from "@/lib/learning/prep-source";

const bodySchema = z.object({ prepId: z.string().uuid() });

/**
 * En az bu kadar sağlam soru çıkmazsa düello kurulmaz ve hak iade edilir.
 * Bağımsız doğrulayıcı üç sorunun altına zaten izin vermiyor; canlıda kabul
 * edilen bir üretimden 5'ten az soru kaldı ve düello kurulmadı (30 Eylül 2026).
 */
const MIN_QUESTIONS = 3;

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
  const topic = topicLabel ?? subject;

  /*
    Kaynak, tanışma testiyle aynı kuralla: belge varsa belgeden alıntı,
    yoksa konu çiti. İlk sürüm kaynaksız ve tek taslakla çağırıyordu;
    bağımsız doğrulayıcı soruları tutmadı ve canlıda düello hiç kurulmadı
    ("content_verification_failed", 30 Eylül 2026).
  */
  const { data: prepSource } = await service
    .from("exam_preps")
    .select("document_id")
    .eq("id", prepId)
    .maybeSingle();
  const documentId = (prepSource?.document_id as string | null | undefined) ?? null;
  const sourceMode = resolvePrepSourceMode({ documentId });
  let source = EMPTY_SOURCE_CONTEXT;
  if (shouldSearchSources(sourceMode)) {
    try {
      source = await loadSourceContext(service, userId, `${subject} ${topic}`, {
        documentId,
        limit: 6,
      });
    } catch {
      return errorResponse(503, "source_unavailable");
    }
  }
  const topicBlock =
    sourceMode === "topic_only"
      ? topicFence({ topic, examTitle: prep.title as string | null, examType: prep.exam_type as string })
      : "";

  const outcome = await generateExamQuiz({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    maxDraftAttempts: 2,
    deferCommit: true,
    difficulty: "hard",
    sourceExcerpt: source.block,
    requireSourceSupport: sourceMode !== "topic_only",
    idempotencyKey: `duel:${prepId}:${Date.now()}`,
    userPrompt: `Sınav: ${subject}. Konu: ${topic}.${source.block}${topicBlock}
Düello için ${DUEL_QUESTIONS + 3} çoktan seçmeli soru yaz. Her soruda 4 şık.
Tüm sorularda multi false (tek doğru). correct her zaman options içinde olsun.
Soru kökü kısa olsun; 20 saniyede okunup cevaplanabilsin. Uzun hesap isteyen soru yazma.
Her soruyu göndermeden önce bilimsel ve matematiksel doğruluğunu kontrol et. Soru kökü ile doğru seçenek tam olarak uyuşsun.`,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const reservationId = outcome.reservationId ?? null;
  const questions = toDuelQuestions(outcome.questions);
  if (questions.length < DUEL_QUESTIONS) {
    console.warn("duel_questions_short", {
      generated: outcome.questions.length,
      multi: outcome.questions.filter((q) => q.multi).length,
      usable: questions.length,
    });
  }
  if (questions.length < MIN_QUESTIONS) {
    if (reservationId) await refundCredits(service, reservationId);
    return errorResponse(502, "generation_failed");
  }

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
    if (!error) {
      // Hak yalnızca düello gerçekten kurulunca düşer.
      if (reservationId) await commitCredits(service, reservationId);
      return NextResponse.json({ code });
    }
    // Benzersiz kod çakışması dışındaki hatada tekrar denemenin anlamı yok.
    if (error.code !== "23505") break;
  }
  if (reservationId) await refundCredits(service, reservationId);
  return errorResponse(500, "save_failed");
}
