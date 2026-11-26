import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import {
  loadCockpitSettings,
  type CockpitSettings,
} from "@/lib/founder-cockpit/settings";

/**
 * Koruma modu (Faz 13, 26 Kasım 2026): kurucu açtıysa (`circuit_breaker_enabled`) ve günlük OpenAI bütçesi aşıldıysa
 * sağlık kontrolü `circuit_breaker_triggered_at`'i yazar; o Türkiye günü boyunca ağır yapay zekâ işleri (canlı sesli
 * öğretmen oturumu açma, video ders üretimi) geçici olarak durur. Ders, test ve sohbet etkilenmez.
 *
 * - Gece yarısı (Türkiye saati) kendiliğinden kalkar: tetik başka günden kalmışsa koruma yok.
 * - Kurucu panelden tek tıkla kaldırır (`circuit_breaker_triggered_at = null`).
 * - Anahtar kapatılırsa koruma hemen kalkar.
 * - Ücretsiz hesapların ayrı tavanı (`spend-breaker.ts`, varsayılan 25 $) bundan bağımsızdır.
 * Okuma 30 sn önbellekli, süreç başına; ayar okunamazsa koruma YOK (öğrenci sebepsiz kapıda kalmasın).
 */

export const HEAVY_AI_BLOCK_CODE = "ai_budget_protection";
export const HEAVY_AI_BLOCK_MESSAGE =
  "Bu özellik şu an geçici olarak kapalı. Ders, test ve sohbet çalışıyor; biraz sonra yeniden dene.";
const CACHE_MS = 30_000;

/** Tetik bugün mü (Türkiye günü) ve anahtar açık mı. Saf. */
export function protectionActiveToday(
  settings: Pick<
    CockpitSettings,
    "circuitBreakerEnabled" | "circuitBreakerTriggeredAt"
  >,
  now: Date,
): boolean {
  if (!settings.circuitBreakerEnabled || !settings.circuitBreakerTriggeredAt)
    return false;
  const at = new Date(settings.circuitBreakerTriggeredAt);
  if (!Number.isFinite(at.getTime())) return false;
  return istanbulDay(at) === istanbulDay(now);
}

let cache: { value: boolean; at: number } | null = null;

export function resetHeavyAiProtectionCache() {
  cache = null;
}

/** Ağır yapay zekâ işi şu an durdurulmuş mu. Hiçbir zaman atmaz. */
export async function heavyAiProtectionActive(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<boolean> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.value;
  let value = false;
  try {
    const { settings, stored } = await loadCockpitSettings(service);
    value = stored && protectionActiveToday(settings, now);
  } catch {
    value = false;
  }
  cache = { value, at: now.getTime() };
  return value;
}
