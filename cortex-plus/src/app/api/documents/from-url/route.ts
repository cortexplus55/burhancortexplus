import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser, errorResponse } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { storeUserDocument } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";
import { fetchImportedDocument, URL_IMPORT_MESSAGES } from "@/lib/documents/url-import";

export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().min(8).max(2_048) });

/**
 * Bağlantıdan belge (29 Ekim 2026). Sayfa metni ya da bağlantının PDF'i, yüklenmiş dosyayla aynı
 * kayda (documents + processing_jobs) girer; işleme bildiğimiz yoldan (`/api/documents/process`).
 * Dışarıya istek atan tek uç: adres denetimi `url-import.ts`'te, sınır dakikada 4 / günde 30.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-from-url", limit: 4, dailyLimit: 30 });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const imported = await fetchImportedDocument(parsed.data.url);
  if (!imported.ok) {
    // Özel ağ adresi denemesi günlüğe (adres değil yalnız ana makine adı; metin yok).
    if (imported.error === "url_private") console.warn("doc_from_url_private", { userId, host: safeHost(parsed.data.url) });
    return NextResponse.json({ error: URL_IMPORT_MESSAGES[imported.error], code: imported.error }, { status: 400 });
  }

  const { file } = imported.document;
  const isPremium = await isPremiumUser(service, userId);
  const usage = await storageUsage(service, userId, isPremium);
  if (!fitsInQuota(usage, file.size)) return errorResponse(413, "storage_full");

  const stored = await storeUserDocument(service, userId, file);
  if (!stored.ok) return errorResponse(400, stored.error);

  return NextResponse.json({
    documentId: stored.documentId,
    fileName: stored.fileName,
    sizeBytes: file.size,
    kind: imported.document.kind,
    status: "processing",
  });
}

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}
