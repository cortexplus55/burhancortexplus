import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { guestLimit } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { prepareUserDocumentUpload, maxDocumentBytes, resolveUploadMime } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";
import { openPhoneSession } from "@/lib/documents/phone-session-guard";
import { UPLOAD_PENDING_MAX } from "@/lib/documents/upload-limits";

/*
  Telefondan imzalı yükleme, 1. adım (31 Ekim 2026). Telefon fotoğrafları tek PDF'te birleştirince (fotoğraf seti)
  dosya 4,5 MB'lık istek gövdesini aşıyor; bayt doğrudan depoya gider, bu uç yalnız imzalar. Kimlik yerine
  bağlantıdaki kod (16 rastgele bayt); belge oturum sahibinin alanına, onun depo tavanıyla yazılır.
*/
const bodySchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().max(160),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await guestLimit(request, {
    scope: "phone-upload",
    limit: 120,
    signal: "token_bruteforce",
    severity: "medium",
  });
  if (limited) return limited;
  const { token } = await params;
  const service = createServiceClient();
  const session = await openPhoneSession(service, request, token, "phone-upload");
  if (!session.ok) return session.response;
  const { row } = session;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  const mimeType = resolveUploadMime({ type: parsed.data.mimeType, name: parsed.data.fileName }, Buffer.alloc(0));
  if (!mimeType || parsed.data.sizeBytes > maxDocumentBytes(mimeType)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }
  const { count: pendingCount, error: pendingError } = await service.from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", row.user_id).eq("status", "pending").is("deleted_at", null);
  if (pendingError) return NextResponse.json({ error: "upload_failed" }, { status: 503 });
  if ((pendingCount ?? 0) >= UPLOAD_PENDING_MAX) {
    return NextResponse.json({ error: "busy" }, { status: 429, headers: { "retry-after": "2" } });
  }
  const usage = await storageUsage(service, row.user_id, await isPremiumUser(service, row.user_id));
  if (!fitsInQuota(usage, parsed.data.sizeBytes)) return NextResponse.json({ error: "storage_full" }, { status: 413 });
  const prepared = await prepareUserDocumentUpload(service, row.user_id, parsed.data);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
  return NextResponse.json({
    documentId: prepared.documentId,
    path: prepared.path,
    token: prepared.token,
    mimeType: prepared.mimeType,
  });
}
