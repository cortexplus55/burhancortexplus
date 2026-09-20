"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MARKETING_AUTH, MARKETING_NAV } from "@/lib/parity/marketing-nav";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 font-semibold text-primary">
          Cortex Plus
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Ana menÃ¼">
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={MARKETING_AUTH.loginHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
          >
            {MARKETING_AUTH.loginLabel}
          </Link>
          <Link
            href={MARKETING_AUTH.signupHref}
            className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
          >
            {MARKETING_AUTH.signupLabel}
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md border md:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? "MenÃ¼yÃ¼ kapat" : "MenÃ¼yÃ¼ aÃ§"}
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
          aria-label="Mobil menÃ¼"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {MARKETING_NAV.map((item) => (
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
                href={MARKETING_AUTH.loginHref}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                onClick={() => setOpen(false)}
              >
                {MARKETING_AUTH.loginLabel}
              </Link>
              <Link
                href={MARKETING_AUTH.signupHref}
                className={cn(buttonVariants({ size: "sm" }), "flex-1")}
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
