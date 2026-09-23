import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { z } from "zod";
import { purgeDeletedDocument } from "@/lib/privacy/document-deletion";

/**
 * Atomic logical deletion + durable physical cleanup, including owned artifacts.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const guard = await withUser(request, { scope: "documents-delete", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { documentId } = await context.params;

  if (!z.string().uuid().safeParse(documentId).success) {
    return NextResponse.json({ error: "Geçersiz belge." }, { status: 400 });
  }

  const { data: deleted, error } = await service.rpc("soft_delete_document", {
    p_user_id: userId,
    p_document_id: documentId,
  });

  if (error) {
    console.error("document_delete_failed", {
      userId,
      documentId,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Belge silinemedi. Tekrar dene." },
      { status: 503 },
    );
  }

  if (!deleted) return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  const completed = await purgeDeletedDocument(service, userId, documentId);
  return NextResponse.json({ ok: true, status: completed ? "completed" : "pending" }, { status: completed ? 200 : 202 });
}
