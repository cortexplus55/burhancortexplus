"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdminActor } from "@/lib/auth/admin-actor";
import { generatePromoCode } from "@/lib/billing/promo-codes";
import { PROMO_PREFIX, validatePromoForm, type PromoFormInput } from "@/lib/billing/promo-form";
import { createServiceClient } from "@/lib/supabase/server";

/*
  Promosyon ve hediye kodları (6 Kasım 2026). Ürün sahibinin kuralı: fiyat, kredi kuralları ve harcama tavanı
  kurucuya özel; promosyon kodu bu listede değil, yönetici de oluşturur ve açıp kapatır. Her işlem denetim
  kaydına yazılır (kim, hangi kod, hangi hak). Kodu kullanmak `redeem_promo_code`'da; burası yalnız satır yazar.
*/

export type PromoActionResult = { ok: true; message: string; code?: string } | { ok: false; error: string };

/** Yeni kod: X gün Plus ya da +Y hediye kredi, en çok N kullanım, isteğe bağlı son tarih. */
export async function createPromoCode(input: PromoFormInput): Promise<PromoActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };
  const parsed = validatePromoForm(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const spec = parsed.spec;
  const service = createServiceClient();

  // Kod boşsa üretilir; çakışma (aynı kod var) olasılığı çok düşük, olursa bir kez yeni kodla denenir.
  const attempts = spec.code ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = spec.code ?? generatePromoCode(PROMO_PREFIX[spec.grant]);
    const { error } = await service.from("promo_codes").insert({
      code,
      credit_amount: spec.credits,
      plus_days: spec.plusDays,
      max_redemptions: spec.maxUses,
      expires_at: spec.expiresAt,
    });
    if (!error) {
      await auditLog(service, {
        actorId,
        action: "promo.created",
        entityType: "promo_code",
        entityId: code,
        metadata: {
          grant: spec.grant,
          plus_days: spec.plusDays,
          credit_amount: spec.credits,
          max_redemptions: spec.maxUses,
          expires_at: spec.expiresAt,
          generated: !spec.code,
        },
      });
      revalidatePath("/admin/promosyonlar");
      return { ok: true, code, message: `${code} oluşturuldu.` };
    }
    if (error.code !== "23505") return { ok: false, error: "Kod oluşturulamadı." };
    if (spec.code) return { ok: false, error: "Bu kod zaten var." };
  }
  return { ok: false, error: "Kod oluşturulamadı; yeniden dene." };
}

/** Kodu tek tıkla Aktif / Pasif yapar. Pasif kodu öğrenci kullanamaz; daha önce kullananın hakkı geri alınmaz. */
export async function togglePromoCode(promoId: string, active: boolean): Promise<PromoActionResult> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };
  const parsed = z.object({ id: z.string().uuid(), active: z.boolean() }).safeParse({ id: promoId, active });
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { data, error } = await service
    .from("promo_codes")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id)
    .select("code")
    .maybeSingle();
  if (error) return { ok: false, error: "Güncellenemedi." };
  if (!data) return { ok: false, error: "Kod bulunamadı." };

  const code = String((data as { code?: unknown }).code ?? "");
  await auditLog(service, {
    actorId,
    action: parsed.data.active ? "promo.enabled" : "promo.disabled",
    entityType: "promo_code",
    entityId: parsed.data.id,
    metadata: { active: parsed.data.active, code },
  });
  revalidatePath("/admin/promosyonlar");
  return { ok: true, message: parsed.data.active ? `${code} aktif.` : `${code} pasif; artık kullanılamaz.` };
}
