import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maxDocumentBytes } from "@/lib/documents/store-upload";

/**
 * İmzalı yüklemenin son adımı: dosya depoya gerçekten yazıldı mı (boy ve tür bildirilenle aynı mı), sonra belge
 * "processing" olur. Masaüstü ucu (/api/documents/upload/complete) ve telefon ucu (31 Ekim 2026: telefondan büyük
 * fotoğraf seti PDF'i 4,5 MB gövde sınırını aşar, imzalı yüklemeyle gider) aynı denetimden geçer.
 */
export type CompleteUploadResult =
  | { ok: true; documentId: string; status: string; fileName: string }
  | { ok: false; status: number; error: string };

export async function completeDocumentUpload(
  service: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<CompleteUploadResult> {
  const { data: doc, error: readError } = await service.from("documents")
    .select("id, storage_path, mime_type, size_bytes, status, file_name")
    .eq("id", documentId).eq("user_id", userId).is("deleted_at", null)
    .maybeSingle();
  if (readError) return { ok: false, status: 503, error: "upload_failed" };
  if (!doc) return { ok: false, status: 404, error: "not_found" };
  const fileName = String(doc.file_name ?? "");
  if (doc.status !== "pending") {
    return doc.status === "processing" || doc.status === "completed"
      ? { ok: true, documentId: doc.id as string, status: String(doc.status), fileName }
      : { ok: false, status: 409, error: "upload_failed" };
  }
  const { data: stored, error: infoError } = await service.storage.from("documents").info(doc.storage_path);
  const actualSize = Number(stored?.size);
  if (infoError || !Number.isSafeInteger(actualSize) || actualSize !== Number(doc.size_bytes) ||
      actualSize <= 0 || actualSize > maxDocumentBytes(doc.mime_type)) {
    return { ok: false, status: 422, error: "Yüklenen dosyanın boyutu doğrulanamadı. Yeniden yükle." };
  }
  if (stored?.contentType && stored.contentType.split(";")[0].trim() !== doc.mime_type) {
    return { ok: false, status: 422, error: "Yüklenen dosyanın türü doğrulanamadı. Yeniden yükle." };
  }
  const { error: updateError } = await service.from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", doc.id).eq("user_id", userId).eq("status", "pending");
  if (updateError) return { ok: false, status: 503, error: "upload_failed" };
  return { ok: true, documentId: doc.id as string, status: "processing", fileName };
}
