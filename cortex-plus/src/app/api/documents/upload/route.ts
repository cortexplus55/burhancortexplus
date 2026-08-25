import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES || !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const docId = uuidv4();
  const path = `${user.id}/${docId}/${file.name}`;
  const service = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await service.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  await service.from("documents").insert({
    id: docId,
    user_id: user.id,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    status: "processing",
  });

  await service.from("processing_jobs").insert({
    document_id: docId,
    job_type: "extract",
    status: "pending",
  });

  return NextResponse.json({ documentId: docId, status: "processing" });
}
