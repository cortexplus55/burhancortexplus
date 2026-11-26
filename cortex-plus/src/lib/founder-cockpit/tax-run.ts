import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTry } from "@/lib/format";
import { addDays, istanbulDay } from "@/lib/istanbul-day";
import {
  taxReminderCandidates,
  type TaxEstimate,
} from "@/lib/founder-cockpit/alerts";
import {
  dispatchFounderAlerts,
  type DispatchSummary,
} from "@/lib/founder-cockpit/alert-dispatch";
import {
  provisionalTaxRate,
  quarterMonths,
} from "@/lib/founder-cockpit/finance";
import {
  loadMonthBundle,
  type MonthBundle,
} from "@/lib/founder-cockpit/finance-load";
import { pruneHealthSnapshots } from "@/lib/founder-cockpit/health-run";
import {
  loadCockpitSettings,
  type CockpitSettings,
} from "@/lib/founder-cockpit/settings";
import {
  taxDeadlinesBetween,
  type TaxDeadline,
} from "@/lib/founder-cockpit/tax-calendar";

/**
 * Günlük vergi hatırlatması (Faz 13): her gün 06:00 UTC (09:00 Türkiye) günlük turun (`subscription-renewal`) sonunda;
 * ayrı cron yok. Elle ya da dış izlemeden `/api/cron/founder-tax-reminders` (CRON_SECRET) ile de çalışır. Önümüzdeki
 * altı günde son günü olan işlerden 5 gün ve 1 gün kalanlar için, tahmini TL tutarıyla alarm adresine e-posta (her son
 * gün ve eşik bir kez). Aynı iş 30 günden eski sağlık kayıtlarını temizler.
 */

export type TaxRunSummary = {
  deadlines: number;
  candidates: number;
  alerts: DispatchSummary;
};

export function estimateFor(
  item: TaxDeadline,
  bundles: Map<string, MonthBundle>,
  settings: CockpitSettings,
): TaxEstimate {
  const bundle = bundles.get(item.period);
  switch (item.kind) {
    case "kdv2":
      return bundle
        ? {
            amountText: formatTry(bundle.finance.kdv2Kurus),
            note: `${bundle.expenses.filter((row) => row.kdv2).length} yurt dışı fatura üzerinden.`,
          }
        : { amountText: null, note: null };
    case "kdv1":
      if (!bundle) return { amountText: null, note: null };
      return {
        amountText: formatTry(bundle.finance.kdv1PayableKurus),
        note:
          bundle.finance.vatCarryForwardKurus > 0
            ? `Sonraki aya devreden KDV: ${formatTry(bundle.finance.vatCarryForwardKurus)}.`
            : null,
      };
    case "invoice_collect": {
      const expenses = bundle?.expenses ?? [];
      const sent = expenses.filter((row) => row.sentToAccountant).length;
      return {
        amountText: null,
        note: `Bu dönem için ${expenses.length} fatura girildi, ${sent} tanesi mali müşavire gönderildi.`,
      };
    }
    case "muhtasar_damga":
      return {
        amountText: null,
        note: "Ücretli çalışanın ya da stopajlı ödemen yoksa beyan gerekmeyebilir; mali müşavirine sor.",
      };
    case "gecici_vergi": {
      const months = quarterMonths(item.period);
      const profit = months.reduce(
        (sum, month) =>
          sum + (bundles.get(month)?.finance.profitBeforeTaxKurus ?? 0),
        0,
      );
      const rate = provisionalTaxRate(settings);
      const amount = profit > 0 ? Math.round(profit * rate) : 0;
      return {
        amountText: formatTry(amount),
        note: `Kabaca: dönem kârı × %${Math.round(rate * 100)}; önceki dönemlerde ödenen geçici vergi mahsup edilir.`,
      };
    }
  }
}

export async function runFounderTaxReminders(
  service: SupabaseClient,
  now: Date = new Date(),
): Promise<TaxRunSummary> {
  const { settings } = await loadCockpitSettings(service);
  const today = istanbulDay(now);
  const deadlines = taxDeadlinesBetween(today, addDays(today, 6));

  const months = new Set<string>();
  for (const item of deadlines) {
    if (item.kind === "gecici_vergi")
      quarterMonths(item.period).forEach((month) => months.add(month));
    else months.add(item.period);
  }
  const bundles = new Map<string, MonthBundle>();
  for (const month of months)
    bundles.set(month, await loadMonthBundle(service, month, settings, now));

  const candidates = taxReminderCandidates(deadlines, today, (item) =>
    estimateFor(item, bundles, settings),
  );
  const alerts = await dispatchFounderAlerts(
    service,
    candidates,
    settings.alertEmail,
    now,
  );
  await pruneHealthSnapshots(service, now);
  return { deadlines: deadlines.length, candidates: candidates.length, alerts };
}
