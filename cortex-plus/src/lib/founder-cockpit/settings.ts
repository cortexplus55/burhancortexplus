import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";

/**
 * Kurucu Kokpiti ayarları (Faz 13, 26 Kasım 2026): `founder_cockpit_settings` tekil satırı (`id = 'default'`).
 * Göç yokken ya da okuma düşerken varsayılanlarla çalışılır ve `stored: false` döner (ekran "göç bekliyor" der).
 *
 * Ürün sahibinin kararları: şirket türü varsayılanı şahıs (satıcı bilgisi: şahıs işletmesi); dolar kuru tek kaynak
 * (Ana Kokpit ve Birim Ekonomisi de bu satırı okur, `loadUsdTryRate`); alarm adresi operasyon e-postası.
 */

export type CompanyType = "sahis" | "limited";

export type CockpitSettings = {
  companyType: CompanyType;
  corporateTaxRate: number;
  incomeTaxRate: number;
  youngEntrepreneurExempt: boolean;
  vatRate: number;
  paytrCommissionRate: number;
  usdTryRate: number;
  alertEmail: string;
  dailyAiBudgetUsd: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerTriggeredAt: string | null;
  updatedAt: string | null;
};

export const DEFAULT_COCKPIT_SETTINGS: CockpitSettings = {
  companyType: "sahis",
  corporateTaxRate: 0.25,
  incomeTaxRate: 0.2,
  youngEntrepreneurExempt: false,
  vatRate: 0.2,
  paytrCommissionRate: 0.0295,
  usdTryRate: 50.42,
  alertEmail: "cortexplus@cortexplus.app",
  dailyAiBudgetUsd: 50,
  circuitBreakerEnabled: false,
  circuitBreakerTriggeredAt: null,
  updatedAt: null,
};

export const SETTINGS_TABLE = "founder_cockpit_settings";
export const SETTINGS_ID = "default";
export const SETTINGS_COLUMNS =
  "company_type, corporate_tax_rate, income_tax_rate, young_entrepreneur_exempt, vat_rate, paytr_commission_rate, usd_try_rate, alert_email, daily_ai_budget_usd, circuit_breaker_enabled, circuit_breaker_triggered_at, updated_at";

/** Kayıt sınırları (göçteki CHECK kısıtlarıyla aynı). */
export const SETTING_LIMITS = {
  rate: { min: 0, max: 1 },
  usdTry: { min: 1, max: 1000 },
  budget: { min: 1, max: 100_000 },
} as const;

type Row = Record<string, unknown>;

function num(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/** Veritabanı satırı → ayarlar (bozuk alan varsayılana düşer). Saf. */
export function settingsFromRow(row: Row | null | undefined): CockpitSettings {
  if (!row) return { ...DEFAULT_COCKPIT_SETTINGS };
  const d = DEFAULT_COCKPIT_SETTINGS;
  const email =
    typeof row.alert_email === "string" && row.alert_email.includes("@")
      ? row.alert_email.trim()
      : d.alertEmail;
  return {
    companyType:
      row.company_type === "limited"
        ? "limited"
        : row.company_type === "sahis"
          ? "sahis"
          : d.companyType,
    corporateTaxRate: num(row.corporate_tax_rate, d.corporateTaxRate, 0, 1),
    incomeTaxRate: num(row.income_tax_rate, d.incomeTaxRate, 0, 1),
    youngEntrepreneurExempt: row.young_entrepreneur_exempt === true,
    vatRate: num(row.vat_rate, d.vatRate, 0, 1),
    paytrCommissionRate: num(
      row.paytr_commission_rate,
      d.paytrCommissionRate,
      0,
      1,
    ),
    usdTryRate: num(
      row.usd_try_rate,
      d.usdTryRate,
      SETTING_LIMITS.usdTry.min,
      SETTING_LIMITS.usdTry.max,
    ),
    alertEmail: email,
    dailyAiBudgetUsd: num(
      row.daily_ai_budget_usd,
      d.dailyAiBudgetUsd,
      SETTING_LIMITS.budget.min,
      SETTING_LIMITS.budget.max,
    ),
    circuitBreakerEnabled: row.circuit_breaker_enabled === true,
    circuitBreakerTriggeredAt:
      typeof row.circuit_breaker_triggered_at === "string"
        ? row.circuit_breaker_triggered_at
        : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export type LoadedSettings = {
  settings: CockpitSettings;
  stored: boolean;
  missingTable: boolean;
};

export async function loadCockpitSettings(
  service: SupabaseClient,
): Promise<LoadedSettings> {
  try {
    const { data, error } = await service
      .from(SETTINGS_TABLE)
      .select(SETTINGS_COLUMNS)
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (error)
      return {
        settings: { ...DEFAULT_COCKPIT_SETTINGS },
        stored: false,
        missingTable: missingRelation(error),
      };
    return {
      settings: settingsFromRow(data as Row | null),
      stored: Boolean(data),
      missingTable: false,
    };
  } catch {
    return {
      settings: { ...DEFAULT_COCKPIT_SETTINGS },
      stored: false,
      missingTable: false,
    };
  }
}

export type SettingsPatch = Partial<{
  company_type: CompanyType;
  corporate_tax_rate: number;
  income_tax_rate: number;
  young_entrepreneur_exempt: boolean;
  vat_rate: number;
  paytr_commission_rate: number;
  usd_try_rate: number;
  alert_email: string;
  daily_ai_budget_usd: number;
  circuit_breaker_enabled: boolean;
  circuit_breaker_triggered_at: string | null;
}>;

export type SaveOutcome =
  { ok: true } | { ok: false; reason: "missing_table" | "failed" };

/** Tekil satıra yazar (yoksa açar). */
export async function saveCockpitSettings(
  service: SupabaseClient,
  patch: SettingsPatch,
): Promise<SaveOutcome> {
  const { error } = await service
    .from(SETTINGS_TABLE)
    .upsert(
      { id: SETTINGS_ID, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (!error) return { ok: true };
  return {
    ok: false,
    reason: missingRelation(error) ? "missing_table" : "failed",
  };
}

/**
 * Dolar kuru, tek kaynak (ürün sahibinin kararı, 26 Kasım 2026). Ayar satırı yoksa null: çağıran eski kaynağa
 * (`admin_usd_try` bayrağı) ve varsayılana düşer.
 */
export async function loadUsdTryRate(
  service: SupabaseClient,
): Promise<number | null> {
  try {
    const { data, error } = await service
      .from(SETTINGS_TABLE)
      .select("usd_try_rate")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (error || !data) return null;
    const value = Number((data as Row).usd_try_rate);
    return Number.isFinite(value) &&
      value >= SETTING_LIMITS.usdTry.min &&
      value <= SETTING_LIMITS.usdTry.max
      ? value
      : null;
  } catch {
    return null;
  }
}
