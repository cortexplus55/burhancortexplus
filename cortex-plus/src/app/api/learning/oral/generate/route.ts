import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { teacherOralLoop } from "@/lib/learning/teacher-practice";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";
import { parseExaminerVibe } from "@/lib/learning/examiner-vibe";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  /** Öğrenci 3 / 5 / 8 soru seçer (19 Ekim 2026; önce hep 5). */
  count: z.number().int().min(3).max(10).default(5),
  /** "Belgem": sorular ve beklenen noktalar yalnızca bu belgeden (19 Ekim 2026). */
  documentId: z.string().uuid().optional(),
  /** Hoca karakteri. Yoksa destekleyici — mevcut çağrılar kırılmasın. */
  examinerVibe: z.string().optional(),
});

/**
 * Araçlar > Sözlü sınav (3 Ekim 2026): sınav hazırlığındaki öğretmen sözlü
 * motoru — her soruyu kendisi cevaplayan denetim, sorunlu sorunun düzeltilmesi
 * ya da elenmesi. 19 Ekim 2026'dan beri belge ve soru sayısı seçilebiliyor.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-generate", limit: 6 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { count, documentId } = parsedBody.data;
  const topic = parsedBody.data.topic.trim();
  const examinerVibe = parseExaminerVibe(parsedBody.data.examinerVibe);

  const source = await studioTeacherSource(service, { userId, topic, documentId });
  if (!source) return errorResponse(409, "document_not_ready");

  const outcome = await runWithTeacherModel(service, {
    userId,
    actionCode: "ORAL_EXAM_GENERATE",
    idempotencyKey: `studio-oral:${userId}:${crypto.randomUUID()}`,
    label: "studio_oral",
    topic,
    work: async (ask, started) => {
      const loop = await teacherOralLoop(
        ask,
        { topicLabel: topic, prepTitle: source.fileName ?? topic, pages: source.pages, mode: source.mode, count, examinerVibe },
        started,
      );
      const log = { kept: loop.items.length, rejected: loop.rejected.length, rounds: loop.rounds };
      return loop.items.length >= Math.min(3, count)
        ? { ok: true as const, result: loop.items.slice(0, count), log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({
    title: topic,
    source: documentId
      ? { kind: "document", documentId, fileName: source.fileName, wholeDocument: source.wholeDocument, matched: source.matched }
      : { kind: "topic" },
    // Beklenen noktalar puanlamaya geri gelir: cevap belgedeki noktalara göre notlanır.
    questions: outcome.result.map((item) => ({ prompt: item.prompt, hint: item.hint ?? "", expectedPoints: item.expectedPoints })),
  });
}
