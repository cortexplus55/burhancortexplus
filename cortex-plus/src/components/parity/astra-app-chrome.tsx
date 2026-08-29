"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import "@/styles/astra-app.css";
import "@/styles/cortex-premium.css";
import "@/styles/astra-sor.css";
import {
  Atom,
  Bell,
  BookOpen,
  Camera,
  CreditCard,
  FileText,
  Flame,
  Gamepad2,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutGrid,
  MessageCircle,
  Settings,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";
import { readStreakFromStorage } from "@/components/parity/astra-gamification";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { useEffect, useState } from "react";

export type AstraNavRole = "student";

type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: typeof MessageCircle;
  match: (path: string) => boolean;
};

const studentTabs: NavItem[] = [
  {
    id: "sor",
    href: "/ogretmen",
    label: "Sor",
    icon: MessageCircle,
    match: (p) => p === "/ogretmen" || p.startsWith("/ogretmen/"),
  },
  {
    id: "sinavlar",
    href: "/deneme-sinavlari",
    label: "Sınavlar",
    icon: Target,
    match: (p) => p.startsWith("/deneme-sinavlari"),
  },
  {
    id: "uygulamalar",
    href: "/uygulamalar",
    label: "Uygulamalar",
    icon: Atom,
    match: (p) => p === "/uygulamalar",
  },
];

const studentMenuGroups: {
  title: string;
  items: { href: string; label: string; icon: typeof MessageCircle }[];
}[] = [
  {
    title: "Çalış",
    items: [
      { href: "/ogretmen", label: "Yeni sohbet", icon: MessageCircle },
      { href: "/sohbetler", label: "Sohbetler", icon: History },
      { href: "/soru-coz", label: "Fotoğraftan çöz", icon: Camera },
      { href: "/dokumanlar", label: "Dokümanlar", icon: FileText },
      { href: "/quizler", label: "Quiz", icon: Gamepad2 },
      { href: "/flashcardlar", label: "Flashcard", icon: Layers },
      { href: "/calisma-plani", label: "Çalışma planı", icon: BookOpen },
      { href: "/ilerleme", label: "İlerleme", icon: Sparkles },
      { href: "/dashboard", label: "Panel", icon: LayoutGrid },
    ],
  },
  {
    title: "Sınav",
    items: [{ href: "/deneme-sinavlari", label: "Deneme sınavı", icon: Target }],
  },
  {
    title: "Hesap",
    items: [
      { href: "/krediler", label: "Krediler", icon: CreditCard },
      { href: "/pay", label: "Plus'a yükselt", icon: GraduationCap },
      { href: "/profil", label: "Profil", icon: User },
      { href: "/ayarlar", label: "Ayarlar", icon: Settings },
      { href: "/bildirimler", label: "Bildirimler", icon: Bell },
      { href: "/destek", label: "Yardım", icon: HelpCircle },
    ],
  },
];

export function AstraAppChrome({
  children,
  userInitial,
  avatarEmoji,
  streak = 0,
  pageTitle,
  account,
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  pageTitle?: string;
  /** @deprecated Yalnızca öğrenci; prop geriye dönük uyumluluk için kalır. */
  navRole?: AstraNavRole;
  account?: StudentAccountContext;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);

  const tabs = studentTabs;
  const activeTab = tabs.find((tab) => tab.match(pathname))?.id ?? null;
  const isSorScreen =
    pathname === "/ogretmen" || pathname.startsWith("/ogretmen/");
  const showBuyCta = !account?.isPremium;

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
    <div
      className={cn(
        "astra-app cortex-premium-app astra-sor-screen mx-auto flex min-h-dvh max-w-lg flex-col pb-24",
        isSorScreen && "astra-sor-screen--chat",
        account?.isPremium && "astra-sor-screen--plus",
      )}
    >
      <header className="astra-sor-header flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
              isSorScreen
                ? "astra-sor-pill"
                : "cortex-premium-glass-nav font-medium",
            )}
            aria-label="Seri"
          >
            <Flame className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
            {isSorScreen && streakCount > 0
              ? `${streakCount} gün`
              : streakCount}
          </button>
          {account && !isSorScreen ? (
            <Link
              href="/krediler"
              className="cortex-premium-glass-nav max-w-[100px] truncate rounded-full px-2.5 py-1.5 text-[11px] font-medium sm:max-w-[140px]"
            >
              {account.isPremium ? "Plus · " : ""}
              {account.balance} kr
            </Link>
          ) : null}
        </div>
        <div className="astra-sor-header-right">
          {showBuyCta ? (
            <Link
              href="/pay"
              className={cn(
                "cortex-premium-buy shrink-0",
                isSorScreen ? "astra-sor-buy text-[11px]" : "text-[11px]",
              )}
            >
              Satın al ✦
            </Link>
          ) : null}
          <Link
            href="/profil"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold uppercase text-[var(--astra-text)]",
              isSorScreen
                ? "astra-sor-avatar"
                : "border border-[var(--astra-border)] bg-[var(--astra-surface)]",
            )}
            aria-label="Profil"
          >
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

      <main
        className={cn(
          "flex flex-1 flex-col px-4 text-[var(--astra-text)] [&_.border]:border-[var(--astra-border)] [&_.bg-card]:bg-[var(--astra-surface)] [&_.bg-muted]:bg-[var(--astra-pill)] [&_.text-muted-foreground]:text-[var(--astra-muted)] [&_input]:border-[var(--astra-border)] [&_input]:bg-[var(--astra-bg)] [&_textarea]:border-[var(--astra-border)] [&_textarea]:bg-[var(--astra-bg)] [&_.rounded-lg.border]:border-[var(--cx-border,var(--astra-border))] [&_.rounded-lg.border]:bg-[var(--cx-surface-solid,var(--astra-surface))]",
          !isSorScreen && "astra-sor-page-main",
        )}
      >
        {pageTitle && !isSorScreen ? (
          <h1 className="astra-sor-greeting mb-5 text-left">{pageTitle}</h1>
        ) : null}
        {children}
      </main>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="astra-app w-full max-w-md rounded-3xl border border-[var(--astra-border)] bg-[var(--astra-bg)] p-5 shadow-xl cortex-premium-glass-nav"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Menü</h2>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--astra-muted)] hover:bg-[var(--astra-surface)]"
                aria-label="Kapat"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(70dvh,520px)] overflow-y-auto pr-1">
              <div className="space-y-5">
                {studentMenuGroups.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--astra-muted)]">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const plusLabel =
                          item.href === "/pay" && account?.isPremium
                            ? "Plus aktif"
                            : item.label;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="astra-pay-card astra-pay-card--premium flex flex-col items-center gap-2 p-3 text-center text-xs font-medium transition-colors hover:border-[var(--astra-primary)]"
                          >
                            <Icon className="h-6 w-6 text-[var(--astra-primary)]" />
                            {plusLabel}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <form action="/api/auth/signout" method="post" className="mt-4">
              <button
                type="submit"
                className="w-full rounded-full border border-[var(--astra-border)] py-2.5 text-sm text-[var(--astra-muted)]"
              >
                Çıkış yap
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <footer className="astra-sor-footer fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center gap-2 px-3 pb-4 pt-2">
        <nav
          className="astra-nav-bar flex flex-1 max-w-md items-center justify-around rounded-full px-1 py-1.5"
          aria-label="Ana menü"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-2 text-[11px] font-medium transition-colors",
                  isActive
                    ? "astra-nav-active text-white"
                    : "text-[var(--astra-muted)] hover:text-white",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={cn(
            "astra-nav-bar flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full",
            menuOpen && "astra-nav-active",
          )}
          aria-label="Menü"
          aria-expanded={menuOpen}
        >
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </button>
      </footer>
    </div>
  );
}
