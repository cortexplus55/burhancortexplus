"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/ozellikler", label: "Özellikler" },
  { href: "/sinav-hazirligi", label: "Sınav hazırlığı" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/yardim", label: "Yardım" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 font-semibold text-primary">
          Cortex Plus
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Ana menü">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/giris"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            Giriş
          </Link>
          <Link href="/kayit" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
            Kayıt ol
          </Link>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border md:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="site-mobile-nav"
          className="border-t bg-background px-4 py-3 md:hidden"
          aria-label="Mobil menü"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-[44px] items-center rounded-lg px-2 hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-2 border-t pt-3">
              <Link
                href="/giris"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                onClick={() => setOpen(false)}
              >
                Giriş
              </Link>
              <Link
                href="/kayit"
                className={cn(buttonVariants({ size: "sm" }), "flex-1")}
                onClick={() => setOpen(false)}
              >
                Kayıt ol
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
