import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { createMockExam } from "@/lib/learning/mock-exam/create";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { studioExamTopics, type StudioExamTopic } from "@/lib/learning/studio-exam-topics";

/** Konu başına öğretmen motoru (yazar + denetim + düzeltme), sekizli dalgalar. */
export const maxDuration = 300;

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  questionCount: z.number().int().min(5).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  /** Stüdyo hazırlığa bağlıysa. */
  prepId: z.string().uuid().optional(),
  /** Araçlar'da seçilen belge (19 Ekim 2026): konular belgenin kendi konularından. */
  documentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-generate", limit: 6, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, questionCount, prepId, documentId } = parsedBody.data;

  // Stüdyo: prep yoksa geçici prep veya topic-only deneme.
  let resolvedPrepId = prepId;
  let source: { kind: "document" | "topic"; wholeDocument?: boolean; matched?: boolean; fileName?: string } = { kind: "topic" };
  // Belgenin tamamından yazılının adı belgenin adı ("Belgenin tamamı" değil).
  const examTitle = () =>
    source.kind === "document" && source.wholeDocument && source.fileName
      ? source.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || topic
      : topic;
  if (!resolvedPrepId) {
    let studioTopics: StudioExamTopic[] = [{ label: topic, refs: [] }];
    if (documentId) {
      const picked = await studioExamTopics(service, userId, documentId, topic, questionCount);
      if (!picked) return errorResponse(409, "document_not_ready");
      studioTopics = picked.topics;
      source = { kind: "document", wholeDocument: picked.wholeDocument, matched: picked.matched, fileName: picked.fileName };
    }
    const { data: prep, error } = await service
      .from("exam_preps")
      .insert({
        user_id: userId,
        title: examTitle().slice(0, 80),
        exam_type: STUDIO_EXAM_TYPE,
      })
      .select("id")
      .single();
    if (error || !prep) return errorResponse(500, "generation_failed");
    resolvedPrepId = prep.id as string;
    await service.from("exam_prep_topics").insert(
      studioTopics.map((row, index) => ({
        exam_prep_id: resolvedPrepId,
        label: row.label,
        sort_order: index,
        status: "ready",
        source_refs: row.refs,
      })),
    );
  }

  const result = await createMockExam({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    prepId: resolvedPrepId,
    // Belgeden: konular zaten belgenin konuları; konu adıyla süzülmez.
    topicLabel: source.kind === "document" ? undefined : topic,
    questionCount,
    preset: questionCount <= 12 ? "short" : "standard",
  });

  if (!result.ok) return errorResponse(result.status, result.error);

  const { data: rows } = await service
    .from("practice_exam_questions")
    .select("id, question_text, options, points, question_type")
    .eq("exam_id", result.examId)
    .order("sort_order");

  return NextResponse.json({
    examId: result.examId,
    title: examTitle(),
    source,
    durationMinutes: result.blueprint.durationMinutes,
    questions: (rows ?? []).map((row) => ({
      id: row.id,
      text: row.question_text,
      options: (row.options as string[]) ?? [],
      points: row.points ?? 1,
      question_type: row.question_type,
    })),
  });
}
