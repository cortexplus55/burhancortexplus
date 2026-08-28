import Link from "next/link";
import "@/styles/cortex-premium.css";

export function SignupPremiumShell({
  progress,
  stepLabel,
  headerStart,
  children,
}: {
  progress: number;
  stepLabel: string;
  headerStart: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cortex-premium-auth cortex-premium-signup min-h-dvh">
      <div
        className="signup-progress-track cortex-premium-signup__progress w-full"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="signup-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="cortex-premium-auth__grid cortex-premium-signup__grid">
        <aside className="cortex-premium-auth__hero hidden lg:block">
          <div className="cortex-premium-auth__hero-inner">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--cx-gold)]">
              Cortex Plus
            </p>
            <h1 className="cortex-premium-auth__hero-title">
              Dakikalar içinde kişisel AI öğretmenin
            </h1>
            <p className="cortex-premium-auth__hero-lead">
              Rolünü seç, hedefini söyle — deneme analizi, soru çözümü ve çalışma
              planı aynı uygulamada.
            </p>
            <div className="cortex-premium-auth__badges">
              <span className="cortex-premium-auth__badge">Ücretsiz başlangıç</span>
              <span className="cortex-premium-auth__badge">Veli & öğretmen</span>
              <span className="cortex-premium-auth__badge">7/24 erişim</span>
            </div>
          </div>
        </aside>
        <div className="cortex-premium-auth__panel flex min-h-0 flex-col">
          <header className="cortex-premium-signup__header flex items-center justify-between px-4 py-4 lg:px-8">
            {headerStart}
            <span className="text-xs text-[var(--cx-muted)]">{stepLabel}</span>
          </header>
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 lg:px-8">
            {children}
          </main>
          <p className="mx-auto mb-8 max-w-sm px-4 text-center text-xs text-[var(--cx-muted)]">
            <Link href="/giris" className="underline hover:text-[var(--cx-text)]">
              Zaten hesabın var mı? Giriş yap
            </Link>
            {" · "}
            <Link href="/" className="underline hover:text-[var(--cx-text)]">
              Ana sayfa
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
