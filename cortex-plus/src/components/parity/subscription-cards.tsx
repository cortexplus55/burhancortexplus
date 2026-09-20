"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, Sigma, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AskParentPaymentButton } from "@/components/paywall/ask-parent-payment";
import { PremiumPlanHero } from "@/components/marketing/premium-plan-hero";
import { billingPeriodOf } from "@/lib/payments/subscription";
import "@/styles/parity-app.css";
import "@/styles/cortex-premium.css";
import { TrustStrip } from "@/components/parity/trust-strip";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  /** Kuruş. 59900 = ₺599,00. */
  price_try: number;
  credit_amount: number;
  is_premium: boolean;
  billing_period?: string | null;
  tier?: string | null;
  period_days?: number | null;
};

/*
  Bu listeler bir zamanlar satılmayan şeyleri satıyordu: "deneme sınavı",
  "quiz, flashcard", "dokümanlarından kaynaklı yanıtlar" Plus'a aitmiş gibi
  yazılıydı, oysa dördü de ücretsiz katmanda açık. Ücretsiz kullanıcı zaten
  yaptığı bir şey için para istenince ne aldığını anlamıyor.

  Şimdi liste yalnızca kodda gerçekten Plus'a bağlı olanları sayıyor ve
  başında "ücretsiz plandaki her şey ve" yazıyor — ücretsizde olanı gizlemeye
  gerek yok, üstüne ne eklendiğini söylemek yeterli.

  Sigma'dan iki madde çıkarıldı: "en gelişmiş model" ve "öncelikli yanıt hızı".
  Kodda Sigma'yı Plus'tan ayıran tek şey kota; ne ayrı bir model ne de öncelik
  sırası var. Olmayan şeyi satmıyoruz.
*/

/** Listelerin başında duran çerçeve cümlesi. */
export const BENEFITS_LEAD = "Ücretsiz plandaki her şey ve:";

const PLUS_BENEFITS = [
  "Günlük hak yerine aylık hak — kat kat fazla kullanım",
  "Sohbette gelişmiş AI modeli seçeneği",
  "Deneme sınavlarında gelişmiş model",
  "Podcast ve ders anlatımında gerçek seslendirme",
  "Sözlü sınavda sesini tanıma",
  "Hakkın biterse ek paket alabilme",
];

const SIGMA_BENEFITS = [
  "Plus’taki her şey",
  "Daha yüksek aylık kullanım hakkı",
  "Yoğun sınav dönemleri için ek kota",
];

const PARENT_PLUS_BENEFITS = [
  "Kota çocuğunun hesabına tanımlanır",
  "Günlük hak yerine aylık hak",
  "Sohbette ve denemelerde gelişmiş AI modeli",
  "Podcast ve sözlü sınavda gerçek seslendirme",
];

const PARENT_SIGMA_BENEFITS = [
  "Plus’taki her şey çocuğunun hesabında",
  "Daha yüksek aylık kullanım hakkı",
  "Yoğun sınav dönemleri için ek kota",
];

type Tier = "plus" | "sigma";
type TierPlans = { weekly?: Plan; monthly?: Plan; yearly?: Plan };

function tierOf(plan: Plan): Tier | "other" {
  const explicit = (plan.tier ?? "").toLowerCase();
  if (explicit === "plus" || explicit === "sigma") return explicit;
  const name = plan.name.toLowerCase();
  if (name.includes("sigma")) return "sigma";
  if (name.includes("plus") || name.includes("premium")) return "plus";
  return "other";
}

/** Kuruş → tam lira. Ondalık göstermiyoruz; fiyatlar zaten tam liralık. */
function lira(kurus: number): number {
  return Math.round(kurus / 100);
}

/** Yıllık planın aylık karşılığı — referans ürün da böyle gösteriyor. */
function perMonthLira(plan: Plan): number {
  const total = lira(plan.price_try);
  return billingPeriodOf(plan) === "yearly" ? Math.round(total / 12) : total;
}

/** Yıllığın aylığa göre kaç puan ucuz olduğu. Hesaplanamıyorsa null. */
function savingPercent(tier: TierPlans): number | null {
  if (!tier.monthly || !tier.yearly) return null;
  const twelveMonths = tier.monthly.price_try * 12;
  if (twelveMonths <= 0) return null;
  const saved = Math.round((1 - tier.yearly.price_try / twelveMonths) * 100);
  return saved > 0 ? saved : null;
}

function tl(value: number): string {
  return value.toLocaleString("tr-TR");
}

export function SubscriptionCards({
  plans,
  guestMode = false,
  closeHref,
  studentAskParent = false,
  embedded = false,
  headingLevel = "h2",
  audience = "default",
  beneficiaryStudentId,
  childName,
  currentBadge = null,
  checkoutEnabled = true,
}: {
  plans: Plan[];
  guestMode?: boolean;
  closeHref?: string;
  studentAskParent?: boolean;
  /** AppShell içinde gösterim */
  embedded?: boolean;
  /** Sayfanın kendi başlığı bu blok ise "h1"; başka bir başlığın altındaysa "h2". */
  headingLevel?: "h1" | "h2";
  audience?: "default" | "parent";
  /** Veli ödemesinde kota bu öğrenciye yazılır. */
  beneficiaryStudentId?: string | null;
  childName?: string | null;
  currentBadge?: "Plus" | "Sigma" | null;
  checkoutEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [yearly, setYearly] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [otherPlansOpen, setOtherPlansOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const { plusTier, sigmaTier, rest } = useMemo(() => {
    const plus: TierPlans = {};
    const sigma: TierPlans = {};
    const others: Plan[] = [];

    for (const plan of plans) {
      const tier = tierOf(plan);
      const period = billingPeriodOf(plan);
      if (tier === "other" || period === "one_time") {
        others.push(plan);
        continue;
      }
      const bucket = tier === "plus" ? plus : sigma;
      /*
        Dönem kendi slotuna. Önceden yıllık olmayan her şey "monthly" sayılıyordu;
        haftalık paket geldiğinde (sort_order 0, yani listenin başı) Plus'ın aylık
        slotunu kapatıp 599 TL'lik paketi ekrandan siliyordu.
      */
      const slot =
        period === "yearly" ? "yearly" : period === "weekly" ? "weekly" : "monthly";
      if (!bucket[slot]) bucket[slot] = plan;
    }

    return { plusTier: plus, sigmaTier: sigma, rest: others };
  }, [plans]);

  /** Yıllık hiç yoksa düğmeyi göstermenin anlamı yok. */
  const hasYearly = Boolean(plusTier.yearly || sigmaTier.yearly);

  function selected(tier: TierPlans): Plan | undefined {
    if (yearly) return tier.yearly ?? tier.monthly;
    return tier.monthly ?? tier.yearly;
  }

  const plusPlan = selected(plusTier);
  const sigmaPlan = selected(sigmaTier);

  /*
    Haftalık, aylığın rakibi değil kapısı: sınav haftasındaki öğrenci aya
    bağlanmıyor. Bu yüzden aylık/yıllık geçişine üçüncü sekme olarak değil,
    Plus kartının altında ayrı bir satır olarak duruyor — karşılaştırmayı
    bozmuyor, isteyene görünüyor.
  */
  const plusWeekly = plusTier.weekly;

  const plusPerMonth = plusPlan ? perMonthLira(plusPlan) : null;
  const sigmaPerMonth = sigmaPlan ? perMonthLira(sigmaPlan) : null;

  const plusSaving = savingPercent(plusTier);
  const sigmaSaving = savingPercent(sigmaTier);
  const headlineSaving = plusSaving ?? sigmaSaving;

  /** "yıllık faturalandırılır · toplam ₺2.990" */
  function billingNoteFor(plan: Plan | undefined): string {
    if (!plan) return yearly ? "yıllık faturalandırılır" : "aylık faturalandırılır";
    if (billingPeriodOf(plan) === "yearly") {
      return `yıllık faturalandırılır · toplam ₺${tl(lira(plan.price_try))}`;
    }
    return "aylık faturalandırılır";
  }

  const isParent = audience === "parent";
  const plusOwned = currentBadge === "Plus" || currentBadge === "Sigma";
  const sigmaOwned = currentBadge === "Sigma";
  /** Embedded checkout: Plus hero CTA; Sigma under “Diğer planlar”. */
  const sigmaUnderFold =
    embedded && !plusOwned && !sigmaOwned && Boolean(sigmaPlan);
  const showSigmaCard = !sigmaUnderFold || otherPlansOpen || plusOwned;
  /*
    Ek kredi paketleri YALNIZCA aboneye gösteriliyor (ürün sahibi kararı,
    18 Eylül 2026).

    Paketin işi aboneliği ikame etmek değil: ayın ortasında kredisi biten
    aboneyi beklemekten kurtarmak. Ücretsiz kullanıcıya gösterilince soru
    "abone olayım mı" değil "hangi paketi alayım" hâline geliyor ve asıl
    ürünün önüne geçiyor. Fiyatlar zaten bu ikameyi caydıracak şekilde
    kuruldu (paket kredisi abonelik biriminin üstünde), ama vitrinde yan
    yana durmaları o caydırıcılığı gereksiz bir karara dönüştürüyordu.

    `currentBadge` yalnızca oturumu olan ve ücretli kademede olan kullanıcı
    için dolu geliyor; herkese açık /fiyatlandirma sayfası onu hiç
    göndermediği için paketler orada da görünmüyor.
  */
  const showCreditPacks = rest.length > 0 && plusOwned;
  const plusBenefits = isParent ? PARENT_PLUS_BENEFITS : PLUS_BENEFITS;
  const sigmaBenefits = isParent ? PARENT_SIGMA_BENEFITS : SIGMA_BENEFITS;

  async function startCheckout(planId: string) {
    if (!checkoutEnabled) return;
    if (!legalAccepted && !guestMode) {
      toast.error("Devam etmek için sözleşmeleri onaylaman gerekiyor.");
      return;
    }
    if (guestMode) {
      router.push(`/kayit?next=${encodeURIComponent("/pay")}`);
      return;
    }
    if (isParent && !beneficiaryStudentId) {
      toast.error("Plus’ı hangi çocuk için alacağını seç.");
      return;
    }
    setLoadingId(planId);
    try {
      const res = await fetch("/api/payments/paytr/create-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          legalAccepted: true,
          ...(beneficiaryStudentId ? { studentId: beneficiaryStudentId } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Ödeme başlatılamadı.");
        return;
      }
      setIframeReady(false);
      setIframeUrl(payload.iframeUrl);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoadingId(null);
    }
  }

  // Izgara düzeni kaç kart çizileceğine bakıyor; koşullar aşağıdakilerle
  // birebir aynı kalmalı, yoksa düzen gerçekte olmayan bir karta göre kurulur.
  /*
    Mesafeli Sözleşmeler Yönetmeliği m.5: tüketici, siparişten ÖNCE ön
    bilgilendirmeyi aldığını ve sözleşmeyi kabul ettiğini teyit etmeli.
    Bu teyit üründe hiç yoktu — ödeme doğrudan başlıyordu.

    Onay kutusu işaretlenmeden ödeme başlamıyor; onay ayrıca sunucuda
    kayda geçiyor (zaman + IP), çünkü itiraz hâlinde kanıt bizde olmalı.
  */
  const [legalAccepted, setLegalAccepted] = useState(false);

  const planCardCount =
    (plusOwned ? 0 : 1) + (showSigmaCard && sigmaPlan ? 1 : 0);

  function closePay() {
    if (guestMode) router.push("/");
    else router.push(returnTo ?? closeHref ?? "/ogretmen");
  }

  if (iframeUrl) {
    return (
      <div className={cn("cs-app py-6", embedded ? "" : "min-h-dvh px-4")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--cs-text)]">
              Güvenli ödeme
            </p>
            <p className="mt-1 text-sm text-[var(--cs-muted)]">
              Form PayTR altyapısında açılır; kart bilgisi bizim sunucuya gelmez.
              {isParent && childName
                ? ` Kota ${childName} hesabına yazılır.`
                : null}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--cs-primary)] hover:bg-[var(--cs-surface)]"
            onClick={() => {
              setIframeUrl(null);
              setIframeReady(false);
            }}
          >
            Paketlere dön
          </button>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-[var(--cs-border)] bg-[var(--cs-surface)] shadow-[0_20px_60px_-40px_rgba(0,0,0,0.45)]">
          {!iframeReady ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--cs-surface)]/95"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--cs-border)] border-t-[var(--cs-primary)]" />
              <p className="text-sm text-[var(--cs-muted)]">Ödeme formu yükleniyor…</p>
            </div>
          ) : null}
          <iframe
            src={iframeUrl}
            title="PayTR ödeme formu"
            className="h-[min(640px,70dvh)] w-full bg-white"
            onLoad={() => setIframeReady(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "cs-app relative pb-8",
        embedded ? "pt-2" : "min-h-dvh px-4 pt-6",
      )}
    >
      {/*
        Kapatma düğmesi yalnızca dönülecek BELİRLİ bir yer varken.

        Eskiden `!embedded` yetiyordu ve /fiyatlandirma'da havada duran bir ×
        çıkıyordu: sayfanın üstünde menü, altında footer var, ortada da
        kapatılacak bir pencere yokken bir kapatma düğmesi. Modalden sızmış
        gibi duruyordu ve bastığında öğrenciyi habersizce ana sayfaya atıyordu.

        Katman olarak açıldığında (returnTo / closeHref dolu) düğme anlamlı:
        öğrenci geldiği yere döner.
      */}
      {!embedded && (returnTo || closeHref) ? (
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full p-2 text-[var(--cs-muted)] hover:bg-[var(--cs-surface)]"
          aria-label="Kapat"
          onClick={closePay}
        >
          <X className="h-5 w-5" />
        </button>
      ) : null}

      {/*
        Geniş ekranda kap genişliyor, kademeler yan yana geliyor.

        Eskiden her şey `max-w-md` (448px) içindeydi: 1440px'lik bir ekranda
        iki kart dar bir sütunda alt alta duruyor, iki yan bomboş kalıyordu.
        Kademeler ancak yan yana kıyaslanabiliyor — alt alta okuyan öğrenci
        ikisini kafasında tutamıyor.

        Başlık, dönem düğmesi ve alt notlar dar kalıyor: onlar okunacak metin,
        kıyaslanacak kart değil.
      */}
      <div
        className={cn(
          "mx-auto max-w-md space-y-6 lg:max-w-4xl",
          embedded ? "" : "pt-8",
        )}
      >
      <div className="mx-auto max-w-md space-y-6">
        {isParent ? null : (
          <PremiumPlanHero
            align={embedded ? "start" : "center"}
            headingLevel={headingLevel}
            eyebrow={currentBadge ?? undefined}
            title={currentBadge ? "Aboneliğin aktif" : undefined}
            description={
              currentBadge
                ? `${currentBadge} planınla premium özellikler ve aylık kullanım hakkın açık.`
                : undefined
            }
          />
        )}

        {returnTo && !guestMode ? (
          <p className="rounded-xl border border-[var(--cs-border)] bg-[var(--cs-surface)] p-3 text-sm text-[var(--cs-muted)]">
            Ödeme sonrası kaldığın yere döneceksin.
          </p>
        ) : null}

        {/* Tek düğme iki kartı birden çevirir; her kartta ayrı bir düğme olsaydı
            hangi fiyatın seçili olduğu karışırdı. */}
        {hasYearly && !plusOwned ? (
          <div
            role="tablist"
            aria-label="Fatura dönemi"
            className="mx-auto flex max-w-xs rounded-full bg-[var(--cs-bg)] p-1 text-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={yearly}
              className={cn(
                "flex-1 min-h-[44px] rounded-full px-3 py-2.5 font-medium transition-colors",
                yearly ? "cs-nav-active text-white" : "text-[var(--cs-muted)]",
              )}
              onClick={() => setYearly(true)}
            >
              Yıllık
              {headlineSaving ? ` · %${headlineSaving} tasarruf` : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!yearly}
              className={cn(
                "flex-1 min-h-[44px] rounded-full px-3 py-2.5 font-medium transition-colors",
                !yearly ? "cs-nav-active text-white" : "text-[var(--cs-muted)]",
              )}
              onClick={() => setYearly(false)}
            >
              Aylık
            </button>
          </div>
        ) : null}

      </div>

      {/*
        İki sütun ancak iki kart varken. Tek kart iki sütunlu bir ızgarada sol
        yarıya oturup sağ yarıyı boş bırakıyor — sayfa eksik görünüyor.
      */}
      <div
        className={cn(
          "grid gap-4 lg:items-start",
          planCardCount > 1 ? "lg:grid-cols-2" : "mx-auto max-w-md",
        )}
      >
        {plusOwned ? null : (
        <article className="cs-pay-card cs-pay-card--premium cs-pay-card--recommended p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Plus className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <span className="cs-pay-recommended-badge">Önerilen</span>
              <h2 className="text-lg font-semibold">Plus</h2>
              <p className="text-sm text-[var(--cs-muted)]">
                Günlük öğrenme için
              </p>
              <p className="mt-4 text-3xl font-bold">
                {plusPerMonth === null ? "Yapılandırılıyor" : `₺${tl(plusPerMonth)}`}
                {plusPerMonth === null ? null : (
                  <span className="text-base font-normal text-[var(--cs-muted)]">
                    {" "}/ ay
                  </span>
                )}
              </p>
              <p className="text-xs text-[var(--cs-muted)]">
                {billingNoteFor(plusPlan)}
              </p>
              {yearly && plusSaving ? (
                <p className="cs-pay-save-callout">
                  Yıllıkta %{plusSaving} daha uygun
                </p>
              ) : null}
              <button
                type="button"
                disabled={!checkoutEnabled || plusOwned || loadingId === plusPlan?.id}
                className="cortex-premium-btn-primary mt-4 disabled:opacity-60"
                onClick={() =>
                  plusOwned
                    ? undefined
                    : plusPlan
                      ? startCheckout(plusPlan.id)
                      : guestMode
                        ? router.push("/kayit")
                        : toast.error("Plus paketi yapılandırılmadı.")
                }
              >
                {!checkoutEnabled
                  ? "Yakında"
                  : plusOwned
                  ? "Bu çocukta Plus açık"
                  : loadingId === plusPlan?.id
                    ? "Hazırlanıyor…"
                    : isParent
                      ? "Çocuğum için Plus al"
                      : "Plus'a yükselt"}
              </button>
              {checkoutEnabled && studentAskParent && plusPlan && !guestMode ? (
                <AskParentPaymentButton
                  planId={plusPlan.id}
                  planName={plusPlan.name}
                />
              ) : null}
              {checkoutEnabled && plusWeekly && !plusOwned && !isParent ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-full border border-[var(--cs-border)] py-2.5 text-sm text-[var(--cs-text)] disabled:opacity-60"
                  disabled={loadingId === plusWeekly.id}
                  onClick={() =>
                    guestMode
                      ? router.push("/kayit")
                      : startCheckout(plusWeekly.id)
                  }
                >
                  {loadingId === plusWeekly.id
                    ? "Hazırlanıyor…"
                    : `Bir hafta dene · ₺${tl(lira(plusWeekly.price_try))}`}
                </button>
              ) : null}
              {plusWeekly && !plusOwned && !isParent ? (
                <p className="mt-1.5 text-center text-xs text-[var(--cs-muted)]">
                  Sınav haftası için tek ödeme, abonelik açılmaz.
                </p>
              ) : null}
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 text-sm text-[var(--cs-muted)]"
                onClick={() => setPlusOpen((v) => !v)}
              >
                Tüm avantajları gör
                {plusOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {plusOpen ? (
                <>
                <p className="mt-2 text-xs font-semibold text-[var(--cs-text)]">
                  {BENEFITS_LEAD}
                </p>
                <ul className="mt-1.5 space-y-1.5 text-sm text-[var(--cs-muted)]">
                  {plusBenefits.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
                </>
              ) : null}
            </div>
          </div>
        </article>
        )}

        {sigmaUnderFold && !otherPlansOpen ? (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--cs-border)] bg-[var(--cs-surface)] py-3.5 text-sm font-medium text-[var(--cs-muted)] transition-colors hover:border-[var(--cs-primary)]/40 hover:text-[var(--cs-text)]"
            onClick={() => setOtherPlansOpen(true)}
          >
            Diğer planlar · Sigma
            <ChevronDown className="h-4 w-4" />
          </button>
        ) : null}

        {showSigmaCard && sigmaPlan ? (
          <article className="cs-pay-card cs-pay-card--premium relative overflow-hidden p-5">
            <span className="absolute right-3 top-3 rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
              Daha yüksek limit
            </span>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Sigma className="h-6 w-6" />
              </span>
              <div className="flex-1">
                {sigmaUnderFold ? (
                  <button
                    type="button"
                    className="mb-2 flex items-center gap-1 text-xs text-[var(--cs-muted)]"
                    onClick={() => setOtherPlansOpen(false)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Diğer planları gizle
                  </button>
                ) : null}
                <h2 className="text-lg font-semibold">Sigma</h2>
                <p className="text-sm text-[var(--cs-muted)]">
                  Ciddi çalışma için
                </p>
                <p className="mt-4 text-3xl font-bold">
                  ₺{tl(sigmaPerMonth ?? 0)}
                  <span className="text-base font-normal text-[var(--cs-muted)]">
                    {" "}
                    / ay
                  </span>
                </p>
                <p className="text-xs text-[var(--cs-muted)]">
                  {billingNoteFor(sigmaPlan)}
                </p>
                <button
                  type="button"
                  disabled={!checkoutEnabled || sigmaOwned || loadingId === sigmaPlan.id}
                  className={cn(
                    "mt-4 w-full rounded-full py-3.5 text-sm font-semibold disabled:opacity-60",
                    sigmaUnderFold
                      ? "border border-[var(--cs-border)] bg-transparent text-[var(--cs-text)] hover:bg-[var(--cs-surface)]"
                      : "cs-btn-primary",
                  )}
                  onClick={() =>
                    sigmaOwned
                      ? undefined
                      : sigmaPlan
                        ? startCheckout(sigmaPlan.id)
                        : guestMode
                          ? router.push("/kayit")
                          : toast.error("Sigma paketi yapılandırılmadı.")
                  }
                >
                {sigmaOwned
                  ? isParent
                    ? "Bu çocukta Sigma açık"
                    : "Sigma aktif"
                  : !checkoutEnabled
                    ? "Yakında"
                    : loadingId === sigmaPlan.id
                      ? "Hazırlanıyor…"
                      : isParent
                        ? "Çocuğum için Sigma al"
                        : "Sigma'ya yükselt"}
                </button>
                <ul className="mt-3 space-y-1 text-xs text-[var(--cs-muted)]">
                  {sigmaBenefits.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
                {!checkoutEnabled || isParent ? null : studentAskParent && !guestMode ? (
                  <AskParentPaymentButton
                    planId={sigmaPlan.id}
                    planName={sigmaPlan.name}
                  />
                ) : sigmaUnderFold ? null : (
                  <Link
                    href="/destek"
                    className="mt-3 block text-center text-xs text-[var(--cs-primary)] underline underline-offset-2"
                  >
                    Ebeveynden ödeme iste
                  </Link>
                )}
              </div>
            </div>
          </article>
        ) : null}

      </div>

      <div className="mx-auto max-w-md space-y-6">
        {showCreditPacks ? (
          <div className="space-y-3">
            {rest.map((plan) => (
              <article
                key={plan.id}
                className="cs-pay-card flex items-center justify-between p-4"
              >
                <div>
                  <h3 className="font-medium">{plan.name}</h3>
                  <p className="text-sm text-[var(--cs-muted)]">
                    ₺{tl(lira(plan.price_try))} · {plan.credit_amount} kredi
                  </p>
                </div>
                <button
                  type="button"
                  className="cs-btn-primary rounded-full px-4 py-2 text-sm font-medium"
                  disabled={!checkoutEnabled || loadingId === plan.id}
                  onClick={() => startCheckout(plan.id)}
                >
                  {checkoutEnabled ? "Satın al" : "Yakında"}
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {/*
          Para iadesi sözü yerine ÜRÜN sözü.

          "14 gün koşulsuz iade" nakitle güven satın almaya çalışıyordu ve
          kredisini yakıp iade isteyen kullanıcıya açıktı. Buradaki söz ise
          ürünün zaten yaptığı şey: notunda olmayanı uydurmuyor ve
          uydurmadığı o soruda kredi de almıyor. Bedeli nakit değil kredi,
          karşılığı da kodda duruyor.
        */}
        {/*
          Yasal onay. Tek kutu: iki belge de aynı cümlede anılıyor.

          Misafir modda gösterilmiyor çünkü orada "Satın al" ödemeye değil
          kayıt sayfasına gidiyor; onay, ödemenin gerçekten başladığı yerde
          alınmalı.
        */}
        {guestMode ? null : (
          <label className="cs-legal-consent">
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(event) => setLegalAccepted(event.target.checked)}
            />
            <span>
              <a href="/on-bilgilendirme" target="_blank" rel="noreferrer">
                Ön Bilgilendirme Formu
              </a>
              &apos;nu ve{" "}
              <a href="/mesafeli-satis" target="_blank" rel="noreferrer">
                Mesafeli Satış Sözleşmesi
              </a>
              &apos;ni okudum, kabul ediyorum.
            </span>
          </label>
        )}

                <TrustStrip />

        <p className="text-center text-xs text-[var(--cs-muted)]">
          Notunda olmayanı uydurmaz. Cevaplayamadığı soruda kredin düşmez.
        </p>

        {embedded && !guestMode && !isParent && !plusOwned ? (
          <p className="text-center text-xs text-[var(--cs-muted)]">
            <a href="/ogretmen" className="underline underline-offset-2">
              Ücretsiz planda devam et
            </a>
          </p>
        ) : null}
      </div>
      </div>
    </div>
  );
}
