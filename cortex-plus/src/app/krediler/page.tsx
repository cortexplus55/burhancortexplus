import Link from "next/link";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  allowanceShare,
  formatResetAt,
  periodLabel,
  periodWord,
  quotaView,
} from "@/lib/credits/period";
import { loadReferralSummary } from "@/lib/credits/referral";
import { loadInviteLink } from "@/lib/credits/invite-code";
import { ReferralRewardCard } from "@/components/parity/referral-reward-card";
import { createServiceClient } from "@/lib/supabase/server";
import { freePreview, previewWallet } from "@/lib/billing/free-preview";
import { planTier } from "@/lib/documents/photo-quota";
import { loadUsageLimits } from "@/lib/student/usage-limits";
import { FounderCreditsView } from "@/components/student/founder-credits-view";
import { summarizeFounderUsage, turkeyMonthStart } from "@/lib/credits/founder-usage";

export const metadata = { title: "Limitler" };

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

  const [{ data: wallet }, referral, invite] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    loadReferralSummary(supabase),
    loadInviteLink(supabase, user.id),
  ]);

  const isPremium = Boolean(shell.account?.isPremium);
  // Yöneticinin ücretsiz önizlemesinde hak ayrı tabloda; cüzdan ve ek paket görünmez.
  const preview = shell.account?.freePreview ? await freePreview(service, user.id) : null;
  const quota = quotaView(
    preview ? previewWallet(preview) : wallet,
    isPremium,
    new Date(),
    shell.account?.subscriptionAllowance ?? undefined,
  );
  const extraPercent = preview ? null : allowanceShare(wallet?.balance ?? 0, quota.allowance);

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
            {quota.pendingRefill ? " · hakkın yenilendi" : ""}
          </p>
          {/* Astra gibi sayı yok, yalnızca yüzde (29 Eylül 2026 kararı).
              Ek paket de dönem hakkına oranla gösteriliyor. */}
          {extraPercent ? (
            <p className="cp-quota-detail">
              Ek paketin: aylık hakkına <strong>+%{extraPercent}</strong>
            </p>
          ) : null}
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

        {/* Ana hakla ölçülmeyen sınırlar. Kullanım kartının hemen altında
            duruyorlar çünkü öğrenci "hakkım kalmadı" cümlesini duyduğunda
            önce ana hakka, sonra buraya bakıyor. */}
        <SectionCard
          variant="parity"
          title="Ayrı sayacı olan işler"
          description="Bu işler ana kullanım hakkından düşmüyor; kendi sayaçları var."
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

      </div>
    </ParitySorShell>
  );
}
