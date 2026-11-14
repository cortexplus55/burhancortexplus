import { CortexMark } from "@/components/brand/cortex-mark";
import { AuthHeroRing, AuthLogo } from "@/components/layout/auth-brand";
import { Check } from "lucide-react";
import Link from "next/link";
import "@/styles/cortex-premium.css";

export function SignupPremiumShell({
  progress,
  stepLabel,
  headerStart,
  loginHref = "/giris",
  children,
}: {
  progress: number;
  stepLabel: string;
  headerStart: React.ReactNode;
  /** Kodlu bağlantıyla gelen hesap sahibi girişte de koda dönsün (`next` taşır). */
  loginHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cortex-premium-auth cortex-premium-signup min-h-dvh">
      <div
        className="signup-progress-track cortex-premium-signup__progress w-full"
        role="progressbar"
        aria-label={stepLabel || "Kayıt ilerlemesi"}
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
            <AuthHeroRing />
            <AuthLogo />
            <p className="cortex-premium-auth__brand flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--cpx-gold)]">
              <CortexMark size={20} />
              Cortex Plus
            </p>
            {/*
              Dekoratif yan panel — sayfanın `h1`'i sihirbazın o anki adımı
              (`signup-wizard.tsx`). İki `h1` bir arada olunca hem ekran
              okuyucu hem test hangisinin sayfa başlığı olduğunu bilemiyordu.
              İki ton (15 Kasım 2026): ilk satır ikincil gri, ikincisi beyaz; metin aynı.
            */}
            <p className="cortex-premium-auth__hero-title">
              <span className="cx-auth-tone">Dakikalar içinde</span>{" "}
              <span>kişisel AI öğretmenin</span>
            </p>
            <p className="cortex-premium-auth__hero-lead">
              Sınıfını ve hedefini söyle; notunu yükleyince ders, podcast, test ve
              sözlü pratik senin notundan hazırlanır.
            </p>
            <div className="cortex-premium-auth__badges">
              {["Ücretsiz başlangıç", "Kart istemiyoruz", "7/24 erişim"].map((badge) => (
                <span key={badge} className="cortex-premium-auth__badge">
                  <Check className="cx-auth-badge-icon" aria-hidden strokeWidth={3} />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </aside>
        <div className="cortex-premium-auth__panel flex min-h-0 flex-col">
          <header className="cortex-premium-signup__header flex items-center justify-between px-4 py-4 lg:px-8">
            <span className="cx-auth-head-start">
              {headerStart}
              {/* Yeni görünümde telefonda logo burada; geniş ekranda sol panelde. */}
              <AuthLogo className="cx-auth-logo--head" />
            </span>
            <span className="cx-auth-step text-xs text-[var(--cpx-muted)]">{stepLabel}</span>
          </header>
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 lg:px-8">
            {/* Yeni 3B logo (9 Kasım 2026): formun üstünde ortalanmış işaret. Yeni görünümde logo üstte, bu gizli. */}
            <div className="cx-auth-mark mb-4 flex justify-center">
              <CortexMark size={56} priority />
            </div>
            {children}
          </main>
          <p className="mx-auto mb-8 max-w-sm px-4 text-center text-xs text-[var(--cpx-muted)]">
            <Link href={loginHref} className="underline hover:text-[var(--cpx-text)]">
              Zaten hesabın var mı? Giriş yap
            </Link>
            {" · "}
            <Link href="/" className="underline hover:text-[var(--cpx-text)]">
              Ana sayfa
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
