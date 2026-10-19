import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { teacherTrueFalseLoop, type TrueFalseItem } from "@/lib/learning/teacher-practice";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  /** Öğrenci 8 / 12 / 16 seçer (19 Ekim 2026; önce hep 8). */
  count: z.number().int().min(4).max(20).default(8),
  /** "Belgem": önermeler yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

/**
 * Araçlar > Doğru / Yanlış. 19 Ekim 2026'ya kadar tek seferlik bir taslaktı: denetim yoktu, belge
 * seçilemiyordu, önermeler "etkileyebilir / olabilir" diye kaçamak çıkıyordu (canlıda enflasyon
 * turu). Artık hazırlık yolundaki öğretmen motoru: her önermeyi kendisi değerlendiren denetim,
 * sorunlu önermenin düzeltilmesi ya da elenmesi; belge seçildiyse yalnızca o belgeden.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "true-false", limit: 8 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { count, documentId } = parsedBody.data;
  const topic = parsedBody.data.topic.trim();

  // Kredi ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const source = await studioTeacherSource(service, { userId, topic, documentId });
  if (!source) return errorResponse(409, "document_not_ready");

  const outcome = await runWithTeacherModel(service, {
    userId,
    actionCode: "QUIZ_GENERATE",
    idempotencyKey: `studio-tf:${userId}:${crypto.randomUUID()}`,
    label: "studio_true_false",
    topic,
    work: async (ask, started) => {
      const run = (want: number) => teacherTrueFalseLoop(
        ask,
        { topicLabel: topic, prepTitle: source.fileName ?? topic, pages: source.pages, mode: source.mode, count: want },
        started,
      );
      const loop = await run(count);
      let items: TrueFalseItem[] = loop.items;
      if (items.length < count && Date.now() - started < 110_000) {
        const seen = new Set(items.map((item) => item.text.trim().toLocaleLowerCase("tr")));
        const extra = await run(count - items.length + 1).catch(() => null);
        for (const item of extra?.items ?? []) {
          const key = item.text.trim().toLocaleLowerCase("tr");
          if (items.length >= count || seen.has(key)) continue;
          seen.add(key);
          items = [...items, item];
        }
      }
      const mixed = items.some((item) => item.correct) && items.some((item) => !item.correct);
      const log = { kept: items.length, rejected: loop.rejected.length, rounds: loop.rounds, mixed };
      return items.length >= Math.min(4, count) && mixed
        ? { ok: true as const, result: items, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const title = topic;
  const { data: quiz } = await service
    .from("quizzes")
    .insert({ user_id: userId, title, ...(documentId ? { document_id: documentId } : {}) })
    .select("id")
    .single();

  if (quiz) {
    await service.from("quiz_questions").insert(
      outcome.result.map((item, index) => ({
        quiz_id: quiz.id,
        question_text: item.text,
        options: ["Doğru", "Yanlış"],
        correct_answer: item.correct ? "Doğru" : "Yanlış",
        explanation: item.explanation || null,
        sort_order: index,
      })),
    );
  }

  return NextResponse.json({
    quizId: quiz?.id ?? null,
    title,
    source: documentId
      ? { kind: "document", documentId, fileName: source.fileName, wholeDocument: source.wholeDocument, matched: source.matched }
      : { kind: "topic" },
    items: outcome.result.map((item, index) => ({
      id: `${quiz?.id ?? "tf"}-${index}`,
      text: item.text,
      correct: item.correct,
      explanation: item.explanation,
      correctedStatement: item.correctedStatement,
    })),
  });
}
