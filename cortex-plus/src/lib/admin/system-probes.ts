import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient, isQuotaExhaustedError } from "@/lib/ai/openai-client";
import { rateLimitBackend, redisBreakerOpen, redisPipeline } from "@/lib/rate-limit";
import { parseStorageReport, type OpenAiReach, type RedisProbe, type StorageSize } from "@/lib/admin/system-health";

/*
  Altyapı yoklamaları (6 Kasım 2026, /admin/sistem). Üçü de ÜCRETSİZ ve kısa:
  - Dosya deposu: `storage_size_report()` (göç 20261106170000; yalnız service_role). Göç yoksa null → "ölçülemedi".
  - Redis: tek PING (400 ms zaman aşımı, kesici açıkken hiç gitmez).
  - OpenAI: model listesi (üretim YOK, jeton harcanmaz), 5 sn, yeniden deneme yok.
  Hiçbiri fırlatmaz; sayfa açılışını en çok ~5 sn bekletir (OpenAI), ötekiler paralel.
*/

export async function readStorageSize(service: SupabaseClient): Promise<StorageSize | null> {
  try {
    const { data, error } = await service.rpc("storage_size_report");
    if (error) return null;
    return parseStorageReport(data);
  } catch {
    return null;
  }
}

export async function probeRedis(): Promise<RedisProbe> {
  const configured = rateLimitBackend() === "redis";
  if (!configured) return { configured, pong: false, breakerOpen: false };
  const result = await redisPipeline([["PING"]]).catch(() => null);
  return { configured, pong: result?.[0] === "PONG", breakerOpen: redisBreakerOpen() };
}

export const OPENAI_PROBE_TIMEOUT_MS = 5_000;

export async function probeOpenAi(): Promise<OpenAiReach | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const client = openaiClient({ maxRetries: 0, timeout: OPENAI_PROBE_TIMEOUT_MS });
    await client.models.list();
    return "ok";
  } catch (error) {
    if (isQuotaExhaustedError(error)) return "quota";
    const status = (error as { status?: unknown } | null)?.status;
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "limited";
    return "down";
  }
}
