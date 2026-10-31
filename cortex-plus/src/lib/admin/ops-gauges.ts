import type { SupabaseClient } from "@supabase/supabase-js";
import { priceForModel, type ModelPrice } from "@/lib/billing/model-price";

/*
  İki işletme göstergesi (31 Ekim 2026, lansman zırhı; göç 20261031161000).

  Veritabanı boyutu: Supabase ücretsiz planı 500 MB; aşılınca veritabanı salt okunur olur (kayıt, ders, ödeme kaydı
  yazılamaz). 31 Ekim'de 15 kullanıcıyla 154 MB'tı ve hiçbir ekran göstermiyordu. Sınır Pro'ya geçince
  `SUPABASE_DB_LIMIT_MB` ile değişir (Pro'da 8 GB dahil). %70'te uyarı, %85'te kritik.

  OpenAI gideri: pencerede model başına jeton toplamı × `ai_model_prices`. Günlük özet okur; `ADMIN_AI_DAILY_ALERT_USD`
  (varsayılan 20 $) aşılırsa özet "Dikkat" ile başlar. Fiyat satırı olmayan model `unpricedCalls`'a yazılır, gider
  sıfır sayılmaz diye ayrıca söylenir.

  Göç uygulanmadan önce iki okuyucu da null döner; ekranlar "ölçülemedi" der, hiçbir şey düşmez.
*/

export const DEFAULT_DB_LIMIT_MB = 500;
export const DB_WARN_SHARE = 0.7;
export const DB_CRITICAL_SHARE = 0.85;
export const DEFAULT_AI_DAILY_ALERT_USD = 20;

export type GaugeLevel = "ok" | "warn" | "critical";

export type DatabaseSize = {
  totalBytes: number;
  limitBytes: number;
  share: number;
  level: GaugeLevel;
  tables: { name: string; bytes: number }[];
};

export type AiSpend = { usd: number; calls: number; unpricedCalls: number; byModel: { model: string; usd: number; calls: number }[] };

export function databaseLimitBytes(env: Record<string, string | undefined> = process.env): number {
  const mb = Number(env.SUPABASE_DB_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_DB_LIMIT_MB) * 1024 * 1024;
}

export function databaseLevel(share: number): GaugeLevel {
  if (share >= DB_CRITICAL_SHARE) return "critical";
  if (share >= DB_WARN_SHARE) return "warn";
  return "ok";
}

export function aiDailyAlertUsd(env: Record<string, string | undefined> = process.env): number {
  const usd = Number(env.ADMIN_AI_DAILY_ALERT_USD);
  return Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_AI_DAILY_ALERT_USD;
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024)).toLocaleString("tr-TR")} MB`;
}

export async function readDatabaseSize(
  service: SupabaseClient,
  env: Record<string, string | undefined> = process.env,
): Promise<DatabaseSize | null> {
  const { data, error } = await service.rpc("database_size_report");
  if (error || !data || typeof data !== "object") return null;
  const report = data as { total_bytes?: unknown; tables?: unknown };
  const totalBytes = Number(report.total_bytes);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  const limitBytes = databaseLimitBytes(env);
  const share = totalBytes / limitBytes;
  const tables = Array.isArray(report.tables)
    ? report.tables
        .map((row) => ({ name: String((row as { name?: unknown }).name ?? ""), bytes: Number((row as { bytes?: unknown }).bytes) }))
        .filter((row) => row.name && Number.isFinite(row.bytes))
    : [];
  return { totalBytes, limitBytes, share, level: databaseLevel(share), tables };
}

export function aiSpendFrom(
  totals: { model: string; calls: number; tokens_in: number; tokens_out: number }[],
  prices: ReadonlyMap<string, ModelPrice>,
): AiSpend {
  let usd = 0;
  let calls = 0;
  let unpricedCalls = 0;
  const byModel: AiSpend["byModel"] = [];
  for (const row of totals) {
    const count = Number(row.calls) || 0;
    calls += count;
    const price = priceForModel(row.model, prices);
    if (!price) {
      unpricedCalls += count;
      continue;
    }
    const cost = (Number(row.tokens_in) / 1000) * price.input + (Number(row.tokens_out) / 1000) * price.output;
    usd += cost;
    byModel.push({ model: row.model, usd: cost, calls: count });
  }
  byModel.sort((a, b) => b.usd - a.usd);
  return { usd, calls, unpricedCalls, byModel };
}

export async function readAiSpend(service: SupabaseClient, sinceIso: string): Promise<AiSpend | null> {
  const [totals, prices] = await Promise.all([
    service.rpc("ai_usage_totals", { p_since: sinceIso }),
    service.from("ai_model_prices").select("model, input_per_1k, output_per_1k"),
  ]);
  if (totals.error || !Array.isArray(totals.data)) return null;
  const priceMap = new Map<string, ModelPrice>(
    ((prices.data ?? []) as { model: string; input_per_1k: unknown; output_per_1k: unknown }[]).map((row) => [
      row.model,
      { input: Number(row.input_per_1k), output: Number(row.output_per_1k) },
    ]),
  );
  return aiSpendFrom(totals.data as { model: string; calls: number; tokens_in: number; tokens_out: number }[], priceMap);
}
