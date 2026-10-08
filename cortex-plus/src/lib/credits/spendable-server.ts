import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freePreview, previewAllowanceLeft } from "@/lib/billing/free-preview";

/**
 * Hesabın şu an harcayabileceği kredi — `credit_reserve` ile aynı hesap:
 * satın alınan kredi (`balance`) + dönem hakkı. Dönemi bitmiş hak ilk
 * işlemde yenileneceği için tam sayılır. Yönetici sınırsızdır (Infinity);
 * ücretsiz önizlemesi açıksa önizlemenin günlük hakkı sayılır.
 *
 * Ön kontrol için: belge sayfa sınırı ve önceden hazırlama. Asıl karar yine
 * `credit_reserve`'de; burası yalnız işe başlamadan "yeter mi" diye sorar.
 */
export async function spendableCredits(
  service: SupabaseClient,
  userId: string,
  now = Date.now(),
): Promise<number> {
  const { data: admin } = await service.rpc("is_admin", { uid: userId });
  if (admin === true) {
    const preview = await freePreview(service, userId).catch(() => null);
    return preview ? previewAllowanceLeft(preview, now) : Number.POSITIVE_INFINITY;
  }
  const { data } = await service
    .from("credit_wallets")
    .select("balance, free_allowance_remaining, period_allowance, period_ends_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return 0;
  const ended = data.period_ends_at ? new Date(data.period_ends_at as string).getTime() <= now : false;
  const allowance = Number((ended ? data.period_allowance : data.free_allowance_remaining) ?? 0);
  return Math.max(0, Number(data.balance ?? 0)) + Math.max(0, allowance);
}
