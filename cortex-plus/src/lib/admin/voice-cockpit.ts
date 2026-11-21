import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelPrice } from "@/lib/billing/model-price";
import { cockpitWindows, type Windows } from "@/lib/admin/cockpit-math";
import {
  voiceCockpit,
  type VoiceCockpit,
  type VoicePayment,
  type VoiceReservation,
  type VoiceTrialMark,
  type VoiceUsage,
} from "@/lib/admin/voice-cockpit-math";

/*
  Kokpitin "Canlı sesli öğretmen" kartının okuması (21 Kasım 2026). Yalnız okur. Her kaynak kendi başına okunur; biri
  düşerse ona dayanan sayı "okunamadı" olur, sayfa düşmez. Sorgular sınırlı:

    credit_reservations   action_code = REALTIME_VOICE_MINUTE, son 30 gün          en çok ROW_LIMIT
    ai_usage_events       action_code = REALTIME_VOICE (gider), son 30 gün        en çok ROW_LIMIT
    ai_usage_events       action_code = REALTIME_VOICE_TRIAL (deneme), son 120 gün  en çok ROW_LIMIT
    ai_model_prices       bütün satırlar (birkaç düzine)
    payments + plans      başarılı ödemeler, son 30 gün                           en çok ROW_LIMIT

  Denemeden sonra Plus'a geçiş için deneme kayıtları 120 gün geriye okunur (30 gün önce deneyip bugün ödeyen sayılsın).
  Sınıra takılan kaynak `truncated`'a yazılır ve ekranda söylenir.
*/

export const VOICE_ROW_LIMIT = 20_000;
const TRIAL_LOOKBACK_DAYS = 120;

export type LoadedVoiceCockpit = VoiceCockpit & { windows: Windows; failed: string[]; truncated: string[] };

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { message?: string } | null };

async function read(label: string, failed: string[], truncated: string[], run: () => PromiseLike<QueryResult>, limit?: number): Promise<Row[] | null> {
  try {
    const { data, error } = await run();
    if (!error) {
      const rows = Array.isArray(data) ? (data as Row[]) : [];
      if (limit && rows.length >= limit) truncated.push(label);
      return rows;
    }
    console.warn("admin_voice_source_failed", { label, cause: String(error.message ?? "").slice(0, 160) });
  } catch (error) {
    console.warn("admin_voice_source_failed", { label, cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
  }
  failed.push(label);
  return null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadVoiceCockpit(service: SupabaseClient, now: Date = new Date()): Promise<LoadedVoiceCockpit> {
  const windows = cockpitWindows(now);
  const failed: string[] = [];
  const truncated: string[] = [];
  const trialSince = new Date(now.getTime() - TRIAL_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [reservationRows, usageRows, trialRows, priceRows, paymentRows, planRows] = await Promise.all([
    read(
      "sesli dakika kayıtları",
      failed,
      truncated,
      () =>
        service
          .from("credit_reservations")
          .select("user_id, idempotency_key, status, created_at")
          .eq("action_code", "REALTIME_VOICE_MINUTE")
          .gte("created_at", windows.month)
          .limit(VOICE_ROW_LIMIT),
      VOICE_ROW_LIMIT,
    ),
    read(
      "sesli ders gider satırları",
      failed,
      truncated,
      () =>
        service
          .from("ai_usage_events")
          .select("model, tokens_in, tokens_out, cost_usd_estimate, created_at")
          .eq("action_code", "REALTIME_VOICE")
          .gte("created_at", windows.month)
          .limit(VOICE_ROW_LIMIT),
      VOICE_ROW_LIMIT,
    ),
    read(
      "deneme kayıtları",
      failed,
      truncated,
      () =>
        service
          .from("ai_usage_events")
          .select("user_id, created_at")
          .eq("action_code", "REALTIME_VOICE_TRIAL")
          .gte("created_at", trialSince)
          .limit(VOICE_ROW_LIMIT),
      VOICE_ROW_LIMIT,
    ),
    read("fiyat satırları", failed, truncated, () => service.from("ai_model_prices").select("model, input_per_1k, output_per_1k")),
    read(
      "ödemeler",
      failed,
      truncated,
      () =>
        service
          .from("payments")
          .select("user_id, beneficiary_user_id, plan_id, status, created_at")
          .eq("status", "paid")
          .gte("created_at", windows.month)
          .limit(VOICE_ROW_LIMIT),
      VOICE_ROW_LIMIT,
    ),
    read("paketler", failed, truncated, () => service.from("plans").select("id, slug")),
  ]);

  const reservations: VoiceReservation[] | null = reservationRows
    ? reservationRows.map((row) => ({ userId: text(row.user_id), key: text(row.idempotency_key), status: text(row.status), at: text(row.created_at) }))
    : null;
  const usage: VoiceUsage[] | null = usageRows
    ? usageRows.map((row) => ({
        model: text(row.model),
        tokensIn: num(row.tokens_in),
        tokensOut: num(row.tokens_out),
        estimate: row.cost_usd_estimate == null ? null : num(row.cost_usd_estimate),
        at: text(row.created_at),
      }))
    : null;
  const trials: VoiceTrialMark[] | null = trialRows ? trialRows.map((row) => ({ userId: text(row.user_id), at: text(row.created_at) })) : null;
  const prices: Map<string, ModelPrice> | null = priceRows
    ? new Map(priceRows.map((row) => [text(row.model), { input: num(row.input_per_1k), output: num(row.output_per_1k) }]))
    : null;
  const slugById = new Map((planRows ?? []).map((row) => [text(row.id), text(row.slug)]));
  const payments: VoicePayment[] | null =
    paymentRows && planRows
      ? paymentRows.map((row) => ({
          userId: text(row.user_id),
          beneficiaryId: text(row.beneficiary_user_id) || null,
          status: text(row.status),
          at: text(row.created_at),
          planSlug: slugById.get(text(row.plan_id)) ?? null,
        }))
      : null;

  return { ...voiceCockpit({ windows, reservations, trials, usage, prices, payments }), windows, failed, truncated };
}
