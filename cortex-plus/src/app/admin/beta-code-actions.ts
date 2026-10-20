"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import {
  BETA_BATCH_MAX,
  BETA_PLUS_DAYS,
  PROMO_CODE_PATTERN,
  SHARED_BETA_MAX_USES,
  generateBetaCode,
  generateBetaCodes,
  normalizePromoCode,
} from "@/lib/billing/promo-codes";
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

const sharedSchema = z.object({
  code: z.string().trim().max(40).optional(),
  uses: z.number().int().min(2).max(SHARED_BETA_MAX_USES),
  days: z.number().int().min(1).max(90).default(BETA_PLUS_DAYS),
});

export type SharedBetaCodeResult = { ok: true; code: string; uses: number; days: number } | { ok: false; error: string };

/**
 * Ortak beta kodu (20 Ekim 2026): sosyal medya duyurusunda tek bağlantı, ilk `uses` kişiye `days` gün
 * Plus. Kişi başına bir kez, hesap başına tek deneme (`redeem_promo_code`). Kod boşsa üretilir.
 */
export async function createSharedBetaCode(input: { code?: string; uses: number; days?: number }): Promise<SharedBetaCodeResult> {
  const { user } = await requireAdmin();
  const parsed = sharedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `2 ile ${SHARED_BETA_MAX_USES} arası kişi, 1 ile 90 arası gün gir.` };
  const code = parsed.data.code ? normalizePromoCode(parsed.data.code) : generateBetaCode();
  if (!PROMO_CODE_PATTERN.test(code)) return { ok: false, error: "Kod yalnızca harf, rakam ve tire içerebilir (3-40)." };
  const { uses, days } = parsed.data;
  const service = createServiceClient();
  const { error } = await service.from("promo_codes").insert({
    code,
    credit_amount: 0,
    max_redemptions: uses,
    plus_days: days,
    batch: `ortak-${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Bu kod zaten var." : "Kod oluşturulamadı." };
  await auditLog(service, {
    actorId: user.id,
    action: "promo.beta_shared_created",
    entityType: "promo_code",
    entityId: code,
    metadata: { uses, days },
  }).catch(() => undefined);
  revalidatePath("/admin/promosyonlar");
  return { ok: true, code, uses, days };
}

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
