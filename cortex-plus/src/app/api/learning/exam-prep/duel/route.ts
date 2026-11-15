import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { FREE_LESSON_CODE, freeLessonRefused } from "@/lib/billing/free-lesson-gate";
import { DUEL_QUESTIONS, duelCode, toDuelQuestions } from "@/lib/learning/duel";
import { commitCredits, refundCredits } from "@/lib/credits/service";
import { studentOptionCount } from "@/lib/learning/student-pedagogy";
import { DUEL_SET_RULE } from "@/lib/learning/duel-prompt";
import { checkDuelDailyLimit } from "@/lib/learning/duel-daily";
import { EMPTY_SOURCE_CONTEXT, loadSourceContext } from "@/lib/learning/source-context";
import {
  resolvePrepSourceMode,
  shouldSearchSources,
  topicFence,
} from "@/lib/learning/prep-source";

const bodySchema = z.object({ prepId: z.string().uuid() });

/** Düello kurma bedeli (15 Kasım 2026): 20 kredi, göç 20261115140000. */
const DUEL_ACTION = "DUEL_GENERATE" as const;

/**
 * En az bu kadar sağlam soru çıkmazsa düello kurulmaz ve hak iade edilir.
 * Bağımsız doğrulayıcı üç sorunun altına zaten izin vermiyor; canlıda kabul
 * edilen bir üretimden 5'ten az soru kaldı ve düello kurulmadı (30 Eylül 2026).
 */
const MIN_QUESTIONS = 3;

/**
 * Model 12 aday yazıyor; doğrulayıcı bozuk olanları eliyor. 8 adayla
 * canlıda 4 soru kaldı (30 Eylül 2026) — sınır 8 olunca 7'ye ulaşmak şansa
 * kalıyordu.
 */
const DUEL_CANDIDATES = 12;

// İki taslak ve bağımsız denetim tek istekte; ders ucuyla aynı pay.
export const maxDuration = 300;

/**
 * Yeni düello: hazırlığın çalışılan konusundan 7 tek doğrulu soru.
 * Ücret DUEL_GENERATE (20 kredi, 15 Kasım 2026'dan beri; önce QUIZ_GENERATE 10) ve günlük kurma sınırı (DUEL_ACCESS);
 * soruları test motorunun doğrulayıcıları süzüyor (üs/matematik anahtarı, belirsiz şık).
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

  // Ücretsiz hesap = tek ders (11 Kasım 2026 akşamı): bu üretim ders sayacına düşer, ücretsiz hesapta Plus'a yönlenir.
  // Kaynak okuma, kredi ayırma ve model çağrısından ÖNCE; cüzdan bakiyesi (davet hediyesi) yetiyorsa iş onunla yapılır.
  // Paylaşılan düelloyu oynamak ücretsiz kalır; yeni düello kurmak soru üretimidir.
  // 15 Kasım 2026 (Burhan onayı, düello 9B): kendi eylem kodu DUEL_GENERATE (20 kredi) ve günlük kurma sınırı.
  if (await freeLessonRefused(service, userId, DUEL_ACTION)) return errorResponse(402, FREE_LESSON_CODE);
  const daily = await checkDuelDailyLimit(service, userId);
  if (!daily.allowed) {
    return NextResponse.json(
      { error: `Bugün en çok ${daily.limit} düello kurabilirsin. Kurduğun düelloları oynamak ve paylaşmak açık; yarın yeniden kurabilirsin.`, code: "duel_daily_limit", limit: daily.limit },
      { status: 429 },
    );
  }

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

  const optionCount = await studentOptionCount(service, userId, (prep.title as string | null) ?? subject);
  const outcome = await generateExamQuiz({
    service,
    userId,
    optionCount,
    isPremium: await isPremiumUser(service, userId),
    maxDraftAttempts: 2,
    deferCommit: true,
    actionCode: DUEL_ACTION,
    maxQuestions: DUEL_CANDIDATES,
    // Öğretmen motoru soruları kendisi çözerek eler; 2 yedekle 7 yeter.
    count: DUEL_QUESTIONS + 2,
    topicLabel: topic,
    prepTitle: subject,
    hiddenRationale: true,
    difficulty: "hard",
    sourceExcerpt: source.block,
    requireSourceSupport: sourceMode !== "topic_only",
    idempotencyKey: `duel:${prepId}:${Date.now()}`,
    userPrompt: `Sınav: ${subject}. Konu: ${topic}.${source.block}${topicBlock}
Düello için ${DUEL_CANDIDATES} çoktan seçmeli soru yaz. Her soruda ${optionCount} şık.
Tüm sorularda multi false (tek doğru). correct her zaman options içinde olsun.
Soru kökü kısa olsun; 20 saniyede okunup cevaplanabilsin. Uzun hesap isteyen soru yazma.
Soruların hepsi "${topic}" konusundan olsun; alıntıda başka konu geçiyorsa onu sorma.
"Amacı nedir", "hangi özellik dikkate alınır" gibi yoruma açık soru yazma. Her sorunun tek, kesin ve tartışmasız bir doğrusu olsun: bir değer, bir formül, bir tanım ya da kısa bir hesap. Yanlış şıkların hiçbiri savunulabilir biçimde doğru olmasın.
Her soruyu göndermeden önce bilimsel ve matematiksel doğruluğunu kontrol et. Soru kökü ile doğru seçenek tam olarak uyuşsun.
${DUEL_SET_RULE}`,
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
