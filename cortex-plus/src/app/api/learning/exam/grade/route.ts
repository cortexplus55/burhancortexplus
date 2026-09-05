import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { formatExamAnalysisText } from "@/lib/learning/exam-analysis";
import { recordMistakes } from "@/lib/learning/mistake-notebook";

const bodySchema = z.object({
  examId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string()),
});

const analysisSchema = z.object({
  summary: z.string().min(1),
  weakTopics: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  items: z
    .array(
      z.object({
        questionId: z.string().optional(),
        explanation: z.string().min(8),
        // Soru başına konu etiketi. Yanlış defteri soruları buna göre
        // gruplandığı için isteniyor; sınav geneli için üretilen weakTopics
        // bunun yerini tutmuyor, o tek bir sınavın özeti.
        topic: z.string().optional(),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-grade", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { examId, answers } = parsedBody.data;

  const { data: exam } = await service
    .from("practice_exams")
    .select("id, title, user_id")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return errorResponse(404, "not_found");
  if (exam.user_id !== userId) return errorResponse(403, "forbidden");

  const { data: questions } = await service
    .from("practice_exam_questions")
    .select("id, question_text, correct_answer, points, options")
    .eq("exam_id", examId)
    .order("sort_order");

  const list = questions ?? [];
  const totalPoints = list.reduce((sum, q) => sum + (q.points ?? 1), 0) || 1;
  const earned = list.reduce(
    (sum, q) => sum + (answers[q.id] === q.correct_answer ? (q.points ?? 1) : 0),
    0,
  );
  const score = Math.round((earned / totalPoints) * 100);

  const wrong = list
    .filter((q) => answers[q.id] !== q.correct_answer)
    .map((q) => q.question_text)
    .slice(0, 15);

  const itemLines = list
    .map((q, index) => {
      const given = answers[q.id] || "—";
      const ok = given === q.correct_answer;
      return `${index + 1}. id=${q.id} | ${ok ? "doğru" : "yanlış"} | soru: ${q.question_text} | verilen: ${given} | doğru: ${q.correct_answer}`;
    })
    .join("\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GRADE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"summary":string,"weakTopics":string[],"nextSteps":string[],"items":[{"questionId":string,"explanation":string,"topic":string}]}',
    userPrompt: `Sınav: ${exam.title}. Puan: ${score}/100. Yanlışlar: ${
      wrong.length ? wrong.join(" | ") : "yok"
    }.\nHer soru için kısa Türkçe açıklama yaz (neden doğru/yanlış) ve o sorunun konusunu "topic" alanına 1-3 kelimeyle yaz (örn. "Üslü sayılar", "Paragrafta ana fikir"). Konu adları tutarlı olsun: aynı konudaki iki soruya aynı etiketi ver.\n${itemLines}`,
    parse: (raw) => {
      const result = analysisSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  const analysisText = outcome.ok
    ? JSON.stringify({
        summary: outcome.data.summary,
        weakTopics: outcome.data.weakTopics,
        nextSteps: outcome.data.nextSteps,
      })
    : "Analiz üretilemedi; puanın kaydedildi.";

  const { data: attempt } = await service
    .from("practice_exam_attempts")
    .insert({
      exam_id: examId,
      user_id: userId,
      score,
      analysis: analysisText,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (attempt) {
    const itemById = new Map(
      (outcome.ok ? outcome.data.items : []).map((item) => [
        item.questionId ?? "",
        item,
      ]),
    );

    const graded = list.map((q, index) => {
      const given = answers[q.id] ?? "";
      const item = itemById.get(q.id) ?? (outcome.ok ? outcome.data.items[index] : undefined);
      const isCorrect = given === q.correct_answer;
      return {
        question: q,
        given,
        isCorrect,
        topic: item?.topic?.trim() || null,
        explanation:
          item?.explanation ??
          (isCorrect ? "Bu yanıt doğru." : `Doğru yanıt: ${q.correct_answer}`),
      };
    });

    await service.from("practice_exam_item_reviews").insert(
      graded.map((g) => ({
        attempt_id: attempt.id,
        question_id: g.question.id,
        user_answer: g.given,
        is_correct: g.isCorrect,
        explanation: g.explanation,
      })),
    );

    // Yanlışlar deftere düşüyor. Sınav bittikten sonra ayrıca bir şey yapmak
    // gerekmiyor: öğrenci hiçbir düğmeye basmadan defteri dolmuş oluyor.
    await recordMistakes(
      service,
      userId,
      graded
        .filter((g) => !g.isCorrect)
        .map((g) => ({
          source: "deneme" as const,
          sourceQuestionId: g.question.id,
          topicLabel: g.topic,
          questionText: g.question.question_text,
          options: Array.isArray(g.question.options)
            ? (g.question.options as string[])
            : null,
          correctAnswer: g.question.correct_answer,
          wrongAnswer: g.given || null,
          explanation: g.explanation,
        })),
    );
  }

  if (outcome.ok && outcome.data.weakTopics.length) {
    await service.from("weak_topics").insert(
      outcome.data.weakTopics.slice(0, 10).map((label) => ({
        user_id: userId,
        topic_label: label,
        severity: (100 - score) / 100,
        source: "practice_exam",
      })),
    );
  }

  return NextResponse.json({
    attemptId: attempt?.id ?? null,
    score,
    correct: list.length - wrong.length,
    total: list.length,
    analysis: outcome.ok
      ? formatExamAnalysisText(outcome.data)
      : analysisText,
  });
}
