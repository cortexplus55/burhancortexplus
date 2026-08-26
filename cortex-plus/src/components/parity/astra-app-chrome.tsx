"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import "@/styles/astra-app.css";
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
  HeartHandshake,
  HelpCircle,
  History,
  Layers,
  LayoutGrid,
  MessageCircle,
  Settings,
  Sparkles,
  Target,
  User,
  Users,
  X,
} from "lucide-react";
import { readStreakFromStorage } from "@/components/parity/astra-gamification";
import { useEffect, useState } from "react";

export type AstraNavRole = "student" | "parent";

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

const parentTabs: NavItem[] = [
  {
    id: "cocuklarim",
    href: "/veli",
    label: "Çocuklarım",
    icon: Users,
    match: (p) => p === "/veli",
  },
  {
    id: "destek",
    href: "/veli/sor",
    label: "Destek",
    icon: HeartHandshake,
    match: (p) => p.startsWith("/veli/sor"),
  },
  {
    id: "plus",
    href: "/veli/plus",
    label: "Plus",
    icon: GraduationCap,
    match: (p) => p.startsWith("/veli/plus"),
  },
];

const studentMenu: { href: string; label: string; icon: typeof MessageCircle }[] =
  [
    { href: "/ogretmen", label: "Yeni sohbet", icon: MessageCircle },
    { href: "/sohbetler", label: "Sohbetler", icon: History },
    { href: "/soru-coz", label: "Fotoğraftan çöz", icon: Camera },
    { href: "/dokumanlar", label: "Dokümanlar", icon: FileText },
    { href: "/quizler", label: "Quiz", icon: Gamepad2 },
    { href: "/flashcardlar", label: "Flashcard", icon: Layers },
    { href: "/deneme-sinavlari", label: "Deneme sınavı", icon: Target },
    { href: "/calisma-plani", label: "Çalışma planı", icon: BookOpen },
    { href: "/ilerleme", label: "İlerleme", icon: Sparkles },
    { href: "/krediler", label: "Krediler", icon: CreditCard },
    { href: "/paketler", label: "Plus'a yükselt", icon: GraduationCap },
    { href: "/profil", label: "Profil", icon: User },
    { href: "/ayarlar", label: "Ayarlar", icon: Settings },
    { href: "/bildirimler", label: "Bildirimler", icon: Bell },
    { href: "/destek", label: "Yardım", icon: HelpCircle },
    { href: "/dashboard", label: "Panel", icon: LayoutGrid },
  ];

const parentMenu: { href: string; label: string; icon: typeof MessageCircle }[] =
  [
    { href: "/veli", label: "Çocuklarım", icon: Users },
    { href: "/veli/sor", label: "Veli desteği", icon: HeartHandshake },
    { href: "/veli/plus", label: "Plus", icon: GraduationCap },
    { href: "/odemeler", label: "Ödemeler", icon: CreditCard },
    { href: "/profil", label: "Profil", icon: User },
    { href: "/ayarlar", label: "Ayarlar", icon: Settings },
    { href: "/bildirimler", label: "Bildirimler", icon: Bell },
    { href: "/destek", label: "Yardım", icon: HelpCircle },
  ];

export function AstraAppChrome({
  children,
  userInitial,
  avatarEmoji,
  streak = 0,
  pageTitle,
  navRole = "student",
}: {
  children: React.ReactNode;
  userInitial?: string;
  avatarEmoji?: string | null;
  streak?: number;
  pageTitle?: string;
  navRole?: AstraNavRole;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);

  const tabs = navRole === "parent" ? parentTabs : studentTabs;
  const menu = navRole === "parent" ? parentMenu : studentMenu;
  const activeTab = tabs.find((tab) => tab.match(pathname))?.id ?? null;

  useEffect(() => {
    if (navRole !== "student") return;
    setStreakCount(readStreakFromStorage() || streak);
  }, [streak, navRole]);

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
    <div className="astra-app mx-auto flex min-h-dvh max-w-lg flex-col pb-28 md:max-w-2xl lg:max-w-3xl">
      <header className="flex items-center justify-between px-4 py-3">
        {navRole === "student" ? (
          <button
            type="button"
            className="astra-nav-bar flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
            aria-label="Seri"
          >
            <Flame className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
            {streakCount}
          </button>
        ) : (
          <Link href="/veli" className="text-sm font-semibold">
            Cortex Plus
          </Link>
        )}
        {pageTitle ? (
          <p className="astra-page-title truncate px-2 text-sm">
            {pageTitle}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <Link
          href="/profil"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-800/90 text-sm font-semibold uppercase text-white"
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
      </header>

      <main className="flex flex-1 flex-col px-4 text-[var(--astra-text)] [&_.border]:border-[var(--astra-border)] [&_.bg-card]:bg-[var(--astra-surface)] [&_.bg-muted]:bg-[var(--astra-pill)] [&_.text-muted-foreground]:text-[var(--astra-muted)] [&_input]:border-[var(--astra-border)] [&_input]:bg-[var(--astra-bg)] [&_textarea]:border-[var(--astra-border)] [&_textarea]:bg-[var(--astra-bg)]">
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
            className="astra-app w-full max-w-md rounded-3xl border border-[var(--astra-border)] bg-[var(--astra-bg)] p-5 shadow-xl"
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
            <div className="grid grid-cols-3 gap-3">
              {menu.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="astra-pay-card flex flex-col items-center gap-2 p-3 text-center text-xs font-medium transition-colors hover:border-[var(--astra-primary)]"
                  >
                    <Icon className="h-6 w-6 text-[var(--astra-primary)]" />
                    {item.label}
                  </Link>
                );
              })}
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

      <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-center gap-2 px-3 pb-4 pt-2">
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

export function astraGreetingName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return "Merhaba";
  return fullName.trim().split(/\s+/)[0] ?? "Merhaba";
}

export function astraTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

export function astraUserInitial(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const first = astraGreetingName(fullName ?? email);
  return first.slice(0, 1).toUpperCase() || "?";
}
