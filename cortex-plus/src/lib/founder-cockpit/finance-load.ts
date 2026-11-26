import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAiSpend } from "@/lib/admin/ops-gauges";
import { missingRelation } from "@/lib/learning/missing-column";
import { parseRefundReason } from "@/lib/payments/refund";
import {
  computeMonthFinance,
  monthRangeUtc,
  type MonthFinance,
} from "@/lib/founder-cockpit/finance";
import type { CockpitSettings } from "@/lib/founder-cockpit/settings";
import { VENDORS, type CloudExpense, type Vendor } from "@/lib/founder-cockpit/vendors";

/**
 * Kurucu Kokpiti: seçili ayın kaynakları (Faz 13). Her kaynak ayrı okunur; düşen kaynak `failed` listesine adıyla girer,
 * sayfa düşmez. Kişisel veri okunmaz (e-posta, ad yok): yalnız tutar, durum, tarih, sipariş numarası ve plan adı.
 */

export { VENDORS, type CloudExpense, type Vendor };

export type SaleRow = {
  createdAt: string;
  orderId: string;
  status: "paid" | "refunded";
  planName: string;
  amountKurus: number;
};

export type MonthBundle = {
  month: string;
  finance: MonthFinance;
  expenses: CloudExpense[];
  sales: SaleRow[];
  refunds: { createdAt: string; amountKurus: number }[];
  /** Bu ay için girilmiş OpenAI faturası yoksa canlı kullanımdan tahmin (dolar). */
  liveOpenAiUsd: number | null;
  hasOpenAiInvoice: boolean;
  expensesTableMissing: boolean;
  failed: string[];
};

const ROW_LIMIT = 5000;
const REFUND_UNSETTLED = new Set(["failed", "pending", "applying"]);
type Row = Record<string, unknown>;

async function settle<T>(
  label: string,
  failed: string[],
  run: () => PromiseLike<{
    data: T | null;
    error: { message?: string; code?: string } | null;
  }>,
  fallback: T,
  onMissing?: () => void,
): Promise<T> {
  try {
    const { data, error } = await run();
    if (!error) return data ?? fallback;
    if (missingRelation(error)) onMissing?.();
    else {
      console.warn("founder_cockpit_source_failed", {
        label,
        cause: String(error.message ?? "").slice(0, 160),
      });
      failed.push(label);
    }
    return fallback;
  } catch {
    failed.push(label);
    return fallback;
  }
}

export function expenseFromRow(row: Row): CloudExpense {
  const vendor = String(row.vendor ?? "Diğer");
  return {
    id: String(row.id ?? ""),
    periodMonth: String(row.period_month ?? ""),
    vendor: ((VENDORS as readonly string[]).includes(vendor)
      ? vendor
      : "Diğer") as Vendor,
    amountUsd: Number(row.amount_usd ?? 0) || 0,
    amountTry: Number(row.amount_try ?? 0) || 0,
    invoiceNumber:
      typeof row.invoice_number === "string" && row.invoice_number
        ? row.invoice_number
        : null,
    kdv2: row.is_kdv2_applicable !== false,
    sentToAccountant: row.sent_to_accountant === true,
    notes: typeof row.notes === "string" && row.notes ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function loadMonthBundle(
  service: SupabaseClient,
  month: string,
  settings: CockpitSettings,
  now: Date = new Date(),
): Promise<MonthBundle> {
  const failed: string[] = [];
  const { startIso, endIso } = monthRangeUtc(month);
  let expensesTableMissing = false;

  const [payments, refunds, plans, expenseRows] = await Promise.all([
    settle<Row[]>(
      "ödemeler",
      failed,
      () =>
        service
          .from("payments")
          .select("id, merchant_oid, plan_id, amount_try, status, created_at")
          .in("status", ["paid", "refunded"])
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .order("created_at")
          .limit(ROW_LIMIT),
      [],
    ),
    settle<Row[]>(
      "iadeler",
      failed,
      () =>
        service
          .from("refunds")
          .select("payment_id, amount_try, reason, created_at")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .limit(ROW_LIMIT),
      [],
    ),
    settle<Row[]>(
      "paketler",
      failed,
      () => service.from("plans").select("id, name").limit(200),
      [],
    ),
    settle<Row[]>(
      "yurt dışı faturalar",
      failed,
      () =>
        service
          .from("founder_cloud_expenses")
          .select("*")
          .eq("period_month", month)
          .order("created_at")
          .limit(500),
      [],
      () => {
        expensesTableMissing = true;
      },
    ),
  ]);

  const planName = new Map(
    plans.map((row) => [String(row.id ?? ""), String(row.name ?? "Paket")]),
  );
  const sales: SaleRow[] = payments.map((row) => ({
    createdAt: String(row.created_at ?? ""),
    orderId: String(row.merchant_oid ?? ""),
    status: row.status === "refunded" ? "refunded" : "paid",
    planName: planName.get(String(row.plan_id ?? "")) ?? "Paket",
    amountKurus: Math.max(0, Math.round(Number(row.amount_try ?? 0))),
  }));

  // İade: yapılmış iade satırları; satırı olmayan "iade edildi" ödemeler (Birim Ekonomisi ile aynı kural).
  const settledRefunds = refunds.filter((row) => {
    const state = parseRefundReason(
      typeof row.reason === "string" ? row.reason : null,
    )?.state;
    return !state || !REFUND_UNSETTLED.has(state);
  });
  const withRow = new Set(
    settledRefunds.map((row) => String(row.payment_id ?? "")),
  );
  const refundList = [
    ...settledRefunds.map((row) => ({
      createdAt: String(row.created_at ?? ""),
      amountKurus: Math.max(0, Math.round(Number(row.amount_try ?? 0))),
    })),
    ...payments
      .filter(
        (row) =>
          row.status === "refunded" && !withRow.has(String(row.id ?? "")),
      )
      .map((row) => ({
        createdAt: String(row.created_at ?? ""),
        amountKurus: Math.max(0, Math.round(Number(row.amount_try ?? 0))),
      })),
  ];

  const expenses = expenseRows.map(expenseFromRow);
  const hasOpenAiInvoice = expenses.some((item) => item.vendor === "OpenAI");
  let liveOpenAiUsd: number | null = null;
  const isCurrentMonth =
    Date.parse(startIso) <= now.getTime() && Date.parse(endIso) > now.getTime();
  if (!hasOpenAiInvoice && isCurrentMonth) {
    // Ayın canlı OpenAI kullanımı (fatura gelene kadar planlama için; hesaba katılmaz, ekranda ayrı satır).
    const spend = await readAiSpend(service, startIso).catch(() => null);
    if (spend) liveOpenAiUsd = Math.round(spend.usd * 100) / 100;
  }

  const finance = computeMonthFinance({
    grossKurus: sales.reduce((sum, row) => sum + row.amountKurus, 0),
    refundKurus: refundList.reduce((sum, row) => sum + row.amountKurus, 0),
    paymentCount: sales.length,
    expenses: expenses.map((item) => ({
      amountUsd: item.amountUsd,
      amountTry: item.amountTry,
      kdv2: item.kdv2,
    })),
    settings,
  });

  return {
    month,
    finance,
    expenses,
    sales,
    refunds: refundList,
    liveOpenAiUsd,
    hasOpenAiInvoice,
    expensesTableMissing,
    failed,
  };
}
