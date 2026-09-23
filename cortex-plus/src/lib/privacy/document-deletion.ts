import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedDocumentPath } from "@/lib/documents/storage-path";

/** Idempotent cleanup. The queue is persisted before this function runs. */
export async function purgeDeletedDocument(service: SupabaseClient, userId: string, documentId: string): Promise<boolean> {
  let step = "document_lookup";
  try {
    const { data: doc, error } = await service.from("documents")
      .select("id,storage_path,deleted_at").eq("id", documentId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(step);
    if (doc) {
      if (!doc.deleted_at) throw new Error("document_not_deleted");
      step = "storage_path";
      if (!isOwnedDocumentPath(doc.storage_path, userId, documentId)) throw new Error(step);
      step = "storage_remove";
      const { error: storageError } = await service.storage.from("documents").remove([doc.storage_path]);
      if (storageError) throw new Error(step);
      // Repeat for recovery from work that began before the soft-delete transaction.
      step = "artifacts_remove";
      const { error: prepError } = await service.from("exam_preps").delete().eq("user_id", userId).eq("document_id", documentId);
      if (prepError) throw new Error(step);
      step = "document_remove";
      const { error: deleteError } = await service.from("documents").delete()
        .eq("id", documentId).eq("user_id", userId).not("deleted_at", "is", null);
      if (deleteError) throw new Error(step);
    }
    step = "deletion_receipt";
    const { data: receipt, error: receiptError } = await service.from("document_deletion_requests")
      .update({ processed_at: new Date().toISOString(), last_error: null })
      .eq("document_id", documentId).eq("user_id", userId).select("document_id").maybeSingle();
    if (receiptError || !receipt) throw new Error(step);
    return true;
  } catch {
    console.error("document_delete_failed", { documentId, step });
    await service.from("document_deletion_requests").update({ last_error: step })
      .eq("document_id", documentId).eq("user_id", userId);
    return false;
  }
}

export async function processPendingDocumentDeletions(service: SupabaseClient, limit = 20) {
  const { data, error } = await service.from("document_deletion_requests")
    .select("document_id,user_id").is("processed_at", null).order("requested_at", { ascending: true }).limit(limit);
  if (error) throw new Error("document_deletion_queue_unavailable");
  let processed = 0;
  for (const row of data ?? []) {
    if (await purgeDeletedDocument(service, row.user_id, row.document_id)) processed += 1;
  }
  return processed;
}
