"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { FREE_DAILY_ALLOWANCE } from "@/lib/credits/period";
import { createServiceClient } from "@/lib/supabase/server";

function nextUtcDay(now = new Date()): string {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
}

/**
 * Yönetici "ücretsiz gibi gör" önizlemesini açar ya da kapatır
 * (free-preview.ts). Her açılış yeni bir ücretsiz hesap gibi başlar: günlük
 * hak dolu, belge ve hazırlık sayacı sıfır.
 */
export async function setFreePreview(on: boolean): Promise<{ ok: boolean }> {
  const { user } = await requireAdmin();
  const service = createServiceClient();
  const { error } = on
    ? await service.from("admin_free_preview").upsert({
        user_id: user.id,
        started_at: new Date().toISOString(),
        remaining: FREE_DAILY_ALLOWANCE,
        period_ends_at: nextUtcDay(),
      })
    : await service.from("admin_free_preview").delete().eq("user_id", user.id);
  if (error) return { ok: false };
  await auditLog(service, {
    actorId: user.id,
    action: on ? "free_preview_on" : "free_preview_off",
    entityType: "user",
    entityId: user.id,
  }).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}
