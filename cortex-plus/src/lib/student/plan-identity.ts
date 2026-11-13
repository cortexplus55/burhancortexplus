import type { StudentAccountContext } from "@/lib/student/account-context";

/**
 * Profil kapsülünün ve panelinin plan kimliği (13 Kasım 2026, ürün sahibinin tasarım tahtası).
 *
 * Plan renk dışında da okunur: halka + köşe işareti + etiket. Kurucu Sigma görünümündedir, etiketi KURUCU.
 * Sınav Haftası (plus-haftalik) Plus görünümündedir; etiket kalan günle ("Plus · 5 gün"). Kalan gün,
 * ödeme kesinleşince yazılan aboneliğin dönem sonundan hesaplanır. Ücretsiz önizlemedeki kurucu ücretsiz görünür.
 */
export type PlanKind = "free" | "plus" | "week" | "sigma" | "founder";

export type PlanIdentity = {
  kind: PlanKind;
  /** Görünüm ailesi: halka, zemin ve etiket rengi. */
  look: "free" | "plus" | "sigma";
  /** Etiket (CSS ile büyük harf). */
  label: string;
  /** Köşe işareti. */
  mark: "+" | "Σ" | null;
  daysLeft: number | null;
  /** Kapsülün erişilebilir adı: planı söyler. */
  aria: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function planDaysLeft(periodEnd: string | null | undefined, now: Date = new Date()): number | null {
  if (!periodEnd) return null;
  const end = Date.parse(periodEnd);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
}

export function planIdentity(account: StudentAccountContext | undefined, now: Date = new Date()): PlanIdentity {
  if (account?.isAdmin) {
    return { kind: "founder", look: "sigma", label: "Kurucu", mark: "Σ", daysLeft: null, aria: "Profil, Kurucu" };
  }
  if (account?.isPremium) {
    if (account.subscriptionBadge === "Sigma") {
      return { kind: "sigma", look: "sigma", label: "Sigma", mark: "Σ", daysLeft: null, aria: "Profil, Sigma plan" };
    }
    if (account.planSlug === "plus-haftalik") {
      const days = planDaysLeft(account.subscriptionPeriodEnd, now);
      if (days !== null) {
        return {
          kind: "week",
          look: "plus",
          label: `Plus · ${days} gün`,
          mark: "+",
          daysLeft: days,
          aria: `Profil, Plus, ${days} gün kaldı`,
        };
      }
    }
    return { kind: "plus", look: "plus", label: "Plus", mark: "+", daysLeft: null, aria: "Profil, Plus plan" };
  }
  return { kind: "free", look: "free", label: "Ücretsiz", mark: null, daysLeft: null, aria: "Profil, Ücretsiz plan" };
}
