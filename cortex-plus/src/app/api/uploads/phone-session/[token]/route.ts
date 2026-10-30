import { NextResponse } from "next/server";
import { withUser, errorResponse } from "@/lib/api/guards";
import { phoneSessionDocuments, type PhoneSessionRow } from "@/lib/documents/phone-session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const guard = await withUser(request, { scope: "phone-session-poll", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { token } = await params;

  const { data } = await service
    .from("phone_upload_sessions")
    .select("*")
    .eq("token", token)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return errorResponse(404, "not_found");

  const row = data as PhoneSessionRow;
  const expired = new Date(row.expires_at).getTime() < Date.now();
  // Çok dosya (31 Ekim 2026): gelen bütün dosyalar geliş sırasıyla; ilk dosya eski alanlarda da durur.
  return NextResponse.json({
    documentId: row.document_id ?? null,
    fileName: row.file_name ?? null,
    documents: phoneSessionDocuments(row),
    many: Array.isArray(row.document_ids),
    expired,
    ready: Boolean(row.document_id),
  });
}
