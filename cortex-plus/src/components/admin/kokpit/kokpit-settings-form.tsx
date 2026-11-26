"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kokpitCall } from "@/components/admin/kokpit/kokpit-controls";
import type {
  CockpitSettings,
  CompanyType,
} from "@/lib/founder-cockpit/settings";

/*
  Kurucu Kokpiti ayarları (Faz 13). Şirket türü tek dokunuşla değişir ve hemen kaydedilir; öbür alanlar "Ayarları kaydet"
  ile. Oranlar yüzde olarak girilir ("20" = %20), sunucuya 0–1 arası gider. Ondalık için virgül de kabul edilir.
*/

const percentText = (rate: number) =>
  String(Math.round(rate * 10000) / 100).replace(".", ",");
const numberText = (value: number) => String(value).replace(".", ",");
const parseNumber = (value: string) =>
  Number(value.replace(/\s/g, "").replace(",", "."));

export function KokpitSettingsForm({
  settings,
  disabled,
}: {
  settings: CockpitSettings;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [companyType, setCompanyType] = useState<CompanyType>(
    settings.companyType,
  );
  const [form, setForm] = useState({
    corporateTaxRate: percentText(settings.corporateTaxRate),
    incomeTaxRate: percentText(settings.incomeTaxRate),
    vatRate: percentText(settings.vatRate),
    paytrCommissionRate: percentText(settings.paytrCommissionRate),
    usdTryRate: numberText(settings.usdTryRate),
    dailyAiBudgetUsd: numberText(settings.dailyAiBudgetUsd),
    alertEmail: settings.alertEmail,
    youngEntrepreneurExempt: settings.youngEntrepreneurExempt,
    circuitBreakerEnabled: settings.circuitBreakerEnabled,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function save(body: Record<string, unknown>, success: string) {
    start(async () => {
      const result = await kokpitCall("/api/admin/kokpit/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        toast.error(result.message ?? "Ayarlar kaydedilemedi.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function switchCompany(next: CompanyType) {
    if (next === companyType || disabled) return;
    setCompanyType(next);
    save(
      { companyType: next },
      next === "limited"
        ? "Şirket türü: Limited."
        : "Şirket türü: Şahıs işletmesi.",
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const rates = {
      corporateTaxRate: parseNumber(form.corporateTaxRate) / 100,
      incomeTaxRate: parseNumber(form.incomeTaxRate) / 100,
      vatRate: parseNumber(form.vatRate) / 100,
      paytrCommissionRate: parseNumber(form.paytrCommissionRate) / 100,
    };
    const usdTryRate = parseNumber(form.usdTryRate);
    const dailyAiBudgetUsd = parseNumber(form.dailyAiBudgetUsd);
    if (
      [...Object.values(rates), usdTryRate, dailyAiBudgetUsd].some(
        (value) => !Number.isFinite(value),
      )
    ) {
      toast.error("Sayı alanlarından biri boş ya da geçersiz.");
      return;
    }
    save(
      {
        ...rates,
        usdTryRate,
        dailyAiBudgetUsd,
        alertEmail: form.alertEmail.trim(),
        youngEntrepreneurExempt: form.youngEntrepreneurExempt,
        circuitBreakerEnabled: form.circuitBreakerEnabled,
      },
      "Ayarlar kaydedildi.",
    );
  }

  const field = (
    label: string,
    key: keyof typeof form,
    suffix: string,
    hint?: string,
  ) => (
    <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
      <span>
        {label} {suffix ? <span aria-hidden>({suffix})</span> : null}
      </span>
      <input
        className="adm-input"
        inputMode="decimal"
        value={String(form[key])}
        onChange={(event) => set(key, event.target.value as never)}
        disabled={disabled || pending}
      />
      {hint ? <span className="adm-tool-hint">{hint}</span> : null}
    </label>
  );

  return (
    <div className="grid gap-4">
      <div
        role="radiogroup"
        aria-label="Şirket türü"
        className="flex flex-wrap gap-2"
      >
        {(["sahis", "limited"] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={companyType === type}
            className={
              companyType === type ? "adm-btn adm-btn--primary" : "adm-btn"
            }
            disabled={disabled || pending}
            onClick={() => switchCompany(type)}
          >
            {type === "sahis" ? "Şahıs işletmesi" : "Limited şirket"}
          </button>
        ))}
      </div>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {companyType === "limited"
            ? field("Kurumlar vergisi", "corporateTaxRate", "%")
            : field(
                "Gelir vergisi (tahmin)",
                "incomeTaxRate",
                "%",
                "Gerçek tarife dilimlidir; bu oran tahmindir.",
              )}
          {field("KDV", "vatRate", "%")}
          {field("PayTR komisyonu", "paytrCommissionRate", "%, KDV hariç")}
          {field(
            "Dolar kuru",
            "usdTryRate",
            "1 USD = TL",
            "Ana Kokpit ve Birim Ekonomisi de bu kuru kullanır.",
          )}
          {field(
            "Günlük OpenAI bütçesi",
            "dailyAiBudgetUsd",
            "$",
            "%80'de uyarı, %100'de kritik alarm.",
          )}
          <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)] sm:col-span-2">
            Alarm e-posta adresi
            <input
              className="adm-input"
              type="email"
              value={form.alertEmail}
              onChange={(event) => set("alertEmail", event.target.value)}
              disabled={disabled || pending}
            />
          </label>
        </div>
        <div className="grid gap-2 text-sm">
          {companyType === "sahis" ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="adm-check"
                checked={form.youngEntrepreneurExempt}
                onChange={(event) =>
                  set("youngEntrepreneurExempt", event.target.checked)
                }
                disabled={disabled || pending}
              />
              <span>
                Genç girişimci istisnası uygulanıyor{" "}
                <span className="adm-tool-hint">
                  (tahmini gelir vergisi 0 gösterilir; yıllık sınırı mali
                  müşavirinle doğrula)
                </span>
              </span>
            </label>
          ) : null}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="adm-check"
              checked={form.circuitBreakerEnabled}
              onChange={(event) =>
                set("circuitBreakerEnabled", event.target.checked)
              }
              disabled={disabled || pending}
            />
            <span>
              Koruma modu: günlük bütçe aşılınca canlı sesli öğretmeni ve video
              üretimini o gün için durdur{" "}
              <span className="adm-tool-hint">
                (ders, test ve sohbet çalışmaya devam eder; gece yarısı
                kendiliğinden kalkar)
              </span>
            </span>
          </label>
        </div>
        <div>
          <button
            type="submit"
            className="adm-btn adm-btn--primary"
            disabled={disabled || pending}
          >
            {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
