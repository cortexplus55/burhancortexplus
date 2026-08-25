import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { errorResponse, withUser } from "@/lib/api/guards";
import { auditLog } from "@/lib/audit";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "teacher-apply", limit: 3 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const form = await request.formData();
  const institution = String(form.get("institution") ?? "").slice(0, 200);
  const file = form.get("document");

  if (institution.length < 2) return errorResponse(400, "invalid_input");

  const { data: existing } = await service
    .from("teacher_applications")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Zaten değerlendirmede olan bir başvurun var." },
      { status: 409 },
    );
  }

  let documentPath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES || !ALLOWED.has(file.type)) {
      return errorResponse(400, "invalid_input");
    }
    documentPath = `${userId}/teacher/${randomUUID()}-${file.name}`;
    const upload = await service.storage
      .from("documents")
      .upload(documentPath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (upload.error) return errorResponse(500, "generation_failed");
  }

  const { error } = await service.from("teacher_applications").insert({
    user_id: userId,
    institution,
    document_path: documentPath,
    status: "pending",
  });

  if (error) return errorResponse(500, "generation_failed");

  await service
    .from("profiles")
    .update({ teacher_application_status: "pending" })
    .eq("id", userId);

  await auditLog(service, {
    actorId: userId,
    action: "teacher.application.submitted",
    entityType: "teacher_application",
  });

  return NextResponse.json({ ok: true, status: "pending" });
}
