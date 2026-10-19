import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { auditLog } from "@/lib/audit";
import {
  PROMO_CODE_PATTERN,
  normalizePromoCode,
  redeemFailureMessage,
  redeemSuccessMessage,
} from "@/lib/billing/promo-codes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(1).max(60) });

type RedeemRow = {
  ok?: boolean;
  reason?: string;
  plusDays?: number | null;
  plusUntil?: string | null;
  credits?: number | null;
};

/**
 * Öğrenci kampanya ya da beta kodunu kullanır (19 Ekim 2026, kapalı beta).
 *
 * Bütün kontrol ve yazım tek SQL fonksiyonunda (`redeem_promo_code`): kod geçerli mi, bu hesap
 * kullandı mı, Plus denemesi daha önce alındı mı, ücretli abonelik sürüyor mu; sonra abonelik,
 * cüzdan, kayıt ve bildirim aynı işlemde. Sınır sıkı (dakikada 5, günde 20): kodlar tahminle
 * denenmesin.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "promo-redeem", limit: 5, dailyLimit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const code = parsed.success ? normalizePromoCode(parsed.data.code) : "";
  if (!PROMO_CODE_PATTERN.test(code)) {
    return NextResponse.json({ ok: false, reason: "invalid_code", error: redeemFailureMessage("invalid_code") }, { status: 400 });
  }

  const { data, error } = await service.rpc("redeem_promo_code", { p_user_id: userId, p_code: code });
  if (error) {
    return NextResponse.json(
      { ok: false, reason: "unavailable", error: "Kod şu an kullanılamadı. Biraz sonra yeniden dene." },
      { status: 503 },
    );
  }

  const row = (data ?? {}) as RedeemRow;
  if (!row.ok) {
    return NextResponse.json(
      { ok: false, reason: row.reason ?? "invalid_code", error: redeemFailureMessage(row.reason) },
      { status: 400 },
    );
  }

  const result = {
    plusDays: row.plusDays ?? null,
    plusUntil: row.plusDays ? (row.plusUntil ?? null) : null,
    credits: row.credits ?? 0,
  };
  await auditLog(service, {
    actorId: userId,
    action: "promo.redeemed",
    entityType: "promo_code",
    entityId: code,
    metadata: result,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, ...result, message: redeemSuccessMessage(result) });
}
