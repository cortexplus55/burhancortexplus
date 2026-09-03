import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";

const bodySchema = z.object({
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40).default("okul"),
  targetScore: z.number().int().min(1).max(100).optional(),
  topics: z.array(z.string().min(1).max(120)).min(1).max(24),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  // Hazırlığın dayanacağı kaynak; yoksa arama kullanıcının tüm belgelerine düşer.
  documentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-create", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const topics = parsed.data.note?.trim()
    ? [...parsed.data.topics, parsed.data.note.trim()]
    : parsed.data.topics;

  const result = await insertExamPrepGraph(service, {
    userId,
    title: parsed.data.title,
    examType: parsed.data.examType,
    topics,
    examDate: parsed.data.examDate,
    targetScore: parsed.data.targetScore,
    documentId: parsed.data.documentId ?? null,
  });

  if ("error" in result) return errorResponse(500, result.error ?? "exam_prep_failed");

  return NextResponse.json({
    ok: true,
    prepId: result.prepId,
    days: result.days,
  });
}
