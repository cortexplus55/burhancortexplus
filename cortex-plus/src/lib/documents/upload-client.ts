import { createClient } from "@/lib/supabase/client";

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

/** Browser bytes go straight to the private bucket; Next only signs and verifies. */
export async function uploadDocumentFile(file: File): Promise<{ documentId: string }> {
  const prepareResponse = await fetch("/api/documents/upload/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
  });
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
