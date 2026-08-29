import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { storeUserDocument } from "@/lib/documents/store-upload";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const { data } = await service
    .from("phone_upload_sessions")
    .select("document_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ valid: false, reason: "not_found" }, { status: 404 });
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }
  if (data.document_id) {
    return NextResponse.json({ valid: false, reason: "used" });
  }
  return NextResponse.json({ valid: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const { data: session } = await service
    .from("phone_upload_sessions")
    .select("id, user_id, document_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (session.document_id) {
    return NextResponse.json({ error: "used" }, { status: 409 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const stored = await storeUserDocument(service, session.user_id, file);
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  const { error } = await service
    .from("phone_upload_sessions")
    .update({
      document_id: stored.documentId,
      file_name: stored.fileName,
    })
    .eq("id", session.id)
    .is("document_id", null);

  if (error) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    documentId: stored.documentId,
    fileName: stored.fileName,
  });
}
