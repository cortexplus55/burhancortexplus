import Link from "next/link";
import "@/styles/cortex-premium.css";

export function PremiumAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cortex-premium-auth">
      <div className="cortex-premium-auth__grid">
        <aside className="cortex-premium-auth__hero" aria-hidden={false}>
          <div className="cortex-premium-auth__hero-inner">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--cx-gold)]">
              Cortex Plus
            </p>
            <h1 className="cortex-premium-auth__hero-title">
              Sınav hazırlığında 2 kat hızlı öğren
            </h1>
            <p className="cortex-premium-auth__hero-lead">
              Kişisel AI öğretmenin, deneme analizi ve çalışma planı — tek uygulamada,
              7/24.
            </p>
            <div className="cortex-premium-auth__badges">
              <span className="cortex-premium-auth__badge">Adım adım çözüm</span>
              <span className="cortex-premium-auth__badge">Tüm dersler</span>
              <span className="cortex-premium-auth__badge">Mobil + web</span>
            </div>
          </div>
        </aside>
        <div className="cortex-premium-auth__panel">
          <div className="cortex-premium-auth__topbar">
            <Link href="/" className="cortex-premium-auth__logo">
              Cortex Plus
            </Link>
            <Link
              href="/kayit"
              className="text-sm font-medium text-[var(--cx-gold-hover)] hover:underline"
            >
              Ücretsiz dene
            </Link>
          </div>
          <div className="cortex-premium-auth__card">
            <h2 className="cortex-premium-auth__title">{title}</h2>
            {subtitle ? (
              <p className="cortex-premium-auth__subtitle">{subtitle}</p>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
          <p className="mx-auto mt-8 max-w-sm text-center text-xs text-[var(--cx-muted)]">
            <Link href="/" className="underline hover:text-[var(--cx-text)]">
              Ana sayfaya dön
            </Link>
            {" · "}
            <Link href="/yardim" className="underline hover:text-[var(--cx-text)]">
              Yardım
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
