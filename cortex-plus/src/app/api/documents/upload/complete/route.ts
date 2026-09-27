import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { maxDocumentBytes } from "@/lib/documents/store-upload";

const bodySchema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload-complete", limit: 30 });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { service, userId } = guard.ctx;
  const { data: doc, error: readError } = await service.from("documents")
    .select("id, storage_path, mime_type, size_bytes, status")
    .eq("id", parsed.data.documentId).eq("user_id", userId).is("deleted_at", null)
    .maybeSingle();
  if (readError) return errorResponse(503, "upload_failed");
  if (!doc) return errorResponse(404, "not_found");
  if (doc.status !== "pending") {
    return doc.status === "processing" || doc.status === "completed"
      ? NextResponse.json({ documentId: doc.id, status: doc.status })
      : errorResponse(409, "upload_failed");
  }
  const { data: stored, error: infoError } = await service.storage.from("documents").info(doc.storage_path);
  const actualSize = Number(stored?.size);
  if (infoError || !Number.isSafeInteger(actualSize) || actualSize !== Number(doc.size_bytes) ||
      actualSize <= 0 || actualSize > maxDocumentBytes(doc.mime_type)) {
    return NextResponse.json({ error: "Yüklenen dosyanın boyutu doğrulanamadı. Yeniden yükle." }, { status: 422 });
  }
  if (stored?.contentType && stored.contentType.split(";")[0].trim() !== doc.mime_type) {
    return NextResponse.json({ error: "Yüklenen dosyanın türü doğrulanamadı. Yeniden yükle." }, { status: 422 });
  }
  const { error: updateError } = await service.from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", doc.id).eq("user_id", userId).eq("status", "pending");
  if (updateError) return errorResponse(503, "upload_failed");
  return NextResponse.json({ documentId: doc.id, status: "processing" });
}
