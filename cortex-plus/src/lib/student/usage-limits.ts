import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyKey, peekCount } from "@/lib/rate-limit";
import {
  FREE_IMAGE_DAILY_LIMIT,
} from "@/lib/ai/image-quota";
import { HARD_UPGRADE_MONTHLY_LIMIT } from "@/lib/ai/model-upgrade";
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
): Promise<UsageLimit[]> {
  const [photo, upgrade, dailyPhotos] = await Promise.all([
    service
      .from("document_page_grants")
      .select("period_start, used")
      .eq("user_id", userId)
      .maybeSingle(),
    tier === "free"
      ? Promise.resolve({ data: null })
      : service
          .from("model_upgrade_grants")
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
    label: "Fotoğraf belgesi",
    used: Math.min(usedThisMonth(photo.data as Grant, now), photoLimit),
    limit: photoLimit,
    hint:
      tier === "free"
        ? "Bu ay okunan fotoğraf sayfası. PDF ve metin belgeleri bu sayıya girmiyor."
        : "Bu ay okunan fotoğraf sayfası. Bir fotoğraf bir sayfa; PDF ve metin belgeleri girmiyor.",
  });

  if (tier === "free") {
    limits.push({
      key: "daily-photos",
      label: "Günlük fotoğraf sorusu",
      used: Math.min(dailyPhotos as number, FREE_IMAGE_DAILY_LIMIT),
      limit: FREE_IMAGE_DAILY_LIMIT,
      hint: "Fotoğraftan soru çözme, ücretsiz hesapta günde bu kadar. Gece yarısı yenilenir.",
    });
  } else {
    /*
      Yükseltme sayacı tavanın bir üstünde doyuyor (`claim_model_upgrade`),
      o yüzden gösterirken kırpılıyor: "61 / 60" öğrenciye bir şey anlatmaz.
    */
    limits.push({
      key: "hard-upgrade",
      label: "Zor soruda güçlü model",
      used: Math.min(
        usedThisMonth((upgrade as { data: Grant }).data, now),
        HARD_UPGRADE_MONTHLY_LIMIT,
      ),
      limit: HARD_UPGRADE_MONTHLY_LIMIT,
      hint: "Zor bulunan soruda güçlü modele çıkıyoruz — kredin artmıyor. Dolunca cevap standart modelden gelir.",
    });
  }

  return limits;
}
