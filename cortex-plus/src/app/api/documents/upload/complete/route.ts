import { NextResponse } from "next/server";
import { UPLOAD_PREPARE_PER_MINUTE } from "@/lib/documents/upload-limits";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { completeDocumentUpload } from "@/lib/documents/complete-upload";

const bodySchema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload-complete", limit: UPLOAD_PREPARE_PER_MINUTE * 2 });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { service, userId } = guard.ctx;
  const completed = await completeDocumentUpload(service, userId, parsed.data.documentId);
  if (!completed.ok) {
    return completed.status === 422
      ? NextResponse.json({ error: completed.error }, { status: 422 })
      : errorResponse(completed.status, completed.error);
  }
  return NextResponse.json({ documentId: completed.documentId, status: completed.status });
}
