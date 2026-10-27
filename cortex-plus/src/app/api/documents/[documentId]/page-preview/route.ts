import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

/** Dersin içinden kaynak sayfa. Belge yalnız sahibine açılır; imza 10 dakikadır. */
export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const guard = await withUser(request, { scope: "documents-page-preview", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { documentId } = await context.params;
  if (!z.string().uuid().safeParse(documentId).success) return errorResponse(400, "invalid_input");

  const page = Math.max(1, Math.trunc(Number(new URL(request.url).searchParams.get("page")) || 1));
  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, file_name, mime_type, storage_path, status, deleted_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.deleted_at || doc.user_id !== userId) return errorResponse(404, "not_found");

  const { data: pageRow } = await service
    .from("document_pages")
    .select("clean_text, text_content")
    .eq("document_id", documentId)
    .eq("page_number", page)
    .maybeSingle();
  const raw = (pageRow?.clean_text || pageRow?.text_content || "").trim();
  const text = raw ? raw.slice(0, 8000) : null;

  let signedUrl: string | null = null;
  if (doc.mime_type === "application/pdf" && doc.status === "completed" && doc.storage_path) {
    const { data: signed } = await service.storage.from("documents").createSignedUrl(doc.storage_path as string, 600);
    signedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    ok: true,
    page,
    fileName: doc.file_name ?? "Belge",
    mime: doc.mime_type,
    signedUrl,
    text,
  });
}
