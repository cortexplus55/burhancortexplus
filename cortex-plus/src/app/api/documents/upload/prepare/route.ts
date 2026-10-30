import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { prepareUserDocumentUpload, maxDocumentBytes, resolveUploadMime } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";
import { cleanupExpiredUploads } from "@/lib/documents/upload-cleanup";
import { UPLOAD_PENDING_MAX, UPLOAD_PREPARE_PER_DAY, UPLOAD_PREPARE_PER_MINUTE } from "@/lib/documents/upload-limits";

const bodySchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().max(160),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload", limit: UPLOAD_PREPARE_PER_MINUTE, dailyLimit: UPLOAD_PREPARE_PER_DAY });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_file");
  const { service, userId } = guard.ctx;
  const mimeType = resolveUploadMime({ type: parsed.data.mimeType, name: parsed.data.fileName }, Buffer.alloc(0));
  if (!mimeType || parsed.data.sizeBytes > maxDocumentBytes(mimeType)) {
    return errorResponse(400, "invalid_file");
  }
  await cleanupExpiredUploads(service, { userId, limit: 4 });
  const { count: pendingCount, error: pendingError } = await service.from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "pending").is("deleted_at", null);
  if (pendingError) return errorResponse(503, "upload_failed");
  if ((pendingCount ?? 0) >= UPLOAD_PENDING_MAX) {
    return NextResponse.json(
      { error: "Çok sayıda yükleme aynı anda hazırlanıyor. Birkaç saniye içinde kendiliğinden sürecek." },
      { status: 429, headers: { "retry-after": "2" } },
    );
  }
  const usage = await storageUsage(service, userId, await isPremiumUser(service, userId));
  if (!fitsInQuota(usage, parsed.data.sizeBytes)) return errorResponse(413, "storage_full");
  const prepared = await prepareUserDocumentUpload(service, userId, parsed.data);
  if (!prepared.ok) return errorResponse(400, prepared.error);
  return NextResponse.json({
    documentId: prepared.documentId,
    path: prepared.path,
    token: prepared.token,
    mimeType: prepared.mimeType,
  });
}
