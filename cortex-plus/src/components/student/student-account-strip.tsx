import Link from "next/link";
import type { StudentAccountContext } from "@/lib/student/account-context";

export function StudentAccountStrip({
  account,
  creditHint,
  className,
}: {
  account: StudentAccountContext;
  creditHint?: string;
  className?: string;
}) {
  const low =
    !account.canSpend ||
    (account.balance < 5 && account.freeAllowanceRemaining < 3);

  return (
    <div
      className={`cs-pay-card cortex-premium-account-strip mb-4 rounded-2xl border px-4 py-3 text-sm ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {account.isPremium ? (
            <span className="rounded-full bg-[var(--cs-primary)]/20 px-2.5 py-0.5 text-xs font-semibold text-[var(--cs-primary)]">
              {account.subscriptionBadge ?? "Plus"}
            </span>
          ) : (
            <span className="text-xs text-[var(--cs-muted)]">Ücretsiz plan</span>
          )}
          <Link
            href="/krediler"
            className="font-medium underline-offset-2 hover:underline"
          >
            {account.balance} kredi · {account.freeAllowanceRemaining} ücretsiz hak
          </Link>
        </div>
        {!account.canSpend ? (
          <Link
            href="/paketler"
            className="text-xs font-semibold text-[var(--cs-primary)]"
          >
            {account.showsUpgradeChrome ? "Kullanımını artır" : "Ek paket"}
          </Link>
        ) : low ? (
          <Link
            href="/paketler"
            className="text-xs text-[var(--cs-muted)] hover:text-[var(--cs-primary)]"
          >
            {account.showsUpgradeChrome ? "Kullanımını artır" : "Ek paket"}
          </Link>
        ) : null}
      </div>
      {creditHint ? (
        <p className="mt-1.5 text-xs text-[var(--cs-muted)]">{creditHint}</p>
      ) : null}
      {!account.canSpend ? (
        <p className="mt-1.5 text-xs text-amber-200/90">
          Yeni AI işlemi için kredi veya ücretsiz hak gerekir. Mevcut içeriklerin
          korunur.
        </p>
      ) : account.audience === "sigma" ? (
        <p className="mt-1.5 text-xs text-[var(--cs-muted)]">
          Sigma ile gelişmiş model kullanılır; işlemler yine kredi harcar.
        </p>
      ) : account.isPremium ? (
        <p className="mt-1.5 text-xs text-[var(--cs-muted)]">
          Aylık kotan açık; işlemler kredi harcar.
        </p>
      ) : null}
    </div>
  );
}
