import { auditLog } from "@/lib/audit";
import { istanbulDay } from "@/lib/istanbul-day";
import { founderApiGuard, jsonError } from "@/lib/founder-cockpit/api-guard";
import {
  accountantCsvFilename,
  buildAccountantCsv,
} from "@/lib/founder-cockpit/export-csv";
import { isMonthKey } from "@/lib/founder-cockpit/finance";
import { loadMonthBundle } from "@/lib/founder-cockpit/finance-load";
import { loadCockpitSettings } from "@/lib/founder-cockpit/settings";

/**
 * Mali müşavir CSV paketi (Faz 13): `?month=YYYY-MM`. UTF-8 BOM'lu, noktalı virgül ayırıcılı (Excel Türkçe). Yalnız
 * kurucu; kişisel veri içermez.
 */
export async function GET(request: Request) {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const month =
    new URL(request.url).searchParams.get("month") ?? istanbulDay().slice(0, 7);
  if (!isMonthKey(month))
    return jsonError(400, "invalid_month", "Ay YYYY-AA biçiminde olmalı.");
  const { settings } = await loadCockpitSettings(guard.service);
  const bundle = await loadMonthBundle(guard.service, month, settings);
  if (bundle.failed.length)
    return jsonError(
      503,
      "source_failed",
      `Okunamadı: ${bundle.failed.join(", ")}. Yeniden dene.`,
    );
  const csv = buildAccountantCsv({
    month,
    finance: bundle.finance,
    sales: bundle.sales,
    expenses: bundle.expenses,
    settings,
    generatedAt: new Date(),
  });
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.export",
    entityType: "founder_cockpit",
    metadata: { month },
  });
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${accountantCsvFilename(month)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
