import { v4 as uuidv4 } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  // Slayt ve Word: içinde XML taşıyan zip'ler, metin zaten orada duruyor.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Tarayıcı HEIC için boş tür gönderebiliyor. Ad ve dosya başı türü tamamlar. */
export function resolveUploadMime(
  file: { type: string; name: string },
  head: Buffer,
): string | null {
  const declared = (file.type || "").toLowerCase();
  if (DOCUMENT_ALLOWED_TYPES.has(declared)) return declared;
  const lower = file.name.toLowerCase();
  const extension = Object.keys(MIME_BY_EXTENSION).find((item) => lower.endsWith(item));
  if (extension) return MIME_BY_EXTENSION[extension];
  if (head.length >= 12 && head.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = head.subarray(8, 12).toString("ascii");
    if (/^(heic|heix|heif|mif1|msf1)/.test(brand)) return "image/heic";
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

export async function storeUserDocument(
  service: SupabaseClient,
  userId: string,
  file: File,
) {
  if (file.size === 0 || file.size > DOCUMENT_MAX_BYTES) {
    return { ok: false as const, error: "invalid_file" as const };
  }

  const documentId = uuidv4();
  const path = `${userId}/${documentId}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = resolveUploadMime(file, buffer.subarray(0, 16));
  if (!mimeType) return { ok: false as const, error: "invalid_file" as const };

  const { error: upErr } = await service.storage
    .from("documents")
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (upErr) {
    return { ok: false as const, error: "upload_failed" as const };
  }

  const { error: documentError } = await service.from("documents").insert({
    id: documentId,
    user_id: userId,
    file_name: file.name,
    storage_path: path,
    mime_type: mimeType,
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
