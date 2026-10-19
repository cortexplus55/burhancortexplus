import Link from "next/link";
import { cn } from "@/lib/utils";
import "@/styles/parity-marketing.css";
import "@/styles/cinematic-home.css";
import { ParitySiteHeader } from "@/components/marketing/parity-site-header";
import { MARKETING_NAV } from "@/lib/parity/marketing-nav";
import { CinematicPageHero } from "@/components/marketing/cinematic-page-hero";
import { CinematicScrollReveal } from "@/components/marketing/cinematic-scroll-reveal";


export { ParitySiteHeader } from "@/components/marketing/parity-site-header";

export function ParitySiteFooter() {
  return (
    <footer className="cs-marketing border-t border-[var(--mk-border)] py-12 text-sm text-[var(--mk-muted)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
        <div>
          <p className="font-semibold text-[var(--mk-text)]">Cortex Plus</p>
          <p className="mt-2">Çalışma ve sınav hazırlığı için AI öğretmen.</p>
        </div>
        <div className="mk-footer-links flex flex-col gap-2">
          <Link href="/ornek">Nasıl çalışır</Link>
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mk-footer-links flex flex-col gap-2">
          <Link href="/gizlilik">Gizlilik</Link>
          <Link href="/kvkk">KVKK</Link>
          <Link href="/kullanim-kosullari">Kullanım koşulları</Link>
          {/* Mesafeli satışta bu dördü sitede erişilebilir olmak zorunda. */}
          <Link href="/mesafeli-satis">Mesafeli satış sözleşmesi</Link>
          <Link href="/on-bilgilendirme">Ön bilgilendirme formu</Link>
          <Link href="/iptal-iade">İptal ve iade</Link>
          <Link href="/teslimat">Teslimat</Link>
        </div>
        <div className="mk-footer-links flex flex-col gap-2">
          <Link href="/iletisim">Bize ulaşın</Link>
          <Link href="/kunye">Künye</Link>
        </div>
      </div>
    </footer>
  );
}

export function ParityMarketingPage({
  children,
  title,
  description,
  className,
  variant = "marketing",
}: {
  children?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  variant?: "marketing" | "auth" | "legal" | "home";
}) {
  const shellClass = cn(
    "cs-marketing cinematic-marketing flex min-h-screen flex-col",
    variant === "home" && "cinematic-home",
    variant === "auth" && "cinematic-auth",
    className,
  );

  return (
    <div className={shellClass}>
      <ParitySiteHeader />
      <CinematicScrollReveal>
        <main className="min-w-0 flex-1">
          {title && variant === "marketing" ? (
            <CinematicPageHero title={title} description={description} />
          ) : null}
          {variant === "auth" ? (
            <div className="mk-auth-stack">
              {title ? (
                <div className="mb-6 text-center" data-cinematic-reveal>
                  <h1 className="mk-display text-3xl">{title}</h1>
                  {description ? (
                    <p className="mt-2 text-sm text-[var(--mk-muted)]">
                      {description}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {children}
            </div>
          ) : variant === "legal" ? (
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-10" data-cinematic-reveal>
              <h1 className="mk-display text-3xl md:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-2xl text-[var(--mk-muted)]">
                  {description}
                </p>
              ) : null}
              <div className="mt-8">{children}</div>
            </div>
          ) : (
            children
          )}
        </main>
      </CinematicScrollReveal>
      <ParitySiteFooter />
    </div>
  );
}
