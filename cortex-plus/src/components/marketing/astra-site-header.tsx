"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/sinav-hazirligi", label: "Sınav hazırlığı" },
  { href: "/ozellikler", label: "Özellikler" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/yardim", label: "Yardım" },
];

export function AstraSiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="astra-marketing sticky top-0 z-40 border-b border-[var(--mk-border)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 font-semibold tracking-tight text-[var(--mk-text)]">
          Cortex Plus
        </Link>

        <nav
          className="hidden items-center gap-6 text-sm text-[var(--mk-muted)] md:flex"
          aria-label="Ana menü"
        >
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[var(--mk-text)]">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/fiyatlandirma"
            className="hidden items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 lg:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Plus
          </Link>
          <Link
            href="/giris"
            className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-[var(--mk-muted)] hover:text-[var(--mk-text)] sm:inline-flex"
          >
            Giriş yap
          </Link>
          <Link href="/kayit" className="mk-btn-primary hidden px-4 py-2 text-sm sm:inline-flex">
            Ücretsiz dene
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mk-border)] text-[var(--mk-text)] md:hidden"
            aria-expanded={open}
            aria-controls="astra-mobile-nav"
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="astra-mobile-nav"
          className="border-t border-[var(--mk-border)] bg-[var(--mk-bg)] px-4 py-3 md:hidden"
          aria-label="Mobil menü"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-[44px] items-center rounded-lg px-2 text-[var(--mk-text)] hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-[var(--mk-border)] pt-3">
              <Link
                href="/fiyatlandirma"
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-amber-300"
                onClick={() => setOpen(false)}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                Plus planları
              </Link>
            </li>
            <li className="mt-3 flex gap-2">
              <Link
                href="/giris"
                className={cn(
                  "flex flex-1 items-center justify-center rounded-full border border-[var(--mk-border)] py-2.5 text-sm font-medium text-[var(--mk-text)]",
                )}
                onClick={() => setOpen(false)}
              >
                Giriş yap
              </Link>
              <Link
                href="/kayit"
                className="mk-btn-primary flex flex-1 items-center justify-center py-2.5 text-sm"
                onClick={() => setOpen(false)}
              >
                Ücretsiz dene
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
