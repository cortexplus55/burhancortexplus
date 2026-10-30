import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { clearPendingMaterials, listPendingMaterials } from "@/lib/learning/pending-materials";

/*
  Hızlı başlatmanın arka planı (31 Ekim 2026). Hazırlık sayfasındaki şerit bu uçtan hazırlığa bağlı, henüz eklenmemiş
  belgeleri ve okuma ilerlemesini okur; öğrenci "Ekleme" derse satır silinir (belge Belgelerim'de kalır). Okutma ve
  ekleme var olan uçlardan geçer: /api/documents/process ve /api/learning/exam-prep/add-source.
*/
const prepIdSchema = z.string().uuid();
const deleteSchema = z.object({ prepId: z.string().uuid(), documentId: z.string().uuid() });

async function ownsPrep(
  service: Parameters<typeof listPendingMaterials>[0],
  userId: string,
  prepId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-pending", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const prepId = prepIdSchema.safeParse(new URL(request.url).searchParams.get("prepId"));
  if (!prepId.success) return errorResponse(400, "invalid_input");
  if (!(await ownsPrep(service, userId, prepId.data))) return errorResponse(404, "not_found");
  const materials = await listPendingMaterials(service, { prepId: prepId.data, userId });
  return NextResponse.json({ materials });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-pending", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await ownsPrep(service, userId, parsed.data.prepId))) return errorResponse(404, "not_found");
  await clearPendingMaterials(service, {
    prepId: parsed.data.prepId,
    userId,
    documentIds: [parsed.data.documentId],
  });
  return NextResponse.json({ ok: true });
}
