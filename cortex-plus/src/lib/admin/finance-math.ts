/*
  Gelir ve maliyet sayfasının saf hesapları (6 Kasım 2026): PayTR tahsilatı, iade, OpenAI gideri, net kâr ve marj.
  Pencereler (Bugün / Son 7 gün / Son 30 gün, Türkiye günü), kur ve marj formülü kokpitle aynı kaynaktan
  (`cockpit-math.ts`); burada yalnız kokpitte olmayan kısım var: iadenin ayrı sayılması, net kâr ve model dökümü.
  Veritabanı yok; `finance.ts` yükler.
*/

import type { AiSpend } from "@/lib/admin/ops-gauges";
import {
  emptyCounts,
  marginPct,
  spendKurus,
  sumByWindow,
  WINDOW_KEYS,
  type WindowCounts,
  type WindowKey,
  type Windows,
} from "@/lib/admin/cockpit-math";

export type FinancePayment = { id: string; amount_try: number | null; status: string; created_at: string };
/** `settled`: iade gerçekten yapıldı (bekleyen, uygulanan ya da düşen iade sayılmaz). */
export type FinanceRefund = { payment_id: string; amount_try: number | null; created_at: string; settled: boolean };

export type Collection = {
  /** Tahsil edilen (kuruş): ödendi + sonradan iade edilen ödemeler; para bir kez kasaya girdi. */
  grossKurus: WindowCounts;
  /** İade edilen (kuruş), iadenin yapıldığı güne göre. */
  refundKurus: WindowCounts;
  /** Tahsilat − iade (kuruş). */
  netKurus: WindowCounts;
  /** Tahsil edilen ödeme adedi. */
  paidCount: WindowCounts;
  /** İade adedi. */
  refundCount: WindowCounts;
};

const COLLECTED = new Set(["paid", "refunded"]);

/**
 * PayTR tahsilatı ve iadeler. Tahsilat ödemenin tarihine, iade iadenin tarihine yazılır. Durumu "iade edildi"
 * olan ama iade kaydı olmayan eski ödemede (kayıtlar sonradan geldi) iade ödemenin tutarı ve tarihiyle sayılır.
 */
export function collectionByWindow(payments: readonly FinancePayment[], refunds: readonly FinanceRefund[], windows: Windows): Collection {
  const collected = payments.filter((row) => COLLECTED.has(row.status));
  const grossKurus = sumByWindow(collected.map((row) => ({ at: row.created_at, value: row.amount_try ?? 0 })), windows);
  const paidCount = sumByWindow(collected.map((row) => ({ at: row.created_at, value: 1 })), windows);

  const settled = refunds.filter((row) => row.settled);
  const withRefundRow = new Set(settled.map((row) => row.payment_id));
  const refundEntries = [
    ...settled.map((row) => ({ at: row.created_at, value: row.amount_try ?? 0 })),
    ...payments
      .filter((row) => row.status === "refunded" && !withRefundRow.has(row.id))
      .map((row) => ({ at: row.created_at, value: row.amount_try ?? 0 })),
  ];
  const refundKurus = sumByWindow(refundEntries, windows);
  const refundCount = sumByWindow(refundEntries.map((row) => ({ at: row.at, value: 1 })), windows);

  const netKurus = emptyCounts();
  for (const key of WINDOW_KEYS) netKurus[key] = grossKurus[key] - refundKurus[key];
  return { grossKurus, refundKurus, netKurus, paidCount, refundCount };
}

export type ProfitLoss = {
  /** OpenAI giderinin TL karşılığı (kuruş); gider okunamadıysa null. */
  spendKurus: number | null;
  /** Net gelir − gider (kuruş); gider okunamadıysa null. */
  profitKurus: number | null;
  /** Net kâr marjı (%); gelir yoksa ya da gider okunamadıysa null. */
  marginPct: number | null;
};

/** Net kâr ve marj: kokpitin formülüyle (`marginPct`, `spendKurus`), net gelir üzerinden. */
export function profitLoss(input: { netKurus: number; spendUsd: number | null; usdTry: number }): ProfitLoss {
  const cost = spendKurus(input.spendUsd, input.usdTry);
  return {
    spendKurus: cost,
    profitKurus: cost == null ? null : input.netKurus - cost,
    marginPct: marginPct(input.netKurus, input.spendUsd, input.usdTry),
  };
}

/** Model adını ekranda okunur yazar: "-fast" ekli kullanım hızlı işlemdir. */
export function modelLabel(model: string): string {
  return model.endsWith("-fast") ? `${model.slice(0, -"-fast".length)} (hızlı işlem)` : model;
}

export type ModelSpendRow = {
  model: string;
  label: string;
  usd: Record<WindowKey, number>;
  calls: Record<WindowKey, number>;
};

/** Üç pencerenin model dökümü tek tabloda; son 30 günün en pahalısı üstte. Fiyatı tanımsız model buraya girmez. */
export function modelSpendRows(spends: Record<WindowKey, AiSpend | null>): ModelSpendRow[] {
  const rows = new Map<string, ModelSpendRow>();
  for (const key of WINDOW_KEYS) {
    for (const entry of spends[key]?.byModel ?? []) {
      const row = rows.get(entry.model) ?? {
        model: entry.model,
        label: modelLabel(entry.model),
        usd: { today: 0, week: 0, month: 0 },
        calls: { today: 0, week: 0, month: 0 },
      };
      row.usd[key] += entry.usd;
      row.calls[key] += entry.calls;
      rows.set(entry.model, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.usd.month - a.usd.month || a.model.localeCompare(b.model));
}

/** Dolar tutarı: "$12,34" (kuruşsuz dolar ekranda yanıltır; küçük tutarda dört basamak). */
export function formatUsd(value: number): string {
  const digits = value > 0 && value < 1 ? 4 : 2;
  return `$${value.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Marj: "%42"; hesaplanamıyorsa "—". */
export function formatMargin(value: number | null): string {
  return value == null ? "—" : `%${value}`;
}
