import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminTableFrame,
} from "@/components/admin/admin-ui";
import {
  BreakerResetButton,
  CheckNowButton,
  MonthPicker,
  TestAlertButton,
} from "@/components/admin/kokpit/kokpit-controls";
import { KokpitExpenses } from "@/components/admin/kokpit/kokpit-expenses";
import { KokpitSettingsForm } from "@/components/admin/kokpit/kokpit-settings-form";
import { requireFounderPage } from "@/lib/auth/admin-guard";
import { istanbulDayStartIso } from "@/lib/admin/cockpit-math";
import { formatUsd } from "@/lib/admin/finance-math";
import { readAiSpend } from "@/lib/admin/ops-gauges";
import { formatNumber, formatTry } from "@/lib/format";
import { istanbulDay } from "@/lib/istanbul-day";
import { createServiceClient } from "@/lib/supabase/server";
import { loadRecentAlerts } from "@/lib/founder-cockpit/alert-dispatch";
import { SEVERITY_LABEL } from "@/lib/founder-cockpit/alerts";
import { protectionActiveToday } from "@/lib/founder-cockpit/breaker";
import { istanbulDateTime } from "@/lib/founder-cockpit/export-csv";
import {
  isMonthKey,
  previousMonth,
  quarterMonths,
} from "@/lib/founder-cockpit/finance";
import {
  loadMonthBundle,
  type MonthBundle,
} from "@/lib/founder-cockpit/finance-load";
import {
  BUDGET_WARNING_SHARE,
  OVERALL_LABEL,
  budgetLevel,
  type HealthLevel,
  type ServiceCheck,
} from "@/lib/founder-cockpit/health";
import { loadLatestSnapshot } from "@/lib/founder-cockpit/health-run";
import { loadCockpitSettings } from "@/lib/founder-cockpit/settings";
import {
  daysUntil,
  dueDateLabel,
  periodLabelOf,
  upcomingTaxDeadlines,
} from "@/lib/founder-cockpit/tax-calendar";
import { estimateFor } from "@/lib/founder-cockpit/tax-run";

export const metadata = { title: "Yönetim · Kurucu Kokpiti" };
export const dynamic = "force-dynamic";

/**
 * Kurucu Kokpiti (Faz 13, 26 Kasım 2026). Yalnız kurucu (PIN kapısıyla). Sayfa açılışı dış servis yoklamaz: sağlık
 * kartları son kayıtlı kontrolden (15 dakikada bir zamanlayıcı ya da "Şimdi kontrol et"), bugünkü OpenAI harcaması ve
 * ayın finansı veritabanından canlı. Bütün tutarlar ön muhasebe tahminidir.
 */

const LEVEL_TONE: Record<HealthLevel, "ok" | "warn" | "bad" | "mute"> = {
  ok: "ok",
  warning: "warn",
  critical: "bad",
  unknown: "mute",
};
const LEVEL_LABEL: Record<HealthLevel, string> = {
  ok: "Çalışıyor",
  warning: "Dikkat",
  critical: "Sorunlu",
  unknown: "Bilinmiyor",
};
const SEVERITY_TONE = {
  info: "mute",
  warning: "warn",
  critical: "bad",
} as const;

function monthOptions(
  current: string,
  count = 12,
): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = [];
  let month = current;
  for (let index = 0; index < count; index += 1) {
    list.push({ value: month, label: periodLabelOf(month) });
    month = previousMonth(month);
  }
  return list;
}

function FinanceRow({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <td className={strong ? "font-semibold" : undefined}>
        {label}
        {hint ? <div className="adm-tool-hint">{hint}</div> : null}
      </td>
      <td className={`adm-num text-right${strong ? " font-semibold" : ""}`}>
        {value}
      </td>
    </tr>
  );
}

function ServiceCard({ check }: { check: ServiceCheck }) {
  return (
    <li className="adm-kokpit-service" data-level={check.level}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{check.label}</span>
        <AdminBadge tone={LEVEL_TONE[check.level]}>
          {LEVEL_LABEL[check.level]}
        </AdminBadge>
      </div>
      <p className="adm-kokpit-service-summary">{check.summary}</p>
      {check.detail ? <p className="adm-tool-hint">{check.detail}</p> : null}
    </li>
  );
}

export default async function FounderCockpitPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  await requireFounderPage();
  const service = createServiceClient();
  const now = new Date();
  const today = istanbulDay(now);
  const currentMonth = today.slice(0, 7);
  const params = await searchParams;
  const month =
    isMonthKey(params.ay) && params.ay <= currentMonth
      ? params.ay
      : currentMonth;

  const { settings, missingTable } = await loadCockpitSettings(service);
  const deadlines = upcomingTaxDeadlines(now, 30);

  // Takvimdeki tahminler için gereken aylar (geçici vergide çeyreğin üç ayı) + seçili ay.
  const months = new Set<string>([month]);
  for (const item of deadlines) {
    if (item.kind === "gecici_vergi")
      quarterMonths(item.period).forEach((value) => months.add(value));
    else months.add(item.period);
  }
  const [snapshot, todaySpend, alerts, ...bundleList] = await Promise.all([
    loadLatestSnapshot(service),
    readAiSpend(service, istanbulDayStartIso(now)).catch(() => null),
    loadRecentAlerts(service, 20),
    ...[...months].map((value) =>
      loadMonthBundle(service, value, settings, now),
    ),
  ]);
  const bundles = new Map<string, MonthBundle>(
    bundleList.map((bundle) => [bundle.month, bundle]),
  );
  const bundle = bundles.get(month)!;
  const { finance } = bundle;

  const protectionActive = protectionActiveToday(settings, now);
  const spendUsd = todaySpend ? todaySpend.usd : null;
  const budget = budgetLevel(spendUsd, settings.dailyAiBudgetUsd);
  const overall = snapshot?.overall ?? null;
  const failed = [...new Set(bundleList.flatMap((item) => item.failed))];

  return (
    <AdminShell
      href="/admin/kokpit"
      actions={
        <>
          <CheckNowButton />
          {protectionActive ? <BreakerResetButton /> : null}
        </>
      }
    >
      {missingTable ? (
        <AdminNote tone="warn">
          Kokpit tabloları henüz veritabanında yok. Hesaplar varsayılan
          ayarlarla yapılıyor; ayarlar, faturalar, sağlık kayıtları ve alarm
          geçmişi veritabanı değişikliği uygulanınca kaydedilir.
        </AdminNote>
      ) : null}
      {failed.length ? (
        <AdminNote tone="warn">
          Şu kaynaklar okunamadı, ilgili satırlar eksik olabilir:{" "}
          {failed.join(", ")}.
        </AdminNote>
      ) : null}

      <section
        className="adm-kokpit-band"
        data-status={overall ?? "unknown"}
        aria-live="polite"
      >
        <div className="min-w-0">
          <p className="adm-kokpit-band-title">
            {overall ? OVERALL_LABEL[overall] : "Henüz kontrol yapılmadı"}
          </p>
          <p className="adm-kokpit-band-meta">
            {snapshot
              ? `Son kontrol: ${istanbulDateTime(snapshot.checkedAt)} (Türkiye saati). Zamanlayıcı 15 dakikada bir kontrol eder.`
              : 'İlk kontrolü "Şimdi kontrol et" ile çalıştır; sonra zamanlayıcı 15 dakikada bir kontrol eder.'}
          </p>
        </div>
        {protectionActive ? (
          <AdminBadge tone="bad">
            Koruma modu açık: canlı sesli öğretmen ve video üretimi bugün kapalı
          </AdminBadge>
        ) : null}
      </section>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">
            Brüt ciro · {periodLabelOf(month)}
          </span>
          <span className="adm-stat-value">
            {formatTry(finance.grossKurus)}
          </span>
          <span className="adm-stat-hint">
            {formatNumber(finance.paymentCount)} ödeme, KDV dahil
            {finance.refundKurus
              ? ` · iade −${formatTry(finance.refundKurus)}`
              : ""}
          </span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Vergi kasasına ayır</span>
          <span className="adm-stat-value">
            {formatTry(finance.taxVaultKurus)}
          </span>
          <span className="adm-stat-hint">
            1 No.lu KDV + 2 No.lu KDV +{" "}
            {finance.incomeTaxLabel.toLocaleLowerCase("tr")}
          </span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Gerçek harcanabilir net kâr</span>
          <span
            className={`adm-stat-value${finance.spendableNetKurus < 0 ? " adm-kokpit-negative" : ""}`}
          >
            {finance.spendableNetKurus < 0
              ? `−${formatTry(-finance.spendableNetKurus)}`
              : formatTry(finance.spendableNetKurus)}
          </span>
          <span className="adm-stat-hint">
            Komisyon, yurt dışı faturalar ve vergi kasası düşüldükten sonra
          </span>
        </div>
        <div className="adm-stat" data-level={budget.level}>
          <span className="adm-stat-label">Bugünkü OpenAI harcaması</span>
          <span className="adm-stat-value">
            {spendUsd == null ? "okunamadı" : formatUsd(spendUsd)}
          </span>
          <span className="adm-stat-hint">
            Günlük bütçe {formatUsd(settings.dailyAiBudgetUsd)}
            {budget.share != null
              ? ` · %${Math.round(budget.share * 100)}`
              : ""}{" "}
            · %{Math.round(BUDGET_WARNING_SHARE * 100)}&apos;de uyarı
          </span>
        </div>
      </div>

      <AdminCard
        title="Servis sağlığı"
        desc="Yedi servisin son kontrolü. Kritik ve uyarı durumları alarm adresine e-postayla gider; aynı sorun için en çok saatte bir e-posta."
      >
        {snapshot && snapshot.services.length ? (
          <ul className="adm-kokpit-services">
            {snapshot.services.map((check) => (
              <ServiceCard key={check.id} check={check} />
            ))}
          </ul>
        ) : (
          <AdminEmpty title="Kayıtlı kontrol yok">
            &quot;Şimdi kontrol et&quot; ile ilk kontrolü çalıştır.
          </AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title={`Kasa ve vergi dökümü · ${periodLabelOf(month)}`}
        desc="Satış fiyatları KDV dahil. PayTR komisyonu brüt ciro üzerinden, oranı KDV hariç. Yurt dışı faturaların KDV'si sorumlu sıfatıyla 2 No.lu KDV'de ödenir ve 1 No.lu KDV'de indirilir."
        actions={
          <>
            <MonthPicker month={month} options={monthOptions(currentMonth)} />
            <a
              className="adm-btn adm-kokpit-csv"
              href={`/api/admin/kokpit/export?month=${encodeURIComponent(month)}`}
            >
              Mali müşavir paketi (CSV)
            </a>
          </>
        }
        bodyless
      >
        <AdminTableFrame columns={["Kalem", "Tutar"]}>
          <FinanceRow
            label="Brüt tahsilat (KDV dahil)"
            value={formatTry(finance.grossKurus)}
            hint={`${formatNumber(finance.paymentCount)} ödeme`}
          />
          <FinanceRow
            label="İadeler"
            value={
              finance.refundKurus
                ? `−${formatTry(finance.refundKurus)}`
                : formatTry(0)
            }
          />
          <FinanceRow
            label="Net tahsilat"
            value={formatTry(finance.netCollectedKurus)}
            strong
          />
          <FinanceRow
            label="KDV hariç net satış"
            value={formatTry(finance.netSalesKurus)}
          />
          <FinanceRow
            label="Satışlardaki KDV (hesaplanan)"
            value={formatTry(finance.outputVatKurus)}
          />
          <FinanceRow
            label="PayTR komisyonu"
            value={formatTry(finance.commissionKurus)}
            hint={`Komisyon faturasının KDV'si: ${formatTry(finance.commissionVatKurus)} (indirilir)`}
          />
          <FinanceRow
            label="Yurt dışı API ve bulut giderleri"
            value={formatTry(finance.foreignKurus)}
            hint={`${formatUsd(finance.foreignUsd)} · ${bundle.expenses.length} fatura · kur 1 USD = ${settings.usdTryRate.toLocaleString("tr-TR")} TL`}
          />
          {bundle.liveOpenAiUsd != null ? (
            <FinanceRow
              label="Bu ayın canlı OpenAI kullanımı"
              value={formatUsd(bundle.liveOpenAiUsd)}
              hint="OpenAI faturası girilene kadar planlama için; hesaba katılmaz."
            />
          ) : null}
          <FinanceRow
            label="2 No.lu KDV (sorumlu sıfatıyla)"
            value={formatTry(finance.kdv2Kurus)}
          />
          <FinanceRow
            label="İndirilecek KDV"
            value={formatTry(finance.deductibleVatKurus)}
            hint="2 No.lu KDV + komisyon KDV'si"
          />
          <FinanceRow
            label="1 No.lu KDV (ödenecek)"
            value={formatTry(finance.kdv1PayableKurus)}
            hint={
              finance.vatCarryForwardKurus
                ? `Sonraki aya devreden KDV: ${formatTry(finance.vatCarryForwardKurus)}`
                : undefined
            }
          />
          <FinanceRow
            label="Vergi öncesi kâr"
            value={
              finance.profitBeforeTaxKurus < 0
                ? `−${formatTry(-finance.profitBeforeTaxKurus)}`
                : formatTry(finance.profitBeforeTaxKurus)
            }
          />
          <FinanceRow
            label={finance.incomeTaxLabel}
            value={formatTry(finance.incomeTaxKurus)}
            hint={`Oran %${Math.round(finance.incomeTaxRate * 100)}; zarar ayında 0`}
          />
          <FinanceRow
            label="Vergi kasasına ayır"
            value={formatTry(finance.taxVaultKurus)}
            strong
          />
          <FinanceRow
            label="Gerçek harcanabilir net kâr"
            value={
              finance.spendableNetKurus < 0
                ? `−${formatTry(-finance.spendableNetKurus)}`
                : formatTry(finance.spendableNetKurus)
            }
            strong
          />
        </AdminTableFrame>
      </AdminCard>

      <AdminCard
        title="Vergi takvimi · önümüzdeki 30 gün"
        desc="Son gün hafta sonuna ya da resmî tatile denk gelirse ilk iş gününe kayar. Son güne 5 gün ve 1 gün kala alarm adresine hatırlatma e-postası gider."
      >
        {deadlines.length ? (
          <ul className="adm-kokpit-tax">
            {deadlines.map((item) => {
              const left = daysUntil(today, item.dueDate);
              const estimate = estimateFor(item, bundles, settings);
              return (
                <li key={item.key} className="adm-kokpit-tax-item">
                  <div className="adm-kokpit-tax-day">
                    <span className="adm-num">
                      {left === 0
                        ? "Bugün"
                        : left === 1
                          ? "Yarın"
                          : `${left} gün`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {item.title}{" "}
                      <span className="adm-tool-hint">
                        · {item.periodLabel}
                      </span>
                    </p>
                    <p className="adm-tool-hint">
                      Son gün: {dueDateLabel(item.dueDate)}
                      {item.shiftedFrom
                        ? ` (${item.shiftedFrom} nedeniyle kaydırıldı)`
                        : ""}
                      {item.internal ? " · iç hatırlatma" : ""}
                    </p>
                    <p className="adm-tool-hint">{item.hint}</p>
                    {estimate.amountText || estimate.note ? (
                      <p className="adm-kokpit-tax-estimate">
                        {estimate.amountText ? (
                          <strong>
                            Tahmini tutar: {estimate.amountText}.{" "}
                          </strong>
                        ) : null}
                        {estimate.note}
                      </p>
                    ) : null}
                  </div>
                  <AdminBadge
                    tone={left <= 1 ? "bad" : left <= 5 ? "warn" : "mute"}
                  >
                    {left <= 5 ? "Yaklaşıyor" : "Planlı"}
                  </AdminBadge>
                </li>
              );
            })}
          </ul>
        ) : (
          <AdminEmpty title="Önümüzdeki 30 günde vergi işi yok" />
        )}
      </AdminCard>

      <AdminCard
        title={`Yurt dışı faturalar · ${periodLabelOf(month)}`}
        desc="OpenAI, Vercel, Supabase, Resend, Sentry, Upstash faturalarını ay ay gir. 2 No.lu KDV ve mali müşavir paketi bu tablodan hesaplanır."
      >
        <KokpitExpenses
          month={month}
          expenses={bundle.expenses}
          usdTryRate={settings.usdTryRate}
          disabled={missingTable || bundle.expensesTableMissing}
        />
      </AdminCard>

      <AdminCard
        title="Ayarlar"
        desc="Şirket türü, vergi ve komisyon oranları, dolar kuru, günlük OpenAI bütçesi, koruma modu ve alarm e-postası."
        actions={<TestAlertButton />}
      >
        <KokpitSettingsForm settings={settings} disabled={missingTable} />
      </AdminCard>

      <AdminCard
        title="Son alarmlar"
        desc={
          'Gönderilen son 20 alarm e-postası. Sorun düzelince kayıt "Çözüldü" olarak işaretlenir.'
        }
        bodyless
      >
        {alerts == null ? (
          <AdminEmpty title="Alarm geçmişi okunamadı">
            Tablo henüz yoksa veritabanı değişikliğinden sonra burada görünür.
          </AdminEmpty>
        ) : alerts.length ? (
          <AdminTableFrame
            columns={["Zaman", "Önem", "Alarm", "Gönderildi", "Durum"]}
            stack
          >
            {alerts.map((row) => (
              <tr key={row.id}>
                <td data-label="Zaman" className="adm-num">
                  {istanbulDateTime(row.createdAt)}
                </td>
                <td data-label="Önem">
                  <AdminBadge tone={SEVERITY_TONE[row.severity]}>
                    {SEVERITY_LABEL[row.severity]}
                  </AdminBadge>
                </td>
                <td data-label="Alarm">
                  <span className="font-semibold">{row.title}</span>
                  <div className="adm-tool-hint">{row.message}</div>
                </td>
                <td data-label="Gönderildi">{row.sentTo ?? "Gönderilemedi"}</td>
                <td data-label="Durum">
                  {row.resolvedAt ? (
                    <AdminBadge tone="ok">Çözüldü</AdminBadge>
                  ) : (
                    <AdminBadge tone="mute">Açık</AdminBadge>
                  )}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz alarm yok" />
        )}
      </AdminCard>

      <p className="adm-kokpit-foot">
        Bu ekran ön muhasebe ve operasyon takibi içindir; resmi beyannamelerde
        Serbest Muhasebeci Mali Müşavir ve GİB Vergi Takvimi esas alınır.
      </p>
    </AdminShell>
  );
}
