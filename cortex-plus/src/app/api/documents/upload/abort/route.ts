import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const bodySchema = z.object({ documentId: z.string().uuid() });

/** Remove an unconfirmed upload after a failed browser-to-Storage transfer. */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-upload-abort", limit: 12 });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { service, userId } = guard.ctx;
  const { data: doc } = await service.from("documents")
    .update({ status: "failed", error_message: "upload_expired" })
    .eq("id", parsed.data.documentId).eq("user_id", userId).eq("status", "pending")
    .is("deleted_at", null).select("id, storage_path").maybeSingle();
  if (!doc) return NextResponse.json({ ok: true });
  const { error: storageError } = await service.storage.from("documents").remove([doc.storage_path]);
  if (storageError) return errorResponse(503, "upload_failed");
  const { error: deleteError } = await service.from("documents")
    .delete().eq("id", doc.id).eq("user_id", userId)
    .eq("status", "failed").eq("error_message", "upload_expired");
  if (deleteError) return errorResponse(503, "upload_failed");
  return NextResponse.json({ ok: true });
}
