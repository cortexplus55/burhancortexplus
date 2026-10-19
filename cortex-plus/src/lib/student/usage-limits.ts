import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyKey, peekCount } from "@/lib/rate-limit";
import {
  FREE_IMAGE_DAILY_LIMIT,
} from "@/lib/ai/image-quota";
import { photoPageLimit, type PlanTier } from "@/lib/documents/photo-quota";

/**
 * Krediden BAĞIMSIZ limitler.
 *
 * 18 Eylül 2026'da üç yeni sınır geldi ve üçü de görünmez kaldı: fotoğraf
 * sayfası kotası, zor soru yükseltmesi tavanı, ücretsiz hesapta günlük
 * fotoğraf. Görünmeyen bir limit çarptığında sürpriz olur — öğrenci ne
 * yaptığını değil, ürünün bozulduğunu düşünür.
 *
 * Kredi kotası `/krediler` sayfasında zaten vardı; eksik olan, krediyle
 * ölçülmeyen bu üç sayaçtı. Sayaçların ikisi veritabanında (RLS açık,
 * politika yok — bu yüzden service role ile okunuyor), biri hız sınırı
 * deposunda.
 */

export type UsageLimit = {
  key: string;
  label: string;
  used: number;
  limit: number;
  hint: string;
};

type Grant = { period_start: string; used: number } | null;

/** Sayaç bu döneme mi ait — ay dönmüşse bayat sayıyı göstermeyelim. */
function usedThisMonth(grant: Grant, now: Date): number {
  if (!grant) return 0;
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return grant.period_start === period ? Math.max(0, grant.used) : 0;
}

export async function loadUsageLimits(
  service: SupabaseClient,
  userId: string,
  tier: PlanTier,
  now = new Date(),
  options?: { isAdmin?: boolean },
): Promise<UsageLimit[]> {
  if (options?.isAdmin) {
    return [
      {
        key: "photo-pages",
        label: "Fotoğraf ve PDF sayfa",
        used: 0,
        limit: Number.MAX_SAFE_INTEGER,
        hint: "Sınırsız",
      },
    ];
  }

  const [photo, dailyPhotos] = await Promise.all([
    service
      .from("document_page_grants")
      .select("period_start, used")
      .eq("user_id", userId)
      .maybeSingle(),
    tier === "free"
      ? peekCount(dailyKey(userId, "image-free", now))
      : Promise.resolve(0),
  ]);

  const limits: UsageLimit[] = [];

  const photoLimit = photoPageLimit(tier);
  limits.push({
    key: "photo-pages",
    label: tier === "free" ? "Fotoğraf ve PDF sayfa" : "Fotoğraf belgesi",
    used: Math.min(usedThisMonth(photo.data as Grant, now), photoLimit),
    limit: photoLimit,
    hint:
      tier === "free"
        ? `PDF sayfa: ${photoLimit}. Bir fotoğraf bir sayfa; taranmış PDF de buradan düşer. Metin katmanı olan PDF ve düz metin girmiyor.`
        : "Bu ay fotoğraf ve taranmış PDF sayfası. Metin katmanı olan PDF ve düz metin bu sayıya girmiyor.",
  });

  if (tier === "free") {
    limits.push({
      key: "daily-photos",
      label: "Günlük fotoğraf sorusu",
      used: Math.min(dailyPhotos as number, FREE_IMAGE_DAILY_LIMIT),
      limit: FREE_IMAGE_DAILY_LIMIT,
      // 19 Ekim 2026: çözüm 10 kredi, ücretsiz günlük hak 6 — sayaç ancak davet hediyesiyle dolar.
      hint: "Fotoğraftan çözüm ücretsiz günlük haktan büyük bir iş; davet hediyesi ya da Plus ile açılır. Hakkın varken günde en çok bu kadar.",
    });
  }
  /*
    19 Ekim 2026: "Zor soruda güçlü model" satırı kalktı. `selectModel` hiçbir zaman yükseltme
    vermiyor (her plan aynı model); sayaç hep 0/60 duruyor ve olmayan bir hakkı vaat ediyordu.
  */

  return limits;
}
