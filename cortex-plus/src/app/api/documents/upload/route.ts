import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { storeUserDocument } from "@/lib/documents/store-upload";

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
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
