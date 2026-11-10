"use client";

import { CortexMark } from "@/components/brand/cortex-mark";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKETING_AUTH, MARKETING_NAV } from "@/lib/parity/marketing-nav";

const navFocus =
  "rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mk-primary)]";

/**
 * Pazarlama sayfalarının üst menüsü.
 *
 * 11 Kasım 2026 (ürün sahibi: "logoyu daha öne çıkar; klasik tasarımın dışına çık, yenilikçi ve fütüristik"):
 * logo artık çubuğun içinde küçük bir simge değil, çubuktan taşan bir "çekirdek": 3B işaret, logonun renklerinde
 * yavaşça dönen bir halkanın içinde ve çubuğun alt kenarını aşar. Çubuğun alt çizgisi logonun şerididir (kehribar →
 * macenta → indigo → camgöbeği); üstünde logodan "Ücretsiz dene"ye doğru bir ışık akar. Sayfa kaydırılınca çekirdek
 * çubuğun içine toplanır. "Plus" yazısı aynı şeridin renklerini taşır.
 *
 * Menü her kaydırmada sabit kalır (`sticky`, cam zemin) ve "Ücretsiz dene" telefonda da görünür: ziyaretçi sayfanın
 * neresinde olursa olsun tek dokunuşla kayda gider. Hareket yalnız CSS'te; `prefers-reduced-motion`da durur.
 */
export function ParitySiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="cs-marketing mkh sticky top-0 z-50" data-scrolled={scrolled ? "true" : "false"} data-open={open ? "true" : "false"}>
      <div className="mkh-bar mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <Link
          href="/"
          aria-label="Cortex Plus ana sayfa"
          className={cn(
            "cp-tap flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-[var(--mk-text)]",
            "mkh-brand",
            navFocus,
          )}
        >
          <span className="mkh-core" aria-hidden>
            <span className="mkh-halo" />
            <CortexMark size={40} priority className="mkh-mark" />
          </span>
          <span className="mkh-word" aria-hidden>
            Cortex <span className="mkh-plus">Plus</span>
          </span>
        </Link>

        {/* Tam menü 1024 px ve üstünde (6 Kasım 2026): 768 px tablette öğeler iki satıra kırılıyordu. */}
        <nav
          className="hidden items-center gap-6 whitespace-nowrap text-sm text-[var(--mk-muted)] lg:flex"
          aria-label="Ana menü"
        >
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={cn("mkh-link hover:text-[var(--mk-text)]", navFocus)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/fiyatlandirma"
            className={cn(
              "hidden items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 xl:inline-flex",
              navFocus,
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Plus
          </Link>
          <Link
            href={MARKETING_AUTH.loginHref}
            className={cn(
              "hidden min-h-[44px] items-center whitespace-nowrap rounded-full px-3 text-sm font-medium text-[var(--mk-muted)] hover:text-[var(--mk-text)] sm:inline-flex",
              navFocus,
            )}
          >
            {MARKETING_AUTH.loginLabel}
          </Link>
          {/* Telefonda da görünür (11 Kasım 2026): kayıt her adımda tek dokunuş uzakta. */}
          <Link
            href={MARKETING_AUTH.signupHref}
            className={cn("mk-btn-primary mkh-cta inline-flex min-h-[44px] items-center whitespace-nowrap px-3.5 text-sm sm:px-4", navFocus)}
          >
            {MARKETING_AUTH.signupLabel}
          </Link>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--mk-border)] text-[var(--mk-text)] lg:hidden",
              navFocus,
            )}
            aria-expanded={open}
            aria-controls="cs-mobile-nav"
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Logonun şeridi: çubuğun alt çizgisi; üstünde logodan sağa doğru bir ışık akar. */}
      <span className="mkh-rail" aria-hidden>
        <span className="mkh-glint" />
      </span>

      {open ? (
        <nav
          id="cs-mobile-nav"
          className="border-t border-[var(--mk-border)] bg-[var(--mk-bg)] px-4 py-3 lg:hidden"
          aria-label="Mobil menü"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-[44px] items-center rounded-lg px-2 text-[var(--mk-text)] hover:bg-white/5",
                    navFocus,
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-[var(--mk-border)] pt-3">
              <Link
                href="/fiyatlandirma"
                className={cn(
                  "flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-amber-300",
                  navFocus,
                )}
                onClick={() => setOpen(false)}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Plus planları
              </Link>
            </li>
            <li className="mt-3 flex gap-2">
              <Link
                href={MARKETING_AUTH.loginHref}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-[var(--mk-border)] py-2.5 text-sm font-medium text-[var(--mk-text)]",
                  navFocus,
                )}
                onClick={() => setOpen(false)}
              >
                {MARKETING_AUTH.loginLabel}
              </Link>
              <Link
                href={MARKETING_AUTH.signupHref}
                className={cn(
                  "mk-btn-primary flex min-h-[44px] flex-1 items-center justify-center py-2.5 text-sm",
                  navFocus,
                )}
                onClick={() => setOpen(false)}
              >
                {MARKETING_AUTH.signupLabel}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
