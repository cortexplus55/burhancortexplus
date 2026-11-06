import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { FxRateForm } from "@/components/admin/fx-rate-form";
import { SpendCapForm } from "@/components/admin/spend-cap-form";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { loadFinanceReport } from "@/lib/admin/finance";
import { WINDOW_KEYS, WINDOW_LABEL, spendKurus, type WindowCounts, type WindowKey } from "@/lib/admin/cockpit-math";
import { formatMargin, formatUsd, modelLabel } from "@/lib/admin/finance-math";
import { DEFAULT_DAILY_SPEND_CAP_USD } from "@/lib/billing/spend-breaker-copy";
import { formatNumber, formatTry } from "@/lib/format";

export const metadata = { title: "Yönetim · Birim Ekonomisi" };
export const dynamic = "force-dynamic";

const WINDOW_COLUMNS = WINDOW_KEYS.map((key) => WINDOW_LABEL[key]);

function Row({ label, values, strong = false, muted = false }: { label: string; values: Record<WindowKey, string>; strong?: boolean; muted?: boolean }) {
  return (
    <tr>
      <td className={strong ? "font-semibold" : muted ? "text-[var(--adm-muted)]" : undefined}>{label}</td>
      {WINDOW_KEYS.map((key) => (
        <td key={key} className={`adm-num${strong ? " font-semibold" : ""}${muted ? " text-[var(--adm-muted)]" : ""}`}>
          {values[key]}
        </td>
      ))}
    </tr>
  );
}

function mapWindows<T>(read: (key: WindowKey) => T, format: (value: T) => string): Record<WindowKey, string> {
  return { today: format(read("today")), week: format(read("week")), month: format(read("month")) };
}

function tryOrDash(value: number | null): string {
  return value == null ? "—" : formatTry(value);
}

function counts(values: WindowCounts, format: (value: number) => string): Record<WindowKey, string> {
  return mapWindows((key) => values[key], format);
}

export default async function AdminMaliyetlerPage() {
  const { role } = await requireAdminPage();
  const isFounder = role === "founder";
  const report = await loadFinanceReport(createServiceClient());
  const { collection, spend, pnl, models, breaker, usdTry, failed } = report;
  const unpricedModels = spend.month?.unpricedModels ?? [];
  const unpricedCalls = spend.month?.unpricedCalls ?? 0;

  return (
    <AdminShell href="/admin/maliyetler">
      {failed.length ? (
        <AdminNote tone="warn">Şu kaynaklar okunamadı, ilgili satırlar eksik olabilir: {failed.join(", ")}.</AdminNote>
      ) : null}

      <AdminCard
        title="Canlı kâr / zarar"
        desc="Türkiye günüyle üç pencere. Tahsilat PayTR'den başarıyla alınan ödemeler; iade, iadenin yapıldığı güne yazılır. Gider OpenAI çağrılarının jeton sayısı × model fiyatıdır (tahmin, fatura değil); TL karşılığı aşağıdaki kurla."
        actions={isFounder ? <FxRateForm current={usdTry.rate} isDefault={usdTry.source === "default"} /> : undefined}
        bodyless
      >
        <AdminTableFrame columns={["", ...WINDOW_COLUMNS]}>
          <Row label="PayTR tahsilatı" values={counts(collection.grossKurus, formatTry)} />
          <Row label="· Ödeme adedi" values={counts(collection.paidCount, formatNumber)} muted />
          <Row label="İade edilen" values={counts(collection.refundKurus, (value) => (value ? `−${formatTry(value)}` : formatTry(0)))} />
          <Row label="· İade adedi" values={counts(collection.refundCount, formatNumber)} muted />
          <Row label="Net gelir" values={counts(collection.netKurus, formatTry)} strong />
          <Row label="OpenAI gideri ($)" values={mapWindows((key) => spend[key]?.usd ?? null, (value) => (value == null ? "okunamadı" : formatUsd(value)))} />
          <Row label="OpenAI gideri (TL)" values={mapWindows((key) => pnl[key].spendKurus, tryOrDash)} />
          <Row label="Net kâr" values={mapWindows((key) => pnl[key].profitKurus, tryOrDash)} strong />
          <Row label="Kâr marjı" values={mapWindows((key) => pnl[key].marginPct, formatMargin)} strong />
        </AdminTableFrame>
        <div className="space-y-1 px-5 py-3 text-xs text-[var(--adm-muted)]">
          <p>
            Kur: 1 USD = {usdTry.rate.toLocaleString("tr-TR")} TL
            {usdTry.source === "default" ? " (varsayılan; kurucu güncel kuru girince kalkar)" : " (kurucunun girdiği)"}.
            {isFounder ? "" : " Kuru ve harcama tavanını yalnız kurucu değiştirir."}
          </p>
          <p>PayTR komisyonu ve vergiler düşülmedi. Gelir yoksa marj hesaplanamaz (—).</p>
        </div>
      </AdminCard>

      <AdminCard
        title="Günlük harcama sigortası"
        desc="Türkiye gününün OpenAI gideri tavana ulaşınca ücretsiz hesapların model çağrısı durur; hazır müfredat ve Plus üyeler sürer. Tavan bir dakika içinde bütün sunucularda geçerli olur."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {breaker ? (
              <AdminBadge tone={!breaker.enabled ? "mute" : breaker.tripped ? "bad" : "ok"}>
                {!breaker.enabled ? "Kapalı (yerel ortam)" : breaker.tripped ? "Devrede · ücretsiz üretim durdu" : "Açık · sınırın altında"}
              </AdminBadge>
            ) : (
              <AdminBadge tone="mute">Okunamadı</AdminBadge>
            )}
            {breaker ? (
              <span className="text-[var(--adm-muted)]">
                Bugün {breaker.spentUsd == null ? "okunamadı" : formatUsd(breaker.spentUsd)} / tavan {formatUsd(breaker.cap.capUsd)}
                {breaker.spentUsd != null && breaker.cap.capUsd > 0
                  ? ` · %${Math.min(999, Math.round((breaker.spentUsd / breaker.cap.capUsd) * 100))} doldu`
                  : ""}
                {(() => {
                  const kurus = spendKurus(breaker.cap.capUsd, usdTry.rate);
                  return kurus == null ? "" : ` · tavan ≈ ${formatTry(kurus)}`;
                })()}
              </span>
            ) : null}
          </div>
          {isFounder ? (
            <SpendCapForm current={breaker?.cap.capUsd ?? DEFAULT_DAILY_SPEND_CAP_USD} source={breaker?.cap.source ?? "default"} />
          ) : (
            <p className="text-xs text-[var(--adm-muted)]">
              Tavan: {formatUsd(breaker?.cap.capUsd ?? DEFAULT_DAILY_SPEND_CAP_USD)} · yalnız kurucu değiştirir.
            </p>
          )}
        </div>
      </AdminCard>

      <AdminCard title="Modele göre OpenAI gideri" desc="Son 30 günün en pahalı modeli üstte; dolar ve kurla TL karşılığı." bodyless>
        {models.length ? (
          <AdminTableFrame columns={["Model", "Bugün", "Son 7 gün", "Son 30 gün", "Son 30 gün (TL)", "Çağrı (30 gün)"]}>
            {models.map((row) => (
              <tr key={row.model}>
                <td className="font-medium">{row.label}</td>
                <td className="adm-num">{formatUsd(row.usd.today)}</td>
                <td className="adm-num">{formatUsd(row.usd.week)}</td>
                <td className="adm-num">{formatUsd(row.usd.month)}</td>
                <td className="adm-num">{tryOrDash(spendKurus(row.usd.month, usdTry.rate))}</td>
                <td className="adm-num">{formatNumber(row.calls.month)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Gider hesaplanamıyor">
            Son 30 günde fiyatı tanımlı bir model çağrısı yok ya da kullanım okunamadı.
          </AdminEmpty>
        )}
        {unpricedModels.length ? (
          <p className="border-t border-[var(--adm-line)] px-5 py-3 text-xs text-[var(--adm-muted)]">
            Fiyatı tanımsız {formatNumber(unpricedModels.length)} model ({unpricedModels.map(modelLabel).join(", ")}) ·{" "}
            {formatNumber(unpricedCalls)} çağrı toplama katılmadı; gerçek gider gösterilenden yüksek olabilir. Fiyat, model
            fiyat tablosuna girilince hesaba katılır. <Link href="/admin/ai-kullanimi" className="underline">AI kullanımı</Link>
          </p>
        ) : null}
      </AdminCard>
    </AdminShell>
  );
}
