import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import {
  founderApiGuard,
  jsonError,
  NO_STORE,
} from "@/lib/founder-cockpit/api-guard";
import { resetHeavyAiProtectionCache } from "@/lib/founder-cockpit/breaker";
import {
  saveCockpitSettings,
  SETTING_LIMITS,
  type SettingsPatch,
} from "@/lib/founder-cockpit/settings";

/**
 * Kurucu Kokpiti ayarları (Faz 13): şirket türü, oranlar, kur, günlük OpenAI bütçesi, alarm adresi, koruma modu anahtarı.
 * Yalnız kurucu. Dolar kuru tek kaynak: Ana Kokpit ve Birim Ekonomisi de bu satırı okur.
 */

const rate = z
  .number()
  .finite()
  .min(SETTING_LIMITS.rate.min)
  .max(SETTING_LIMITS.rate.max);
const schema = z
  .object({
    companyType: z.enum(["sahis", "limited"]),
    corporateTaxRate: rate,
    incomeTaxRate: rate,
    youngEntrepreneurExempt: z.boolean(),
    vatRate: rate,
    paytrCommissionRate: rate,
    usdTryRate: z
      .number()
      .finite()
      .min(SETTING_LIMITS.usdTry.min)
      .max(SETTING_LIMITS.usdTry.max),
    alertEmail: z.string().trim().email().max(254),
    dailyAiBudgetUsd: z
      .number()
      .finite()
      .min(SETTING_LIMITS.budget.min)
      .max(SETTING_LIMITS.budget.max),
    circuitBreakerEnabled: z.boolean(),
  })
  .partial()
  .strict();

export async function PATCH(request: Request) {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data).length)
    return jsonError(
      400,
      "invalid_input",
      "Girilen değerlerden biri geçersiz.",
    );
  const input = parsed.data;

  const patch: SettingsPatch = {};
  if (input.companyType) patch.company_type = input.companyType;
  if (input.corporateTaxRate != null)
    patch.corporate_tax_rate = input.corporateTaxRate;
  if (input.incomeTaxRate != null) patch.income_tax_rate = input.incomeTaxRate;
  if (input.youngEntrepreneurExempt != null)
    patch.young_entrepreneur_exempt = input.youngEntrepreneurExempt;
  if (input.vatRate != null) patch.vat_rate = input.vatRate;
  if (input.paytrCommissionRate != null)
    patch.paytr_commission_rate = input.paytrCommissionRate;
  if (input.usdTryRate != null) patch.usd_try_rate = input.usdTryRate;
  if (input.alertEmail) patch.alert_email = input.alertEmail;
  if (input.dailyAiBudgetUsd != null)
    patch.daily_ai_budget_usd = input.dailyAiBudgetUsd;
  if (input.circuitBreakerEnabled != null)
    patch.circuit_breaker_enabled = input.circuitBreakerEnabled;

  const saved = await saveCockpitSettings(guard.service, patch);
  if (!saved.ok) {
    return saved.reason === "missing_table"
      ? jsonError(
          409,
          "migration_pending",
          "Ayar tablosu henüz yok: veritabanı değişikliği uygulanınca kaydedilir.",
        )
      : jsonError(500, "save_failed", "Ayarlar kaydedilemedi.");
  }
  resetHeavyAiProtectionCache();
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.settings.saved",
    entityType: "founder_cockpit_settings",
    entityId: "default",
    metadata: { fields: Object.keys(patch) },
  });
  revalidatePath("/admin/kokpit");
  revalidatePath("/admin");
  revalidatePath("/admin/maliyetler");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
