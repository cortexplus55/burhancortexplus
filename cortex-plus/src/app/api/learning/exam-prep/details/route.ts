import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

/**
 * Hazırlığın adı ve hedef puanı (PATCH), hazırlığı silme (DELETE).
 * Astra'daki hazırlık Ayarlar'ı (1 Ekim 2026). Plan ayarları ayrı uçta
 * (`/settings`) kalıyor; bunlar planı yeniden kurmaz.
 */
const patchSchema = z
  .object({
    prepId: z.string().uuid(),
    title: z.string().trim().min(1).max(120).optional(),
    targetScore: z.number().int().min(1).max(100).nullable().optional(),
  })
  .refine((body) => body.title !== undefined || body.targetScore !== undefined, {
    message: "nothing_to_update",
  });

const deleteSchema = z.object({ prepId: z.string().uuid() });

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-details", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.targetScore !== undefined) update.target_score = parsed.data.targetScore;

  const { data, error } = await service
    .from("exam_preps")
    .update(update)
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .select("id, title, target_score")
    .maybeSingle();
  if (error) return errorResponse(500, "update_failed");
  if (!data) return errorResponse(404, "not_found");

  return NextResponse.json({ ok: true, title: data.title, targetScore: data.target_score });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-delete", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data, error } = await service.rpc("delete_exam_prep", {
    p_prep_id: parsed.data.prepId,
    p_user_id: userId,
  });
  if (error) {
    console.error("exam_prep_delete_failed", { code: error.code ?? "unknown" });
    return errorResponse(500, "delete_failed");
  }
  if (data !== true) return errorResponse(404, "not_found");
  return NextResponse.json({ ok: true });
}
