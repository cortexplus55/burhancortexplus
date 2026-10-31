import { v4 as uuidv4 } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIME_BY_EXTENSION } from "@/lib/documents/upload-accept";

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
/**
 * Depolamanın tek dosya tavanı (Supabase ücretsiz plan: sabit 50 MB, 31 Ekim 2026'da panelden doğrulandı). Daha büyük
 * PDF tarayıcıda parçalara bölünür (pdf-split-client.ts); Word/sunu bölünemez, 50 MB'a kadar kabul edilir.
 */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const OFFICE_MAX_BYTES = PDF_MAX_BYTES;
const OFFICE_MIME = /officedocument\.(wordprocessingml|presentationml)/;
export function maxDocumentBytes(mimeType: string): number {
  if (mimeType === "application/pdf") return PDF_MAX_BYTES;
  if (OFFICE_MIME.test(mimeType)) return OFFICE_MAX_BYTES;
  return DOCUMENT_MAX_BYTES;
}

const TURKISH_ASCII: Record<string, string> = {
  ı: "i", İ: "I", ğ: "g", Ğ: "G", ş: "s", Ş: "S", ç: "c", Ç: "C", ö: "o", Ö: "O", ü: "u", Ü: "U",
};

/**
 * Storage paths are server-generated; a supplied file name must never add folders.
 *
 * 31 Ekim 2026: Supabase Storage anahtarı yalnız ASCII harf, rakam ve birkaç işaret kabul ediyor; "ğ, ı, ş, ü" ya da
 * "–" taşıyan anahtarda imzalı yükleme düşüyor, belge "boyutu doğrulanamadı" ile siliniyordu (canlıda son 400 belgenin
 * hiçbirinin yolunda Türkçe harf yoktu). Yol ASCII'ye çevrilir; öğrencinin gördüğü ad (`file_name`) aynen kalır.
 */
export function safeDocumentName(name: string): string {
  const ascii = name
    .replace(/[ıİğĞşŞçÇöÖüÜ]/g, (char) => TURKISH_ASCII[char] ?? "_")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[^A-Za-z0-9_!\-.*'() &$@=;:+,?]/g, "_");
  return ascii.slice(0, 180) || "belge";
}
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
  const path = `${userId}/${documentId}/${safeDocumentName(file.name)}`;
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

/** The signed upload token sends bytes directly to the private Storage bucket. */
export async function prepareUserDocumentUpload(
  service: SupabaseClient,
  userId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number },
) {
  const mimeType = resolveUploadMime({ type: input.mimeType, name: input.fileName }, Buffer.alloc(0));
  if (!mimeType || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 ||
      input.sizeBytes > maxDocumentBytes(mimeType)) {
    return { ok: false as const, error: "invalid_file" as const };
  }
  const documentId = uuidv4();
  const path = `${userId}/${documentId}/${safeDocumentName(input.fileName)}`;
  const { data: signed, error: signError } = await service.storage
    .from("documents")
    .createSignedUploadUrl(path, { upsert: false });
  if (signError || !signed) return { ok: false as const, error: "upload_failed" as const };

  const { error: documentError } = await service.from("documents").insert({
    id: documentId,
    user_id: userId,
    file_name: input.fileName.slice(0, 240),
    storage_path: path,
    mime_type: mimeType,
    size_bytes: input.sizeBytes,
    status: "pending",
  });
  if (documentError) return { ok: false as const, error: "upload_failed" as const };
  const { error: jobError } = await service.from("processing_jobs").insert({
    document_id: documentId,
    job_type: "extract",
    status: "pending",
  });
  if (jobError) {
    await service.from("documents").delete().eq("id", documentId).eq("user_id", userId);
    return { ok: false as const, error: "upload_failed" as const };
  }
  return { ok: true as const, documentId, path, token: signed.token, mimeType };
}
