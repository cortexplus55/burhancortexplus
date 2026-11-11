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
import { loadFreeMeters } from "@/lib/billing/free-usage-server";
import { FREE_TIER_SENTENCE, freeMeterResetLine } from "@/lib/billing/free-meters";
import { FREE_DOCUMENT_SENTENCE, FREE_FIRST_LESSON_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { firstLessonStatus, type FirstLessonStatus } from "@/lib/billing/free-topic-gate";
import { freeExtraLine } from "@/lib/billing/tier-presentation";

export const metadata = { title: "Kullanım limitleri" };

/**
 * Ücretsiz hesabın ana kartı (24 Ekim 2026): kredi yüzdesi değil, sayaçlar. Ücretsiz günlük kredi 0
 * olduğundan eski kart "%0 kullanıldı" ya da hediye düşünce "%100 · aylık hakkına +%9000" yazıyordu.
 *
 * Notlar hangi işin hangi sayaçtan düştüğünü söyler (`defaultFreeMeter`): aşağıdaki limit listesinde
 * aynı satırlar gizlendiği için kural yalnız burada yazılı. "Anlatarak öğren" (ürün sahibinin kararı) ve yazılı
 * soru çözümü mesajdan düşer.
 *
 * 11 Kasım 2026 akşamı (ürün sahibinin kararı): ücretsiz hesap = tek ders. Eski haftalık ders sayacı (2/3) kalktı;
 * yerinde ilk dersin durumu var (`FirstLessonRow`). Stüdyo'daki test, kart ve doğru/yanlış üretimi Plus'ta.
 */
const FREE_METER_ROW: Record<string, { label: string; note?: string }> = {
  chat: {
    label: "Bugünkü sohbet mesajı",
    note: `Yazılı soru çözümü ve Araçlar'daki "Anlatarak öğren" de mesaj sayılır.`,
  },
  photo: { label: "Bugünkü fotoğraftan çözüm", note: "Okunmayan fotoğraf haktan düşmez." },
};

/** `loadUsageLimits`'in ücretsiz sayaç satırları: ana kartta durdukları için aşağıda tekrar edilmez. */
const FREE_METER_LIMIT_KEYS = new Set(["daily-chat", "daily-photos"]);

const FIRST_LESSON_STATE: Record<FirstLessonStatus["state"], string> = {
  none: "Hazırlığını kurunca açılır",
  open: "Açık",
  done: "Tamamlandı",
};

/** Ücretsiz hesabın ders hakkı: sayaç değil, ilk dersin durumu. Durum okunamazsa yalnız kural yazılır. */
function FirstLessonRow({ status }: { status: FirstLessonStatus | null }) {
  const href = status?.prepId ? `/deneme-sinavlari/${status.prepId}` : "/deneme-sinavlari/olustur";
  return (
    <div className="cp-limit-row">
      <div className="cp-limit-head">
        <span>İlk dersin</span>
        {status ? <strong>{FIRST_LESSON_STATE[status.state]}</strong> : null}
      </div>
      <p>
        {FREE_FIRST_LESSON_SENTENCE}{" "}
        {status?.state === "done"
          ? "Kayıtlı dersini dilediğin kadar yeniden açabilirsin; öbür konular, yeni anlatımlar ve Çalışma Stüdyosu'ndaki test, kart ve doğru/yanlış üretimi Plus'ta."
          : "Öbür konular, yeni anlatımlar ve Çalışma Stüdyosu'ndaki test, kart ve doğru/yanlış üretimi Plus'ta."}{" "}
        <Link href={href} className="underline">
          {status?.state === "none" || !status ? "İlk hazırlığını kur" : status.state === "done" ? "Dersine dön" : "İlk dersine git"}
        </Link>
      </p>
    </div>
  );
}

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
  const isPremium = Boolean(shell.account?.isPremium);
  const tier = await planTier(service, user.id);
  const allLimits = await loadUsageLimits(service, user.id, tier);
  // Ücretsiz hesapta ders, mesaj ve fotoğraf sayaçları ana kartta; aşağıda yalnız ayrı sayılanlar kalır.
  const usageLimits = isPremium ? allLimits : allLimits.filter((limit) => !FREE_METER_LIMIT_KEYS.has(limit.key));

  const [{ data: wallet }, referral, invite] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    loadReferralSummary(supabase, user.id),
    loadInviteLink(supabase, user.id),
  ]);

  // Yöneticinin ücretsiz önizlemesinde hak ayrı tabloda; cüzdan ve ek paket görünmez.
  const preview = shell.account?.freePreview ? await freePreview(service, user.id) : null;
  const quota = quotaView(
    preview ? previewWallet(preview) : wallet,
    isPremium,
    new Date(),
    shell.account?.subscriptionAllowance ?? undefined,
  );
  const extraPercent = preview ? null : allowanceShare(wallet?.balance ?? 0, quota.allowance);
  // Ücretsiz hesap (önizleme dahil): kredi yüzdesi yok, sayaçlar ve ek hak (24 Ekim 2026).
  const freeMeters = isPremium
    ? []
    : (shell.account?.freeMeters ?? (await loadFreeMeters(service, user.id)));
  const extra = isPremium || preview ? null : freeExtraLine(wallet?.balance ?? 0);
  const firstLesson = isPremium ? null : await firstLessonStatus(service, user.id);

  return (
    <ParitySorShell {...shell}>
      <div className="cp-exam-page space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Kullanım limitleri</h1>
          <p className="mt-1 text-sm text-[var(--cs-muted)]">
            {isPremium
              ? "Tüm özellikler açık; sınır yalnızca ne kadar üretebildiğinde."
              : `${FREE_TIER_SENTENCE} ücretsiz. ${PLUS_ONLY_SENTENCE}`}
          </p>
        </div>

        {/* Referans üründe de davet kartı kotanın üstünde duruyor: limitini gören
            kullanıcı hemen ardından nasıl artıracağını görüyor. */}
        <ReferralRewardCard summary={referral} inviteUrl={invite.url} />

        {isPremium ? (
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
            {/* kıyas ürünü gibi sayı yok, yalnızca yüzde (29 Eylül 2026 kararı).
                Ek paket de dönem hakkına oranla gösteriliyor. */}
            {extraPercent ? (
              <p className="cp-quota-detail">
                Ek paketin: aylık hakkına <strong>+%{extraPercent}</strong>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="cp-quota-card">
            <div className="cp-quota-head">
              <span className="cp-quota-plan">Ücretsiz plan</span>
            </div>
            <div className="mt-3">
              <FirstLessonRow status={firstLesson} />
              {freeMeters.map((meter) => {
                const row = FREE_METER_ROW[meter.meter];
                if (!row) return null;
                return (
                  <LimitBar
                    key={meter.meter}
                    label={row.label}
                    value={meter.used}
                    max={meter.limit}
                    hint={[row.note, freeMeterResetLine(meter.meter)].filter(Boolean).join(" ")}
                  />
                );
              })}
            </div>
            {/* Cüzdan bakiyesi (davet hediyesi, aboneliği biten öğrencinin ek paketi, eski promosyon):
                ilk dersin dışındaki üretim (yeni ders, Stüdyo'da test ve kart) ve dolan günlük hak buradan düşer
                (`free-lesson-gate.ts`, SQL credit_reserve_metered). Kaynağı ayrılmadığı için "Hediye" değil,
                "Ek hakkın" yazılır. */}
            {extra ? (
              <p className="cp-quota-detail">
                <strong>{extra}</strong> · ilk dersinin dışındaki ders ve Stüdyo üretimleri buradan kullanılır
              </p>
            ) : null}
          </div>
        )}

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
            <Link href="/pay" className="cp-exam-continue inline-flex">
              Ek paket al
            </Link>
          </div>
        )}

        {/* Ana hakla ölçülmeyen sınırlar. Kullanım kartının hemen altında
            duruyorlar çünkü öğrenci "hakkım kalmadı" cümlesini duyduğunda
            önce ana hakka, sonra buraya bakıyor. */}
        <SectionCard
          variant="parity"
          title={isPremium ? "Ayrı sayacı olan işler" : "Belge sayfaları"}
          description={
            isPremium
              ? "Bu işler ana kullanım hakkından düşmüyor; kendi sayaçları var."
              : `Yüklediğin fotoğraf ve PDF sayfaları mesaj hakkından ayrı sayılır. ${FREE_DOCUMENT_SENTENCE}`
          }
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
