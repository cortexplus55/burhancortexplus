import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAiSpend, type AiSpend } from "@/lib/admin/ops-gauges";
import { cockpitWindows, effectiveUsdTry, FX_FLAG, WINDOW_KEYS, type UsdTry, type WindowKey, type Windows } from "@/lib/admin/cockpit-math";
import {
  collectionByWindow,
  modelSpendRows,
  profitLoss,
  type Collection,
  type FinancePayment,
  type FinanceRefund,
  type ModelSpendRow,
  type ProfitLoss,
} from "@/lib/admin/finance-math";
import { spendBreakerState, type BreakerState } from "@/lib/billing/spend-breaker";
import { missingRelation } from "@/lib/learning/missing-column";
import { parseRefundReason } from "@/lib/payments/refund";

/*
  Birim ekonomisi sayfası (`/admin/maliyetler`, 6 Kasım 2026): üç pencerede PayTR tahsilatı, iadeler, OpenAI gideri
  (model dökümüyle), net kâr ve marj; harcama sigortasının durumu. Gider kokpit ve günlük özetle aynı hesaptan
  (`readAiSpend`), kur aynı bayraktan (`effectiveUsdTry`), sigorta aynı durumdan (`spendBreakerState`). Bir kaynak
  düşerse o kutu "okunamadı" der, sayfa düşmez.
*/

export type FinanceReport = {
  windows: Windows;
  usdTry: UsdTry;
  collection: Collection;
  spend: Record<WindowKey, AiSpend | null>;
  pnl: Record<WindowKey, ProfitLoss>;
  models: ModelSpendRow[];
  breaker: BreakerState | null;
  failed: string[];
};

const ROW_LIMIT = 5000;
const REFUND_UNSETTLED = new Set(["failed", "pending", "applying"]);

type Row = Record<string, unknown>;

async function settle<T>(
  label: string,
  failed: string[],
  run: () => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await run();
    if (!error) return data ?? fallback;
    if (!missingRelation(error)) {
      console.warn("admin_finance_source_failed", { label, cause: String(error.message ?? "").slice(0, 160) });
      failed.push(label);
    }
    return fallback;
  } catch (error) {
    console.warn("admin_finance_source_failed", { label, cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    failed.push(label);
    return fallback;
  }
}

export async function loadFinanceReport(service: SupabaseClient, now: Date = new Date()): Promise<FinanceReport> {
  const windows = cockpitWindows(now);
  const failed: string[] = [];

  const [payments, refunds, fx, spendToday, spendWeek, spendMonth] = await Promise.all([
    settle<Row[]>(
      "ödemeler",
      failed,
      () => service.from("payments").select("id, amount_try, status, created_at").gte("created_at", windows.month).limit(ROW_LIMIT),
      [],
    ),
    settle<Row[]>(
      "iadeler",
      failed,
      () => service.from("refunds").select("payment_id, amount_try, reason, created_at").gte("created_at", windows.month).limit(ROW_LIMIT),
      [],
    ),
    settle<Row | null>("kur", failed, () => service.from("feature_flags").select("metadata").eq("key", FX_FLAG).maybeSingle(), null),
    readAiSpend(service, windows.today).catch(() => null),
    readAiSpend(service, windows.week).catch(() => null),
    readAiSpend(service, windows.month).catch(() => null),
  ]);
  if (!spendMonth) failed.push("OpenAI gideri");

  const paymentRows = payments.map(
    (row): FinancePayment => ({
      id: String(row.id ?? ""),
      amount_try: Number(row.amount_try ?? 0),
      status: String(row.status ?? ""),
      created_at: String(row.created_at ?? ""),
    }),
  );
  const refundRows = refunds.map((row): FinanceRefund => {
    const state = parseRefundReason(typeof row.reason === "string" ? row.reason : null)?.state;
    return {
      payment_id: String(row.payment_id ?? ""),
      amount_try: Number(row.amount_try ?? 0),
      created_at: String(row.created_at ?? ""),
      settled: !state || !REFUND_UNSETTLED.has(state),
    };
  });

  const collection = collectionByWindow(paymentRows, refundRows, windows);
  const usdTry = effectiveUsdTry(fx?.metadata);
  const spend: Record<WindowKey, AiSpend | null> = { today: spendToday, week: spendWeek, month: spendMonth };
  const pnl = Object.fromEntries(
    WINDOW_KEYS.map((key) => [key, profitLoss({ netKurus: collection.netKurus[key], spendUsd: spend[key]?.usd ?? null, usdTry: usdTry.rate })]),
  ) as Record<WindowKey, ProfitLoss>;

  const breaker = await spendBreakerState(service, now, { fresh: true }).catch((error: unknown) => {
    console.warn("admin_finance_source_failed", { label: "sigorta", cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    failed.push("harcama sigortası");
    return null;
  });

  return { windows, usdTry, collection, spend, pnl, models: modelSpendRows(spend), breaker, failed };
}
