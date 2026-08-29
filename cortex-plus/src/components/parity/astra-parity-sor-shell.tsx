"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CalendarDays, Flame, Gift, Gauge, LayoutGrid, LineChart, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStreakFromStorage } from "@/components/parity/astra-gamification";
import { AstraGamificationGate } from "@/components/parity/astra-gamification";
import { ParityDialogHost, MenuDialogUrlSync } from "@/components/parity/parity-dialog-host";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { studentTopTabs } from "@/components/parity/student-shell-nav";
import { formatNumber } from "@/lib/format";
import "@/styles/astra-parity-sor.css";

export type RecentConversation = {
  id: string;
  title: string;
  updatedAt: string;
};

function relativeTr(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dakika önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

const MORE_LINKS = [
  { href: "/siniflar", label: "Sınıflar", icon: Users },
  { href: "/ilerleme", label: "Aktivitelerim", icon: LineChart },
  { href: "/calisma-plani?tab=takvim", label: "Takvimim", icon: CalendarDays },
  { href: "/krediler", label: "Limitler", icon: Gauge },
  { href: "/davet", label: "Davet et", icon: Gift },
] as const;

export function AstraParitySorShell({
  children,
  userInitial,
  avatarEmoji,
  streak = 0,
  account,
  recentConversations = [],
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  account?: StudentAccountContext;
  recentConversations?: RecentConversation[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);
  const showBuy = !account?.isPremium;
  const isPremium = Boolean(account?.isPremium);

  const openMenuFromUrl = useCallback(() => setMenuOpen(true), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/streak")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const days = Number(data?.streak ?? 0);
        if (days > 0) {
          setStreakCount(days);
          try {
            localStorage.setItem("cortex-streak-days", String(days));
          } catch {
            /* ignore */
          }
        } else {
          setStreakCount(readStreakFromStorage() || streak);
        }
      })
      .catch(() => {
        setStreakCount(readStreakFromStorage() || streak);
      });
    return () => {
      cancelled = true;
    };
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

  function closeMenu() {
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("dialog") === "menu") {
        params.delete("dialog");
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }
    }
  }

  return (
    <StudentShellProvider account={account}>
      <div className={cn("ap-sor-root", isPremium && "ap-sor-root--plus")}>
      <header className="ap-sor-top">
        <Link href="/ogretmen" className="ap-sor-logo" aria-label="Cortex Plus">
          <span className="ap-sor-logo-word">cortex</span>
          {isPremium ? (
            <span className="ap-sor-logo-badge">Plus</span>
          ) : null}
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
          ) : account ? (
            <Link href="/krediler" className="ap-sor-credit-chip">
              Plus · {formatNumber(account.balance)} kr
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
          <Link
            href="/ogretmen?dialog=profile"
            className="ap-sor-settings-link sr-only"
            aria-label="Ayarlar"
          >
            Ayarlar
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
          onClick={closeMenu}
        >
          <div className="ap-sor-menu-panel ap-more-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ap-sor-menu-head">
              <h2 className="text-lg font-semibold">Daha fazla</h2>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--ap-muted)]"
                aria-label="Kapat"
                onClick={closeMenu}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ap-more-actions">
              {MORE_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="ap-more-action">
                    <Icon className="h-6 w-6" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <Link href="/sohbetler" className="ap-more-history-head">
              Geçmiş konuşmalar <span aria-hidden>›</span>
            </Link>
            <div className="ap-more-history">
              {recentConversations.length ? (
                recentConversations.map((item) => (
                  <Link
                    key={item.id}
                    href={`/ogretmen?sohbet=${item.id}`}
                    className="ap-more-history-item"
                  >
                    <span>{item.title || "Yeni sohbet"}</span>
                    <em>{relativeTr(item.updatedAt)}</em>
                  </Link>
                ))
              ) : (
                <p className="ap-more-empty">Henüz sohbet yok</p>
              )}
            </div>
            <form action="/api/auth/signout" method="post" className="mt-4">
              <button type="submit" className="ap-sor-menu-signout">
                Çıkış yap
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ParityDialogHost onOpenMenu={openMenuFromUrl} />
      <Suspense fallback={null}>
        <MenuDialogUrlSync onOpen={openMenuFromUrl} />
      </Suspense>
      {isPremium ? <AstraGamificationGate /> : null}
    </div>
    </StudentShellProvider>
  );
}
