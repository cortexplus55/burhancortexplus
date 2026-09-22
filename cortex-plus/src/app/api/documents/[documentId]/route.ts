import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Belge soft-delete.
 *
 * Hard delete CASCADE ile chunk/embedding siler ama exam_preps.document_id
 * SET NULL olur. Soft-delete retrieval'dan düşürür; içerik yasal süre için
 * admin tarafından hard-purge edilebilir.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const guard = await withUser(request, { scope: "documents-delete", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId } = guard.ctx;
  const { documentId } = await context.params;

  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    return NextResponse.json({ error: "Geçersiz belge." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: doc } = await service
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
  }

  const { data: deleted, error } = await service.rpc("soft_delete_document", {
    p_user_id: userId,
    p_document_id: documentId,
  });

  if (error || !deleted) {
    console.error("document_delete_failed", {
      userId,
      documentId,
      code: error?.code,
    });
    return NextResponse.json(
      { error: "Belge silinemedi. Tekrar dene." },
      { status: 500 },
    );
  }

  // Storage dosyasını da kaldır — orphan bırakma.
  if (doc.storage_path) {
    const { error: storageError } = await service.storage
      .from("documents")
      .remove([doc.storage_path as string]);
    if (storageError) {
      console.error("document_storage_delete_failed", {
        userId,
        documentId,
        message: storageError.message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
