import { NextResponse } from "next/server";
import { withUser, errorResponse } from "@/lib/api/guards";
import { recordAbuse } from "@/lib/abuse/record";
import { isPremiumUser } from "@/lib/ai/generate";
import { storeUserDocument } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "doc-upload",
    limit: 6,
    dailyLimit: 40,
  });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  // Alan dolu mu — yükleme başlamadan bakılıyor, yoksa dosyayı depoya
  // koyduktan sonra geri almak gerekirdi.
  const isPremium = await isPremiumUser(service, userId);
  const usage = await storageUsage(service, userId, isPremium);
  if (!fitsInQuota(usage, file.size)) {
    void recordAbuse({
      signal: "storage_cap",
      severity: "medium",
      scope: "doc-upload",
      userId,
      request,
      metadata: {
        usedBytes: usage.usedBytes,
        capBytes: usage.capBytes,
        fileSize: file.size,
      },
    });
    return errorResponse(413, "storage_full");
  }

  const stored = await storeUserDocument(service, userId, file);
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  return NextResponse.json({
    documentId: stored.documentId,
    status: "processing",
  });
}
