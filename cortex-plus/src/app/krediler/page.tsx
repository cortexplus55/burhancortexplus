import Link from "next/link";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { formatResetAt, periodLabel, periodWord, quotaView } from "@/lib/credits/period";
import { loadReferralSummary } from "@/lib/credits/referral";
import { loadInviteLink } from "@/lib/credits/invite-code";
import { ReferralRewardCard } from "@/components/parity/referral-reward-card";
import { createServiceClient } from "@/lib/supabase/server";
import { planTier } from "@/lib/documents/photo-quota";
import { loadUsageLimits } from "@/lib/student/usage-limits";
import { FounderCreditsView } from "@/components/student/founder-credits-view";
import { summarizeFounderUsage, turkeyMonthStart } from "@/lib/credits/founder-usage";

export const metadata = { title: "Limitler" };

const entryLabels: Record<string, string> = {
  grant: "Hediye",
  reserve: "Rezerve",
  commit: "Kullanıldı",
  refund: "İade",
  purchase: "Satın alma",
  adjustment: "Düzeltme",
};

function LimitBar({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="cp-limit-row">
      <div className="cp-limit-head">
        <span>{label}</span>
        <strong>
          {formatNumber(value)} / {formatNumber(max)}
        </strong>
      </div>
      <div className="cp-limit-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="cp-limit-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>{hint}</p>
    </div>
  );
}

export default async function KredilerPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Kurucu görünümü: bakiye düşmediği için kota, satış ve paket yok; yalnızca
  // defterdeki 0 kredilik kayıtlardan maliyet takibi.
  if (shell.account.isAdmin) {
    const bypass = () =>
      supabase
        .from("credit_ledger")
        .select("id, action_code, metadata, created_at")
        .eq("user_id", user.id)
        .eq("entry_type", "reserve")
        .eq("metadata->>admin_bypass", "true");
    const [month, recent] = await Promise.all([
      bypass().gte("created_at", turkeyMonthStart()).limit(5000),
      bypass().order("created_at", { ascending: false }).limit(20),
    ]);
    const failed = Boolean(month.error || recent.error);
    return (
      <ParitySorShell {...shell}>
        <FounderCreditsView
          failed={failed}
          summary={failed ? null : summarizeFounderUsage(month.data ?? [])}
          recent={failed ? [] : (recent.data ?? [])}
        />
      </ParitySorShell>
    );
  }

  /*
    Krediden bağımsız sayaçlar service role ile okunuyor: `document_page_grants`
    ve `model_upgrade_grants` istemciye tümüyle kapalı (RLS açık, politika yok).
    Öğrencinin kendi sayısını görmesi için tabloları açmak, ikisini de
    yazılabilir hâle getirme riskini doğururdu.
  */
  const service = createServiceClient();
  const tier = await planTier(service, user.id);
  const usageLimits = await loadUsageLimits(service, user.id, tier);

  const [
    { data: wallet },
    { data: ledger },
    { data: rules },
    referral,
    invite,
  ] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, reserved, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("id, delta, entry_type, action_code, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("credit_rules")
      .select("action_code, credit_cost, description")
      .eq("active", true)
      .order("credit_cost"),
    loadReferralSummary(supabase),
    loadInviteLink(supabase, user.id),
  ]);

  const balance = wallet?.balance ?? 0;
  const reserved = wallet?.reserved ?? 0;
  const isPremium = Boolean(shell.account?.isPremium);
  const quota = quotaView(
    wallet,
    isPremium,
    new Date(),
    shell.account?.subscriptionAllowance ?? undefined,
  );

  return (
    <ParitySorShell {...shell}>
      <div className="cp-exam-page space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Kullanım limitleri</h1>
          <p className="mt-1 text-sm text-[var(--cs-muted)]">
            Tüm özellikler açık; sınır yalnızca ne kadar üretebildiğinde.
          </p>
        </div>

        {/* Referans üründe de davet kartı kotanın üstünde duruyor: limitini gören
            kullanıcı hemen ardından nasıl artıracağını görüyor. */}
        <ReferralRewardCard summary={referral} inviteUrl={invite.url} />

        <div className="cp-quota-card">
          <div className="cp-quota-head">
            <span className="cp-quota-plan">
              {shell.account?.subscriptionBadge ?? "Temel"} — {periodLabel(quota.kind)}
            </span>
            <span className="cp-quota-pct">%{quota.usedPercent} kullanıldı</span>
          </div>
          <div
            className="cp-quota-track"
            role="progressbar"
            aria-valuenow={quota.usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Dönem kullanımı"
          >
            <div
              className="cp-quota-fill"
              style={{ width: `${Math.max(quota.usedPercent, quota.usedPercent > 0 ? 3 : 0)}%` }}
            />
          </div>
          <p className="cp-quota-reset">
            {formatResetAt(quota.resetsAt)} tarihinde sıfırlanır
            {quota.pendingRefill ? " · bütçen yenilendi" : ""}
          </p>
          <p className="cp-quota-detail">
            <strong>{formatNumber(quota.remaining)}</strong> / {formatNumber(quota.allowance)} hak kaldı
            {balance > 0 ? ` · ayrıca ${formatNumber(balance)} satın alınmış kredin var` : ""}
            {reserved > 0 ? ` · ${formatNumber(reserved)} rezerve` : ""}
          </p>
        </div>

        {!isPremium ? (
          <div className="cp-quota-upsell">
            <p>Daha fazlasına mı ihtiyacın var?</p>
            <Link href="/pay" className="cp-exam-continue inline-flex">
              Kullanımını artır
            </Link>
          </div>
        ) : (
          <div className="cp-quota-upsell">
            <p>{periodWord(quota.kind)} kotan dolduysa ek paket alabilirsin.</p>
            <Link href="/paketler" className="cp-exam-continue inline-flex">
              Ek paket al
            </Link>
          </div>
        )}

        {/* Krediyle ölçülmeyen sınırlar. Kredi kartının hemen altında
            duruyorlar çünkü öğrenci "hakkım kalmadı" cümlesini duyduğunda
            önce krediye, sonra buraya bakıyor. */}
        <SectionCard
          variant="parity"
          title="Krediden ayrı sınırlar"
          description="Bu işler krediyle ölçülmüyor; kendi sayaçları var."
        >
          <div className="cp-limit-card">
            {usageLimits.map((limit) => (
              <LimitBar
                key={limit.key}
                label={limit.label}
                value={limit.used}
                max={limit.limit}
                hint={limit.hint}
              />
            ))}
          </div>
        </SectionCard>

        <div className="cp-limit-card">
          <LimitBar
            label="Çalışma serisi"
            value={shell.streak ?? 0}
            max={7}
            hint="Son 7 günde üst üste çalışma"
          />
        </div>

        <SectionCard
          variant="parity"
          title="İşlem başına kredi"
          description="Fiyatlar sunucu tarafında tutulur; işlem öncesinde her zaman gösterilir."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {(rules ?? []).map((rule) => (
              <li key={rule.action_code} className="cortex-premium-inset-row">
                <span>{rule.description ?? rule.action_code}</span>
                <span className="font-medium text-[var(--cs-primary)]">
                  {rule.credit_cost}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard variant="parity" title="Hareketler">
          {ledger?.length ? (
            <ul className="cortex-premium-inset-list divide-y">
              {ledger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="text-[var(--cs-text)]">
                    {entryLabels[entry.entry_type] ?? entry.entry_type}
                    {entry.action_code ? ` · ${entry.action_code}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        entry.delta > 0
                          ? "font-medium text-[var(--cs-primary)]"
                          : "text-[var(--cs-muted)]"
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta}
                    </span>
                    <span className="text-xs text-[var(--cs-muted)]">
                      {formatDate(entry.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--cs-muted)]">Henüz hareket yok.</p>
          )}
        </SectionCard>
      </div>
    </ParitySorShell>
  );
}
