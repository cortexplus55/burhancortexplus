import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getTeacherEntitlements, incrementTeacherUsage } from "@/lib/teacher/entitlements";
import { isPremiumUser } from "@/lib/ai/generate";
import { loadDocumentGenerationContext } from "@/lib/documents/generation-context";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";

const schema = z.object({
  topic: z.string().min(3).max(500),
  count: z.number().int().min(4).max(10).optional(),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional(),
  operationId: z.string().uuid().optional(),
  /** "Belgem" modu: sorular yalnızca bu belgenin parçalarından üretilir. */
  documentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "quiz-generate",
    limit: 8,
    dailyLimit: 60,
  });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;
  const user = { id: userId };

  // Eskiden `schema.parse` idi: geçersiz gövde 400 yerine 500 döndürüyordu,
  // yani her bozuk istek hata raporuna düşüyordu.
  const parsedBody = schema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { topic, count, difficulty, documentId } = parsedBody.data;
  const questionCount = count ?? 5;

  // Belge modu: kredi ayırmadan önce belgenin hazır ve dolu olduğunu doğrula;
  // yoksa öğrenci hem kredi kaybetmez hem de net bir sebep görür.
  const docContext = documentId
    ? await loadDocumentGenerationContext(service, userId, documentId, topic)
    : null;
  if (documentId && !docContext) {
    return NextResponse.json({ error: "document_not_ready" }, { status: 409 });
  }
  const difficultyHint =
    difficulty === "easy"
      ? "Sorular kolay seviyede olsun."
      : difficulty === "hard"
        ? "Sorular zor seviyede olsun."
        : difficulty === "mixed"
          ? "Kolay, orta ve zor karışık olsun."
          : "Sorular orta seviyede olsun.";

  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isTeacher =
    roles.includes("teacher") ||
    roles.includes("verified_teacher");

  if (isTeacher) {
    const entitlements = await getTeacherEntitlements(service, user.id, roles);
    if (!entitlements?.canGenerateQuiz()) {
      return NextResponse.json({ error: "teacher_quiz_locked" }, { status: 403 });
    }
  }

  const operationId = parsedBody.data.operationId ?? crypto.randomUUID();
  const idempotencyKey = `quiz:${operationId}`;

  /*
    Studio quizi eskiden kendi hattından üretiliyordu: tek bir yapay zekâ
    gözden geçirmesi, ardından pedagoji kontrolü. Sınav hazırlığındaki
    quizlerin geçtiği kesin kapı — aritmetik, denkleştirme, "tek doğru
    şık", açıklamanın cevap anahtarına varması, ikinci çözücü — burada
    hiç çalışmıyordu. Aynı konudan bir soru hazırlıkta elenip Studio'da
    yanlış anahtarla öğrenciye gidebilirdi. Artık iki yer aynı hattan
    geçiyor. Kredi ayırma, iade ve kullanım kaydı bu hattın içinde.
  */
  const outcome = await generateExamQuiz({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    teachingV2: true,
    difficulty: difficulty === "easy" || difficulty === "hard" ? difficulty : "medium",
    // Konudan üretimde karşılaştırılacak belge yok; iki doğru şıklı
    // kavramsal soruyu ikinci göz yakalıyor (bkz. exam-prep/intro/route.ts).
    verifyOptionReasoning: !docContext,
    idempotencyKey,
    sourceExcerpt: docContext?.excerpt,
    requireSourceSupport: Boolean(docContext),
    // Studio oynatıcısı tek doğru şıkla çalışıyor (`correct_answer` tek metin).
    schemaHintExtra: "Bu quizde her soru tek doğru cevaplıdır: multi false, correct tek şık.",
    userPrompt: docContext
      ? `Belge: ${docContext.fileName}. Konu: ${topic}. ${questionCount} çoktan seçmeli soru yaz. ${difficultyHint} Çeldiriciler gerçek bir yanılgıdan gelsin. Soruları YALNIZCA belge alıntısındaki bilgiden üret.\n\nBelge alıntısı:\n${docContext.excerpt}`
      : `Konu: ${topic}. ${questionCount} çoktan seçmeli soru yaz. ${difficultyHint} Çeldiriciler gerçek bir yanılgıdan gelsin. Konuda olmayan formül yazma.`,
  });

  if (!outcome.ok) {
    console.error("[quiz/generate] failed", {
      userId,
      documentId: documentId ?? null,
      status: outcome.status,
      error: outcome.error,
    });
    if (outcome.status === 402) return errorResponse(402, "insufficient_credits");
    if (outcome.error === "operation_in_progress") return errorResponse(409, "operation_in_progress");
    if (outcome.error === "operation_completed") return errorResponse(409, "operation_completed");
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }

  try {
    const picked = outcome.questions
      .filter((q) => !q.multi && q.correct.length === 1)
      .slice(0, questionCount);
    const parsed = {
      title: topic.trim().slice(0, 120),
      questions: picked.map((q) => ({
        question: q.text,
        options: q.options,
        correct: q.correct[0],
        explanation: q.explanation,
      })),
    };

    const { data: quiz } = await service
      .from("quizzes")
      .insert({
        user_id: user.id,
        title: parsed.title,
        ...(documentId ? { document_id: documentId } : {}),
      })
      .select("id")
      .single();

    if (quiz && parsed.questions.length) {
      await service.from("quiz_questions").insert(
        parsed.questions.map((q, i) => ({
          quiz_id: quiz.id,
          question_text: q.question,
          options: q.options,
          correct_answer: q.correct,
          explanation: q.explanation?.trim() || null,
          sort_order: i,
        })),
      );
    }

    const { data: rows } = quiz
      ? await service
          .from("quiz_questions")
          .select("id, question_text, options, correct_answer, explanation, sort_order")
          .eq("quiz_id", quiz.id)
          .order("sort_order")
      : { data: null };

    if (isTeacher) {
      const entitlements = await getTeacherEntitlements(service, user.id, roles);
      if (entitlements?.tier === "pending") {
        await incrementTeacherUsage(service, user.id, "quizzes_generated");
      }
    }

    const questions = (rows ?? []).map((q) => ({
      id: q.id as string,
      text: q.question_text as string,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      correct: (q.correct_answer as string) ?? "",
      explanation: (q.explanation as string | null) ?? null,
    }));

    return NextResponse.json({
      quizId: quiz?.id,
      title: parsed.title,
      source: docContext
        ? { kind: "document", documentId, fileName: docContext.fileName }
        : { kind: "topic" },
      questions: questions.length > 0 ? questions : fallbackQuestions(parsed.questions),
    });
  } catch (error) {
    // Kredi üretim başarılı olunca kesinleşti; kayıt düşse bile öğrenci
    // ödediği soruları alsın. Kayıtsız quiz sunucuda puanlanmaz (quizId yok).
    console.error("[quiz/generate] save_failed", {
      userId,
      documentId: documentId ?? null,
      message: error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    const picked = outcome.questions.filter((q) => !q.multi && q.correct.length === 1).slice(0, questionCount);
    return NextResponse.json({
      quizId: null,
      title: topic.trim().slice(0, 120),
      source: docContext ? { kind: "document", documentId, fileName: docContext.fileName } : { kind: "topic" },
      questions: fallbackQuestions(
        picked.map((q) => ({ question: q.text, options: q.options, correct: q.correct[0], explanation: q.explanation })),
      ),
    });
  }
}

function fallbackQuestions(
  items: { question: string; options: string[]; correct: string; explanation?: string }[],
) {
  return items.map((q, i) => ({
    id: `q-${i}`,
    text: q.question,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation ?? null,
  }));
}
