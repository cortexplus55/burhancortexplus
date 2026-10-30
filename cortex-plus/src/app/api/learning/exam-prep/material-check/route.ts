import { NextResponse } from "next/server";
import { z } from "zod";
import { PREP_DOCUMENT_REQUEST_MAX } from "@/lib/learning/prep-topic-list";
import { errorResponse, withUser } from "@/lib/api/guards";
import { unrelatedNotice, versionNotice } from "@/lib/documents/material-similarity";
import { readMaterialCheck } from "@/lib/learning/material-check-read";

/**
 * Kurulumun belge kümesi denetimi (Paket I, 30 Ekim 2026): aynı belgenin iki sürümü ve öbür belgelerle
 * ilgisiz görünen belge. Modelsiz, kredisiz; sihirbaz materyal adımından çıkarken bir kez sorar.
 * Okuma düşerse boş döner — sihirbaz uyarısız devam eder.
 */
const bodySchema = z.object({
  documentIds: z.array(z.string().uuid()).min(2).max(PREP_DOCUMENT_REQUEST_MAX),
  subject: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-material-check", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const check = await readMaterialCheck(service, userId, parsed.data.documentIds, parsed.data.subject ?? null);
  return NextResponse.json({
    versions: check.versions.map((pair) => ({
      currentId: pair.currentId,
      olderId: pair.olderId,
      identical: pair.identical,
      message: versionNotice(pair),
    })),
    unrelated: check.unrelated.map((document) => ({
      documentId: document.documentId,
      message: unrelatedNotice(document),
    })),
  });
}
