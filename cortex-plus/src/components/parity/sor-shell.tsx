"use client";

import { CortexMark } from "@/components/brand/cortex-mark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CalendarDays, Flame, Gift, Gauge, LayoutGrid, LineChart, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStreakFromStorage } from "@/components/parity/gamification";
import { GamificationGate } from "@/components/parity/gamification";
import { ParityDialogHost, MenuDialogUrlSync } from "@/components/parity/parity-dialog-host";
import { PlusLimitBanner } from "@/components/paywall/plus-limit-banner";
import { PromoBanner, type PromoCampaign } from "@/components/paywall/promo-banner";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { studentTopTabs, studentBottomTabs } from "@/components/parity/student-shell-nav";
import { formatNumber } from "@/lib/format";
import { ACCOUNT_REFRESH_EVENT, spendableCredits } from "@/lib/credits/spendable";
import "@/styles/parity-shell.css";

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

export function ParitySorShell({
  children,
  userInitial,
  avatarEmoji,
  streak = 0,
  account,
  promo = null,
  recentConversations = [],
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  account?: StudentAccountContext;
  promo?: PromoCampaign | null;
  recentConversations?: RecentConversation[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(ACCOUNT_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNT_REFRESH_EVENT, refresh);
  }, [router]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);
  const [limitDismissed, setLimitDismissed] = useState(false);
  const showBuy = !account?.isPremium;
  const isPremium = Boolean(account?.isPremium);
  const planLabel = account?.subscriptionBadge ?? "Plus";
  const showPlusLimit = isPremium && account && !account.canSpend && !limitDismissed;
  /**
   * Profil penceresindeki paket özeti — YALNIZCA ÜCRETSİZE.
   *
   * Referans üründe bu rozet bir bilgi değil, bir satış yüzeyi: ücretsiz hesapta
   * adın hemen altında "Temel / Ücretsiz plan" ve bir yükseltme düğmesi
   * duruyor. Abone hesapta o slot BOŞ — ad ve okuldan doğrudan davet
   * bloğuna geçiyor; paketini görmek isteyen Abonelikler'e giriyor.
   * Her iki katmanda da girilip doğrulandı.
   *
   * Parasını ödemiş kullanıcıya her açılışta paket hatırlatmak, satış
   * yapılacak kimse yokken yer kaplamaktan başka bir şey yapmıyor.
   */
  const planView =
    account && !account.isPremium
      ? {
          label: "Temel",
          hint: "Ücretsiz plan · günlük hak, " + account.resetsAtLabel + " yenilenir",
          isPremium: false,
        }
      : null;
  const isStudio = pathname.startsWith("/studio");

  const openMenuFromUrl = useCallback(() => setMenuOpen(true), []);

  useEffect(() => {
    if (account?.canSpend) setLimitDismissed(false);
  }, [account?.canSpend]);

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
      <div className={cn("cp-sor-root", isPremium && "cp-sor-root--plus", isStudio && "cp-sor-root--studio")}>
      <header className="cp-sor-top">
        <Link href="/dashboard" className="cp-sor-logo" aria-label="Cortex Plus Ana Sayfa">
          <CortexMark size={20} />
          <span className="cp-sor-logo-word">cortex</span>
          {isPremium ? (
            <span className="cp-sor-logo-badge">{planLabel}</span>
          ) : null}
        </Link>

        <nav className="cp-sor-topnav" aria-label="Ana bölümler">
          {studentTopTabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn("cp-sor-topnav-link", active && "cp-sor-topnav-link--active")}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="cp-sor-top-actions">
          {showBuy ? (
            <Link href="/pay" className="cp-sor-buy">
              Satın al +
            </Link>
          ) : account ? (
            <Link href="/krediler" className="cp-sor-credit-chip">
              {planLabel} · {formatNumber(spendableCredits(account))} kr
            </Link>
          ) : null}
          <button type="button" className="cp-sor-streak" aria-label="Seri">
            <Flame className="h-4 w-4 text-orange-500" aria-hidden />
            <span>{streakCount}</span>
          </button>
          <button
            type="button"
            className="cp-sor-more"
            aria-label="Daha fazla"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            <span>Daha fazla</span>
          </button>
          <Link href="/profil" className="cp-sor-avatar" aria-label="Profil">
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
            className="cp-sor-settings-link sr-only"
            aria-label="Ayarlar"
          >
            Ayarlar
          </Link>
        </div>
      </header>

      {showPlusLimit ? (
        <PlusLimitBanner onDismiss={() => setLimitDismissed(true)} />
      ) : null}

      {/* Kampanya bandı yalnızca ücretsiz katmanda: abone olana indirim
          duyurusu göstermek anlamsız. */}
      {promo && !isPremium ? <PromoBanner campaign={promo} /> : null}

      <main className="cp-sor-main">{children}</main>

      <nav className="cp-sor-bottomnav" aria-label="Ana gezinme">
        {studentBottomTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn("cp-sor-bottomnav-link", active && "cp-sor-bottomnav-link--active")}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {menuOpen ? (
        <div
          className="cp-sor-menu-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          onClick={closeMenu}
        >
          <div className="cp-sor-menu-panel cp-more-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cp-sor-menu-head">
              <h2 className="text-lg font-semibold">Daha fazla</h2>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--cp-muted)]"
                aria-label="Kapat"
                onClick={closeMenu}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="cp-more-actions">
              {MORE_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="cp-more-action">
                    <Icon className="h-6 w-6" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <Link href="/sohbetler" className="cp-more-history-head">
              Geçmiş konuşmalar <span aria-hidden>›</span>
            </Link>
            <div className="cp-more-history">
              {recentConversations.length ? (
                recentConversations.map((item) => (
                  <Link
                    key={item.id}
                    href={`/ogretmen?sohbet=${item.id}`}
                    className="cp-more-history-item"
                  >
                    <span>{item.title || "Yeni sohbet"}</span>
                    <em>{relativeTr(item.updatedAt)}</em>
                  </Link>
                ))
              ) : (
                <p className="cp-more-empty">Henüz sohbet yok</p>
              )}
            </div>
            <form action="/api/auth/signout" method="post" className="mt-4">
              <button type="submit" className="cp-sor-menu-signout">
                Çıkış yap
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ParityDialogHost onOpenMenu={openMenuFromUrl} plan={planView} />
      <Suspense fallback={null}>
        <MenuDialogUrlSync onOpen={openMenuFromUrl} />
      </Suspense>
      {isPremium ? <GamificationGate /> : null}
    </div>
    </StudentShellProvider>
  );
}
