import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/documents/image-compress";

/** "Yoğun" (429) cevabında yükleme hazırlığının yeniden denenme sayısı. */
const PREPARE_RETRIES = 5;

type PreparedUpload = {
  documentId: string;
  path: string;
  token: string;
  mimeType: string;
};

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

function responseError(body: Record<string, unknown>, fallback: string): Error {
  return new Error(typeof body.error === "string" ? body.error : fallback);
}

/**
 * Browser bytes go straight to the private bucket; Next only signs and verifies.
 * Fotoğraf önce cihazda 2048 piksele küçültülür (31 Ekim 2026, `image-compress.ts`): 3,5 MB → ~0,5 MB.
 */
export async function uploadDocumentFile(original: File): Promise<{ documentId: string }> {
  const file = await compressImageForUpload(original);
  // Toplu yüklemede "yoğun" (429) cevabı bir an sürer (aynı anda hazırlanan yükleme ya da dakika sınırı): kısa
  // bekleyip yeniden dener; dosya düşmez (31 Ekim 2026).
  let prepareResponse: Response;
  for (let attempt = 0; ; attempt += 1) {
    prepareResponse = await fetch("/api/documents/upload/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
    });
    if (prepareResponse.status !== 429 || attempt >= PREPARE_RETRIES) break;
    const hinted = Number(prepareResponse.headers.get("retry-after"));
    const waitMs = Number.isFinite(hinted) && hinted > 0 ? Math.min(hinted * 1000, 15_000) : 1_500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const prepareBody = await responseBody(prepareResponse);
  if (!prepareResponse.ok) throw responseError(prepareBody, "Yükleme başlatılamadı.");
  const prepared = prepareBody as PreparedUpload;
  if (!prepared.documentId || !prepared.path || !prepared.token || !prepared.mimeType) {
    throw new Error("Yükleme bağlantısı alınamadı.");
  }

  const storage = createClient().storage.from("documents");
  let uploadError: string | null = null;
  try {
    const { error } = await storage.uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: prepared.mimeType,
      upsert: false,
    });
    uploadError = error?.message ?? null;
  } catch {
    uploadError = "Dosya deposuna bağlantı kurulamadı.";
  }

  const abortPending = async () => {
    await fetch("/api/documents/upload/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: prepared.documentId }),
    }).catch(() => {});
  };

  // A dropped response may follow a successful Storage write. Verify before aborting.
  let completeResponse: Response;
  try {
    completeResponse = await fetch("/api/documents/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: prepared.documentId }),
    });
  } catch {
    await abortPending();
    throw new Error(uploadError ?? "Yükleme sırasında bağlantı koptu.");
  }
  const completeBody = await responseBody(completeResponse);
  if (completeResponse.ok) return { documentId: prepared.documentId };
  await abortPending();
  throw responseError(completeBody, uploadError ?? "Dosya doğrulanamadı. Yeniden yükle.");
}
