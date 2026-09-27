import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { prepareUserDocumentUpload, maxDocumentBytes, resolveUploadMime } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";
import { cleanupExpiredUploads } from "@/lib/documents/upload-cleanup";

const bodySchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().max(160),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload", limit: 6, dailyLimit: 40 });
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
  if ((pendingCount ?? 0) >= 3) {
    return NextResponse.json({ error: "Üç yükleme hazırlanıyor. Önce bunları tamamla veya biraz sonra yeniden dene." }, { status: 429 });
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
