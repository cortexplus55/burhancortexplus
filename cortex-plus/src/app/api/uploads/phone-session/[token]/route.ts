import { NextResponse } from "next/server";
import { withUser, errorResponse } from "@/lib/api/guards";

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
    .select("document_id, file_name, expires_at")
    .eq("token", token)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return errorResponse(404, "not_found");

  const expired = new Date(data.expires_at).getTime() < Date.now();
  return NextResponse.json({
    documentId: data.document_id,
    fileName: data.file_name,
    expired,
    ready: Boolean(data.document_id),
  });
}
