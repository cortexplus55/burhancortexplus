"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Destek talebini "cevaplandı" yapar (19 Ekim 2026). Cevap e-postayla gider; burada yalnız an
 * yazılır: destek sözü (24 saat) ve beta çıkış ölçütü bu süreyle ölçülür, günlük özetin
 * "24 saati geçti" sayısı da bu talepten düşer. İkinci tıklama ilk anı değiştirmez.
 */
export async function markSupportAnswered(requestId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAdmin();
  const parsed = z.string().uuid().safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { data, error } = await service
    .from("support_requests")
    .update({ status: "answered", answered_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("answered_at", null)
    .select("id, created_at, answered_at")
    .maybeSingle();
  if (error) return { ok: false, error: "Kaydedilemedi." };
  if (data) {
    const hours =
      (new Date(data.answered_at as string).getTime() - new Date(data.created_at as string).getTime()) / 3_600_000;
    await auditLog(service, {
      actorId: user.id,
      action: "support.answered",
      entityType: "support_request",
      entityId: parsed.data,
      metadata: { hours: Math.round(hours * 10) / 10 },
    }).catch(() => undefined);
  }
  revalidatePath("/admin/destek");
  return { ok: true };
}
