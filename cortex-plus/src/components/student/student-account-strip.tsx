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
      className={`astra-pay-card cortex-premium-account-strip mb-4 rounded-2xl border px-4 py-3 text-sm ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {account.isPremium ? (
            <span className="rounded-full bg-[var(--astra-primary)]/20 px-2.5 py-0.5 text-xs font-semibold text-[var(--astra-primary)]">
              Plus
            </span>
          ) : (
            <span className="text-xs text-[var(--astra-muted)]">Ücretsiz plan</span>
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
            className="text-xs font-semibold text-[var(--astra-primary)]"
          >
            Kredi al
          </Link>
        ) : low ? (
          <Link
            href="/paketler"
            className="text-xs text-[var(--astra-muted)] hover:text-[var(--astra-primary)]"
          >
            Kredi yükle
          </Link>
        ) : null}
      </div>
      {creditHint ? (
        <p className="mt-1.5 text-xs text-[var(--astra-muted)]">{creditHint}</p>
      ) : null}
      {!account.canSpend ? (
        <p className="mt-1.5 text-xs text-amber-200/90">
          Yeni AI işlemi için kredi veya ücretsiz hak gerekir. Mevcut içeriklerin
          korunur.
        </p>
      ) : account.isPremium ? (
        <p className="mt-1.5 text-xs text-[var(--astra-muted)]">
          Plus ile gelişmiş model kullanılır; işlemler yine kredi harcar.
        </p>
      ) : null}
    </div>
  );
}
