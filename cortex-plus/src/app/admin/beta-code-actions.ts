"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { BETA_BATCH_MAX, BETA_PLUS_DAYS, generateBetaCodes } from "@/lib/billing/promo-codes";
import { createServiceClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  count: z.number().int().min(1).max(BETA_BATCH_MAX),
  days: z.number().int().min(1).max(90).default(BETA_PLUS_DAYS),
  batch: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9 _-]*$/)
    .optional(),
});

export type BetaCodeResult = { ok: true; codes: string[]; batch: string } | { ok: false; error: string };

/**
 * Kapalı beta kodları (19 Ekim 2026, ürün sahibinin kararı): her öğrenciye tek kullanımlık kod,
 * kod `days` gün Plus açar (varsayılan 14). Kodlar listede bir kez gösterilir; tablo da her
 * kodu ve kullanan öğrenciyi gösterir. Üretim denetim günlüğüne adetle yazılır (kodların kendisi
 * değil).
 */
export async function generateBetaCodeBatch(input: { count: number; days?: number; batch?: string }): Promise<BetaCodeResult> {
  const { user } = await requireAdmin();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `1 ile ${BETA_BATCH_MAX} arası adet, 1 ile 90 arası gün gir.` };

  const { count, days } = parsed.data;
  const batch = parsed.data.batch?.trim() || `beta-${new Date().toISOString().slice(0, 10)}`;
  const service = createServiceClient();

  // Çakışma (kod zaten var) olasılığı çok düşük; olursa bir kez yeni kodlarla denenir.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const codes = generateBetaCodes(count);
    const { error } = await service.from("promo_codes").insert(
      codes.map((code) => ({
        code,
        credit_amount: 0,
        max_redemptions: 1,
        plus_days: days,
        batch,
      })),
    );
    if (!error) {
      await auditLog(service, {
        actorId: user.id,
        action: "promo.beta_batch_created",
        entityType: "promo_batch",
        entityId: batch,
        metadata: { count, days },
      }).catch(() => undefined);
      revalidatePath("/admin/promosyonlar");
      return { ok: true, codes, batch };
    }
    if (error.code !== "23505") return { ok: false, error: "Kodlar oluşturulamadı." };
  }
  return { ok: false, error: "Kodlar oluşturulamadı; yeniden dene." };
}
