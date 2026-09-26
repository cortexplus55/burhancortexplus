"use client";

import { CortexMark } from "@/components/brand/cortex-mark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Flame, Gift, Gauge, LayoutGrid, LineChart, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStreakFromStorage } from "@/components/parity/gamification";
import { GamificationGate } from "@/components/parity/gamification";
import { ParityDialogHost, MenuDialogUrlSync } from "@/components/parity/parity-dialog-host";
import { PlusLimitBanner } from "@/components/paywall/plus-limit-banner";
import { PromoBanner, type PromoCampaign } from "@/components/paywall/promo-banner";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { studentTopTabs, studentBottomTabs } from "@/components/parity/student-shell-nav";
import { ACCOUNT_REFRESH_EVENT, spendableCredits } from "@/lib/credits/spendable";
import { creditChipLabel } from "@/lib/credits/chip-label";
import { FounderChip } from "@/components/student/founder-chip";
import { profilePlanView } from "@/lib/billing/tier-presentation";
import { ExamChatMenu } from "@/components/parity/exam-chat-menu";
import type { RecentConversation } from "@/lib/student/conversation-time";
import "@/styles/parity-shell.css";

export type { RecentConversation };

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
  chrome = "app",
  backHref = "/deneme-sinavlari",
  conversationBaseHref,
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  account?: StudentAccountContext;
  promo?: PromoCampaign | null;
  recentConversations?: RecentConversation[];
  /**
   * Sınav sohbeti: logo ve sekme çubuğu yerine geri, seri, menü ve avatar.
   * Diğer sayfalar `app` kabuğunda kalır.
   */
  chrome?: "app" | "exam";
  backHref?: string;
  /**
   * Geçmiş satırı bu adresin `?sohbet=` parametresiyle açılır.
   * Verilmezse genel öğretmen sohbetine gider.
   */
  conversationBaseHref?: string;
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
  const [balance, setBalance] = useState(account?.balance ?? 0);
  useEffect(() => {
    if (typeof account?.balance !== "number") return;
    try {
      const raw = sessionStorage.getItem("cortex-balance-announced");
      if (raw) {
        const saved = JSON.parse(raw) as { value?: number; at?: number };
        if (
          typeof saved.value === "number" &&
          typeof saved.at === "number" &&
          Date.now() - saved.at < 20_000 &&
          saved.value < account.balance
        ) {
          setBalance(saved.value);
          return;
        }
      }
    } catch {
      /* eski duyuru okunamazsa sunucu bakiyesi geçer */
    }
    setBalance(account.balance);
  }, [account?.balance]);
  useEffect(() => {
    const onBalance = (event: Event) => {
      const value = (event as CustomEvent<number>).detail;
      if (typeof value !== "number") return;
      setBalance(value);
      try {
        sessionStorage.setItem(
          "cortex-balance-announced",
          JSON.stringify({ value, at: Date.now() }),
        );
      } catch {
        /* depolama kapalıysa çip yine bu oturumda güncellenir */
      }
    };
    window.addEventListener("cortex-balance", onBalance);
    return () => window.removeEventListener("cortex-balance", onBalance);
  }, []);
  const isAdmin = Boolean(account?.isAdmin);
  const isPremium = Boolean(account?.isPremium);
  const showBuy = !isAdmin && account?.showsUpgradeChrome === true;
  const planLabel = account?.subscriptionBadge ?? "Plus";
  const showPlusLimit =
    !isAdmin && isPremium && Boolean(account) && !account?.canSpend && !limitDismissed;
  /**
   * Profil plan satırı kitleye göre: ücretsiz Temel + yükseltme, Plus/Sigma
   * rozet + dönem + ek paket. Metin `profilePlanView` tek kaynağından gelir.
   */
  const planView = account && !isAdmin ? profilePlanView(account) : null;
  const isStudio = pathname.startsWith("/studio");
  const examChrome = chrome === "exam";
  const openConversation = (id: string) =>
    conversationBaseHref
      ? `${conversationBaseHref}?sohbet=${encodeURIComponent(id)}`
      : `/ogretmen?sohbet=${encodeURIComponent(id)}`;

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
      <div className={cn("cp-sor-root", isPremium && "cp-sor-root--plus", isStudio && "cp-sor-root--studio", examChrome && "cp-sor-root--exam")}>
      <header className="cp-sor-top">
        {examChrome ? (
          <Link href={backHref} className="cp-exam-back">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Geri
          </Link>
        ) : (
          <>
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
          </>
        )}

        <div className="cp-sor-top-actions">
          {examChrome ? null : isAdmin && account ? (
            <FounderChip />
          ) : showBuy ? (
            <Link href="/pay" className="cp-sor-buy">
              Satın al +
            </Link>
          ) : account ? (
            <Link
              href="/krediler"
              className="cp-sor-credit-chip"
              title={`Satın alınan: ${account.balance} · Bu dönem kalan hak: ${account.freeAllowanceRemaining}`}
              aria-label={`Satın alınan: ${account.balance} · Bu dönem kalan hak: ${account.freeAllowanceRemaining}`}
            >
              {creditChipLabel({
                planLabel,
                balance: spendableCredits({
                  balance,
                  freeAllowanceRemaining: account.freeAllowanceRemaining,
                }),
              })}
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
      {promo && showBuy && !examChrome ? <PromoBanner campaign={promo} /> : null}

      <main className="cp-sor-main">{children}</main>

      {examChrome ? null : <nav className="cp-sor-bottomnav" aria-label="Ana gezinme">
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
      </nav>}

      {menuOpen && examChrome ? (
        <ExamChatMenu
          conversations={recentConversations}
          conversationHref={openConversation}
          onClose={closeMenu}
        />
      ) : null}

      {menuOpen && !examChrome ? (
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
