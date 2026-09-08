import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import {
  loadTopicMapSnapshot,
  runPdfLearningV2,
} from "@/lib/documents/pdf-learning-v2";

type RouteContext = { params: Promise<{ documentId: string }> };

const patchSchema = z.object({
  sourceBoundaryMode: z
    .enum(["documents_only", "allow_supporting"])
    .optional(),
  topics: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(160).optional(),
        learningObjective: z.string().trim().max(500).nullable().optional(),
        studentNotes: z.string().trim().max(2000).nullable().optional(),
        delete: z.boolean().optional(),
      }),
    )
    .max(80)
    .optional(),
  markReviewed: z.boolean().optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const guard = await withUser(request, { scope: "doc-topic-map", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { documentId } = await context.params;

  if (!z.string().uuid().safeParse(documentId).success) {
    return errorResponse(400, "invalid_input");
  }

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    return errorResponse(404, "feature_disabled");
  }

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, status, file_name")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");

  const snapshot = await loadTopicMapSnapshot(service, documentId);
  if (!snapshot) return errorResponse(404, "not_found");

  return NextResponse.json({
    fileName: doc.file_name,
    status: doc.status,
    ...snapshot,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await withUser(request, {
    scope: "doc-topic-map-edit",
    limit: 20,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { documentId } = await context.params;

  if (!z.string().uuid().safeParse(documentId).success) {
    return errorResponse(400, "invalid_input");
  }

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    return errorResponse(404, "feature_disabled");
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");

  if (parsed.data.sourceBoundaryMode) {
    await service
      .from("documents")
      .update({ source_boundary_mode: parsed.data.sourceBoundaryMode })
      .eq("id", documentId);
  }

  for (const topic of parsed.data.topics ?? []) {
    if (topic.delete) {
      await service
        .from("document_topic_nodes")
        .delete()
        .eq("id", topic.id)
        .eq("document_id", documentId);
      continue;
    }

    const patch: Record<string, unknown> = {
      is_student_edited: true,
      updated_at: new Date().toISOString(),
    };
    if (topic.title !== undefined) patch.title = topic.title;
    if (topic.learningObjective !== undefined) {
      patch.learning_objective = topic.learningObjective;
    }
    if (topic.studentNotes !== undefined) {
      patch.student_notes = topic.studentNotes;
    }

    await service
      .from("document_topic_nodes")
      .update(patch)
      .eq("id", topic.id)
      .eq("document_id", documentId);
  }

  if (parsed.data.markReviewed) {
    await service
      .from("documents")
      .update({
        topic_map_status: "reviewed",
        topic_map_updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  }

  const snapshot = await loadTopicMapSnapshot(service, documentId);
  return NextResponse.json(snapshot);
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await withUser(request, {
    scope: "doc-topic-map-rebuild",
    limit: 6,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { documentId } = await context.params;

  if (!z.string().uuid().safeParse(documentId).success) {
    return errorResponse(400, "invalid_input");
  }

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    return errorResponse(404, "feature_disabled");
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "rebuild") {
    return errorResponse(400, "invalid_input");
  }

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, status")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");
  if (doc.status !== "completed") {
    return errorResponse(409, "document_not_ready");
  }

  const result = await runPdfLearningV2(service, documentId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Konu haritası yeniden oluşturulamadı.", detail: result.error },
      { status: 422 },
    );
  }

  const snapshot = await loadTopicMapSnapshot(service, documentId);
  return NextResponse.json({
    ok: true,
    topics: result.topics,
    coverage: result.coverage,
    snapshot,
  });
}
