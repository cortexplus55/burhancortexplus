"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Flame, LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStreakFromStorage } from "@/components/parity/astra-gamification";
import type { StudentAccountContext } from "@/lib/student/account-context";
import {
  studentMenuGroups,
  studentTopTabs,
} from "@/components/parity/student-shell-nav";
import "@/styles/astra-parity-sor.css";

export function AstraParitySorShell({
  children,
  userInitial,
  avatarEmoji,
  streak = 0,
  account,
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  account?: StudentAccountContext;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);
  const showBuy = !account?.isPremium;

  useEffect(() => {
    setStreakCount(readStreakFromStorage() || streak);
  }, [streak]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="ap-sor-root">
      <header className="ap-sor-top">
        <Link href="/ogretmen" className="ap-sor-logo" aria-label="Cortex Plus">
          <span className="ap-sor-logo-word">cortex</span>
          <span className="ap-sor-logo-badge">Plus</span>
        </Link>

        <nav className="ap-sor-topnav" aria-label="Ana bölümler">
          {studentTopTabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn("ap-sor-topnav-link", active && "ap-sor-topnav-link--active")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="ap-sor-top-actions">
          {showBuy ? (
            <Link href="/pay" className="ap-sor-buy">
              Satın al +
            </Link>
          ) : null}
          <button type="button" className="ap-sor-streak" aria-label="Seri">
            <Flame className="h-4 w-4 text-orange-500" aria-hidden />
            <span>{streakCount}</span>
          </button>
          <button
            type="button"
            className="ap-sor-more"
            aria-label="Daha fazla"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            <span>Daha fazla</span>
          </button>
          <Link href="/profil" className="ap-sor-avatar" aria-label="Profil">
            {avatarEmoji ? (
              <span className="text-lg" aria-hidden>
                {avatarEmoji}
              </span>
            ) : (
              (userInitial?.slice(0, 1) ?? "?")
            )}
          </Link>
        </div>
      </header>

      <main className="ap-sor-main">{children}</main>

      {menuOpen ? (
        <div
          className="ap-sor-menu-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          onClick={() => setMenuOpen(false)}
        >
          <div className="ap-sor-menu-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ap-sor-menu-head">
              <h2 className="text-lg font-semibold">Menü</h2>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--ap-muted)]"
                aria-label="Kapat"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ap-sor-menu-scroll">
              {studentMenuGroups.map((group) => (
                <div key={group.title} className="mb-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ap-muted)]">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const label =
                        item.href === "/pay" && account?.isPremium
                          ? "Plus aktif"
                          : item.label;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="ap-sor-menu-tile"
                        >
                          <Icon className="h-6 w-6" aria-hidden />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <form action="/api/auth/signout" method="post" className="mt-4">
              <button type="submit" className="ap-sor-menu-signout">
                Çıkış yap
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
