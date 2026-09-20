"use client";

import { CortexMark } from "@/components/brand/cortex-mark";
import { useState } from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKETING_AUTH, MARKETING_NAV } from "@/lib/parity/marketing-nav";

const navFocus =
  "rounded-md outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mk-primary)]";

export function ParitySiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="cs-marketing sticky top-0 z-40 border-b border-[var(--mk-border)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className={cn(
            "flex shrink-0 items-center gap-2 font-semibold tracking-tight text-[var(--mk-text)]",
            navFocus,
          )}
        >
          <CortexMark size={22} />
          Cortex Plus
        </Link>

        <nav
          className="hidden items-center gap-6 text-sm text-[var(--mk-muted)] md:flex"
          aria-label="Ana menÃ¼"
        >
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("hover:text-[var(--mk-text)]", navFocus)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/fiyatlandirma"
            className={cn(
              "hidden items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 lg:inline-flex",
              navFocus,
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Plus
          </Link>
          <Link
            href={MARKETING_AUTH.loginHref}
            className={cn(
              "hidden rounded-full px-3 py-1.5 text-sm font-medium text-[var(--mk-muted)] hover:text-[var(--mk-text)] sm:inline-flex",
              navFocus,
            )}
          >
            {MARKETING_AUTH.loginLabel}
          </Link>
          <Link
            href={MARKETING_AUTH.signupHref}
            className={cn("mk-btn-primary hidden min-h-[44px] items-center px-4 py-2.5 text-sm sm:inline-flex", navFocus)}
          >
            {MARKETING_AUTH.signupLabel}
          </Link>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--mk-border)] text-[var(--mk-text)] md:hidden",
              navFocus,
            )}
            aria-expanded={open}
            aria-controls="cs-mobile-nav"
            aria-label={open ? "MenÃ¼yÃ¼ kapat" : "MenÃ¼yÃ¼ aÃ§"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="cs-mobile-nav"
          className="border-t border-[var(--mk-border)] bg-[var(--mk-bg)] px-4 py-3 md:hidden"
          aria-label="Mobil menÃ¼"
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
                Plus planlarÄ±
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
