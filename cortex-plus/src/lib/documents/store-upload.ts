import { v4 as uuidv4 } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export async function storeUserDocument(
  service: SupabaseClient,
  userId: string,
  file: File,
) {
  if (file.size === 0 || file.size > DOCUMENT_MAX_BYTES || !DOCUMENT_ALLOWED_TYPES.has(file.type)) {
    return { ok: false as const, error: "invalid_file" as const };
  }

  const documentId = uuidv4();
  const path = `${userId}/${documentId}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await service.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    return { ok: false as const, error: "upload_failed" as const };
  }

  const { error: documentError } = await service.from("documents").insert({
    id: documentId,
    user_id: userId,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    status: "processing",
  });

  if (documentError) {
    await service.storage.from("documents").remove([path]);
    return { ok: false as const, error: "upload_failed" as const };
  }

  const { error: jobError } = await service.from("processing_jobs").insert({
    document_id: documentId,
    job_type: "extract",
    status: "pending",
  });

  if (jobError) {
    await service.from("documents").delete().eq("id", documentId);
    await service.storage.from("documents").remove([path]);
    return { ok: false as const, error: "upload_failed" as const };
  }

  return { ok: true as const, documentId, fileName: file.name };
}
