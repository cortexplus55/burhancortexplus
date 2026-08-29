"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, Sigma, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AskParentPaymentButton } from "@/components/paywall/ask-parent-payment";
import "@/styles/astra-app.css";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_try: number;
  credit_amount: number;
  is_premium: boolean;
};

const PLUS_BENEFITS = [
  "Yüksek kredi kotası ve ücretsiz haklar",
  "Deneme sınavı üretimi ve analiz",
  "Quiz, flashcard ve çalışma planı",
  "Dokümanlarından kaynaklı yanıtlar",
  "Plus aboneliği ile gelişmiş AI modeli",
];

const SIGMA_BENEFITS = [
  "Plus’taki tüm avantajlar",
  "En gelişmiş model ve yüksek kredi paketi",
  "Öncelikli yanıt hızı",
  "Yoğun sınav dönemleri için ek kredi",
];

const PARENT_PLUS_BENEFITS = [
  "Kota çocuğunun hesabına tanımlanır",
  "Yüksek kredi ve ücretsiz hak",
  "Deneme sınavı üretimi ve analiz",
  "Quiz, flashcard ve çalışma planı",
  "Gelişmiş AI modeli",
];

const PARENT_SIGMA_BENEFITS = [
  "Plus’taki tüm avantajlar çocuğunun hesabında",
  "En gelişmiş model ve yüksek kredi paketi",
  "Yoğun sınav dönemleri için ek kota",
];

const FALLBACK_PLUS = 770;
const FALLBACK_SIGMA = 2567;
const FALLBACK_YEARLY_PLUS = 321;

function planTier(name: string): "plus" | "sigma" | "other" {
  const n = name.toLowerCase();
  if (n.includes("sigma")) return "sigma";
  if (n.includes("plus") || n.includes("premium")) return "plus";
  return "other";
}

export function AstraSubscriptionCards({
  plans,
  guestMode = false,
  closeHref,
  studentAskParent = false,
  embedded = false,
  audience = "default",
  beneficiaryStudentId,
  childName,
  currentBadge = null,
}: {
  plans: Plan[];
  guestMode?: boolean;
  closeHref?: string;
  studentAskParent?: boolean;
  /** AppShell içinde gösterim */
  embedded?: boolean;
  audience?: "default" | "parent";
  /** Veli ödemesinde kota bu öğrenciye yazılır. */
  beneficiaryStudentId?: string | null;
  childName?: string | null;
  currentBadge?: "Plus" | "Sigma" | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [yearly, setYearly] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [otherPlansOpen, setOtherPlansOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const { plusPlan, sigmaPlan, rest } = useMemo(() => {
    let plus: Plan | undefined;
    let sigma: Plan | undefined;
    const others: Plan[] = [];
    for (const p of plans) {
      const tier = planTier(p.name);
      if (tier === "plus" && !plus) plus = p;
      else if (tier === "sigma" && !sigma) sigma = p;
      else others.push(p);
    }
    if (!plus && plans[0]) plus = plans.find((p) => !p.is_premium) ?? plans[0];
    if (!sigma && plans.length > 1)
      sigma = plans.find((p) => p.is_premium && p.id !== plus?.id) ?? plans[1];
    return { plusPlan: plus, sigmaPlan: sigma, rest: others };
  }, [plans]);

  const plusMonthly = plusPlan?.price_try ?? FALLBACK_PLUS;
  const sigmaMonthly = sigmaPlan?.price_try ?? FALLBACK_SIGMA;

  function displayPlusMonthly() {
    if (!yearly) return plusMonthly;
    return Math.round(plusMonthly * (FALLBACK_YEARLY_PLUS / FALLBACK_PLUS));
  }

  const isParent = audience === "parent";
  const plusOwned = currentBadge === "Plus" || currentBadge === "Sigma";
  const sigmaOwned = currentBadge === "Sigma";
  /** Embedded checkout: Plus hero CTA; Sigma under “Diğer planlar”. */
  const sigmaUnderFold =
    embedded && !plusOwned && !sigmaOwned && Boolean(sigmaPlan);
  const showSigmaCard = !sigmaUnderFold || otherPlansOpen || plusOwned;
  const plusBenefits = isParent ? PARENT_PLUS_BENEFITS : PLUS_BENEFITS;
  const sigmaBenefits = isParent ? PARENT_SIGMA_BENEFITS : SIGMA_BENEFITS;

  async function startCheckout(planId: string) {
    if (guestMode) {
      router.push(`/kayit?next=${encodeURIComponent("/paketler")}`);
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
          ...(beneficiaryStudentId ? { studentId: beneficiaryStudentId } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Ödeme başlatılamadı.");
        return;
      }
      setIframeUrl(payload.iframeUrl);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoadingId(null);
    }
  }

  function closePay() {
    if (guestMode) router.push("/");
    else router.push(returnTo ?? closeHref ?? "/ogretmen");
  }

  if (iframeUrl) {
    return (
      <div className={cn("astra-app py-6", embedded ? "" : "min-h-dvh px-4")}>
        <p className="mb-3 text-sm text-[var(--astra-muted)]">
          Ödeme formu güvenli çerçevede açıldı.
          {isParent && childName
            ? ` Kota ${childName} hesabına yazılır.`
            : null}
        </p>
        <iframe
          src={iframeUrl}
          title="PayTR ödeme formu"
          className="h-[min(640px,70dvh)] w-full rounded-2xl border border-[var(--astra-border)]"
        />
        <button
          type="button"
          className="mt-4 text-sm text-[var(--astra-primary)]"
          onClick={() => setIframeUrl(null)}
        >
          Paketlere dön
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "astra-app relative pb-8",
        embedded ? "pt-2" : "min-h-dvh px-4 pt-6",
      )}
    >
      {!embedded ? (
        <button
          type="button"
          className="absolute right-4 top-4 rounded-full p-2 text-[var(--astra-muted)] hover:bg-[var(--astra-surface)]"
          aria-label="Kapat"
          onClick={closePay}
        >
          <X className="h-5 w-5" />
        </button>
      ) : null}

      <div className={cn("mx-auto max-w-md space-y-6", embedded ? "" : "pt-8")}>
        {isParent ? null : (
          <div className="text-center">
            <h1 className="text-xl font-semibold leading-snug">
              Daha iyi notlar al ve 2 kat hızlı öğren
            </h1>
            <p className="mt-2 text-sm text-[var(--astra-muted)]">
              Tüm özellikler açık; AI işlemleri kredi ve ücretsiz hak harcar. Plus
              aboneliği gelişmiş model ve yüksek kredi paketi sunar.
            </p>
          </div>
        )}

        {returnTo && !guestMode ? (
          <p className="rounded-xl border border-[var(--astra-border)] bg-[var(--astra-surface)] p-3 text-sm text-[var(--astra-muted)]">
            Ödeme sonrası kaldığın yere döneceksin.
          </p>
        ) : null}

        {plusOwned ? null : (
        <article className="astra-pay-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Plus className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Plus</h2>
              <div className="mt-3 flex rounded-full bg-[var(--astra-bg)] p-1 text-xs">
                <button
                  type="button"
                  className={cn(
                    "flex-1 rounded-full py-2 font-medium transition-colors",
                    yearly
                      ? "astra-nav-active text-white"
                      : "text-[var(--astra-muted)]",
                  )}
                  onClick={() => setYearly(true)}
                >
                  Yıllık · %58 tasarruf
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 rounded-full py-2 font-medium transition-colors",
                    !yearly
                      ? "astra-nav-active text-white"
                      : "text-[var(--astra-muted)]",
                  )}
                  onClick={() => setYearly(false)}
                >
                  Aylık
                </button>
              </div>
              <p className="mt-4 text-3xl font-bold">
                ₺{displayPlusMonthly().toLocaleString("tr-TR")}
                <span className="text-base font-normal text-[var(--astra-muted)]">
                  {" "}
                  / ay
                </span>
              </p>
              <p className="text-xs text-[var(--astra-muted)]">
                {yearly ? "yıllık faturalandırılır" : "aylık faturalandırılır"}
              </p>
              <button
                type="button"
                disabled={plusOwned || loadingId === plusPlan?.id}
                className="astra-btn-primary mt-4 w-full rounded-full py-3.5 text-sm font-semibold disabled:opacity-60"
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
                {plusOwned
                  ? "Bu çocukta Plus açık"
                  : loadingId === plusPlan?.id
                    ? "Hazırlanıyor…"
                    : isParent
                      ? "Çocuğum için Plus al"
                      : "Plus'a yükselt"}
              </button>
              {studentAskParent && plusPlan && !guestMode ? (
                <AskParentPaymentButton
                  planId={plusPlan.id}
                  planName={plusPlan.name}
                />
              ) : null}
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 text-sm text-[var(--astra-muted)]"
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
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--astra-muted)]">
                  {plusBenefits.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </article>
        )}

        {sigmaUnderFold && !otherPlansOpen ? (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--astra-border)] bg-[var(--astra-surface)] py-3.5 text-sm font-medium text-[var(--astra-muted)] transition-colors hover:border-[var(--astra-primary)]/40 hover:text-[var(--astra-text)]"
            onClick={() => setOtherPlansOpen(true)}
          >
            Diğer planlar · Sigma
            <ChevronDown className="h-4 w-4" />
          </button>
        ) : null}

        {showSigmaCard && sigmaPlan ? (
          <article className="astra-pay-card relative overflow-hidden p-5">
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
                    className="mb-2 flex items-center gap-1 text-xs text-[var(--astra-muted)]"
                    onClick={() => setOtherPlansOpen(false)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Diğer planları gizle
                  </button>
                ) : null}
                <h2 className="text-lg font-semibold">Sigma</h2>
                <p className="text-sm text-[var(--astra-muted)]">
                  Ciddi çalışma için
                </p>
                <p className="mt-4 text-3xl font-bold">
                  ₺{sigmaMonthly.toLocaleString("tr-TR")}
                  <span className="text-base font-normal text-[var(--astra-muted)]">
                    {" "}
                    / ay
                  </span>
                </p>
                <p className="text-xs text-[var(--astra-muted)]">
                  aylık faturalandırılır
                </p>
                <button
                  type="button"
                  disabled={sigmaOwned || loadingId === sigmaPlan.id}
                  className={cn(
                    "mt-4 w-full rounded-full py-3.5 text-sm font-semibold disabled:opacity-60",
                    sigmaUnderFold
                      ? "border border-[var(--astra-border)] bg-transparent text-[var(--astra-text)] hover:bg-[var(--astra-surface)]"
                      : "astra-btn-primary",
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
                    ? "Bu çocukta Sigma açık"
                    : loadingId === sigmaPlan.id
                      ? "Hazırlanıyor…"
                      : isParent
                        ? "Çocuğum için Sigma al"
                        : "Sigma'ya yükselt"}
                </button>
                <ul className="mt-3 space-y-1 text-xs text-[var(--astra-muted)]">
                  {sigmaBenefits.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
                {isParent ? null : studentAskParent && !guestMode ? (
                  <AskParentPaymentButton
                    planId={sigmaPlan.id}
                    planName={sigmaPlan.name}
                  />
                ) : sigmaUnderFold ? null : (
                  <Link
                    href="/destek"
                    className="mt-3 block text-center text-xs text-[var(--astra-primary)] underline underline-offset-2"
                  >
                    Ebeveynden ödeme iste
                  </Link>
                )}
              </div>
            </div>
          </article>
        ) : null}

        {rest.length > 0 ? (
          <div className="space-y-3">
            {rest.map((plan) => (
              <article
                key={plan.id}
                className="astra-pay-card flex items-center justify-between p-4"
              >
                <div>
                  <h3 className="font-medium">{plan.name}</h3>
                  <p className="text-sm text-[var(--astra-muted)]">
                    ₺{plan.price_try.toLocaleString("tr-TR")} · {plan.credit_amount}{" "}
                    kredi
                  </p>
                </div>
                <button
                  type="button"
                  className="astra-btn-primary rounded-full px-4 py-2 text-sm font-medium"
                  disabled={loadingId === plan.id}
                  onClick={() => startCheckout(plan.id)}
                >
                  Satın al
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
