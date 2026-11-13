"use client";

import { syncLearningPrefsOnce } from "@/lib/client/learning-prefs-store";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, FileText, Flame, History, Library, NotebookPen, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { HOME_START_EVENT } from "@/lib/ui/home-events";
import { cn } from "@/lib/utils";
import { readStreakFromStorage } from "@/components/parity/gamification";
import { StreakFreezeBadge, type StreakFreezeBadgeState } from "@/components/parity/streak-freeze-badge";
import { GamificationGate } from "@/components/parity/gamification";
import { JourneyDialog, type JourneyTab } from "@/components/parity/journey-dialog";
import { BadgeUnlockNotice } from "@/components/parity/badge-unlock-notice";
import type { BadgeJourney } from "@/lib/gamification/badges";
import { ParityDialogHost, MenuDialogUrlSync } from "@/components/parity/parity-dialog-host";
import { PlusLimitBanner } from "@/components/paywall/plus-limit-banner";
import { PromoBanner, type PromoCampaign } from "@/components/paywall/promo-banner";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { StudentShellProvider } from "@/lib/student/student-shell-context";
import { isLibraryPath, studentTopTabs, studentBottomTabs } from "@/components/parity/student-shell-nav";
import { OPEN_STREAK_EVENT, AccountCapsule, ProfileRing, ProfileSidePanel } from "@/components/parity/profile-identity";
import { planIdentity } from "@/lib/student/plan-identity";
import { formatDate } from "@/lib/format";
import { ACCOUNT_REFRESH_EVENT } from "@/lib/credits/spendable";
import { FreePreviewToggle } from "@/components/admin/free-preview-toggle";
import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { profilePlanView } from "@/lib/billing/tier-presentation";
import { ExamChatMenu } from "@/components/parity/exam-chat-menu";
import { ExamCountdownBadge } from "@/components/parity/exam-countdown-badge";
import type { ExamCountdown } from "@/lib/learning/exam-countdown";
import type { RecentConversation } from "@/lib/student/conversation-time";
import "@/styles/parity-shell.css";
import "@/styles/cx-shell.css";
import "@/styles/cx-pages.css";
import "@/styles/home-cockpit.css";

export type { RecentConversation };

/** Fiyatın "Kapat"ı için: oturumun ilk adresi ve uygulama içinde başka sayfaya geçilip geçilmediği. */
let firstPathname: string | null = null;
let movedInApp = false;

function relativeTr(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dakika önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

/**
 * Kütüphane (13 Kasım 2026, Faz 2; eski adı "Daha fazla"): öğrencinin kendi biriktirdikleri. İlerleme, Takvimim,
 * Kullanım limitleri, Davet ve Yıldızlar profil paneline; Çıkış yap yalnız profilde.
 */
const LIBRARY_LINKS = [
  { href: "/dokumanlar", label: "Belgelerim", icon: FileText },
  // 19 Ekim 2026: testlerdeki yanlışlar ve günlük 10 soruluk tur; önceden yalnız Araçlar'dan ulaşılıyordu.
  { href: "/yanlislarim", label: "Yanlışlarım", icon: NotebookPen },
  { href: "/siniflar", label: "Çalışma grupları", icon: Users },
  { href: "/sohbetler", label: "Geçmiş konuşmalar", icon: History },
] as const;

/** Yalnız yönetici ve kurucuya (karar sunucuda: account.adminPanel); öğrenci asla görmez. 6 Kasım 2026. Simge satırda (13 Kasım 2026). */
export const ADMIN_PANEL_LINK = { href: "/admin", label: "Yönetim Paneli" } as const;

export function ParitySorShell({
  children,
  userInitial,
  userName,
  streak = 0,
  streakFreeze,
  account,
  emailUnverified = false,
  promo = null,
  recentConversations = [],
  chrome = "app",
  conversationBaseHref,
  minimalTop = false,
  backHref,
  countdown = null,
  home = false,
  closeHref,
}: {
  /** Tam ekran odak görünümü (fiyat): çubuk ve logo yok, sağ üstte bu adrese giden cam kapat. */
  closeHref?: string;
  /**
   * Ana ekran göstergesi (13 Kasım 2026): kök `cp-sor-root--home` (kaydırmasız masaüstü). Üst çubuk ve logo
   * bütün öğrenci sayfalarında aynı (kabuk fazı, 13 Kasım 2026, ürün sahibinin kararı).
   */
  home?: boolean;
  children: React.ReactNode;
  userInitial?: string;
  /** Profil kapsülündeki ad (13 Kasım 2026, Faz 2). */
  userName?: string;
  /** Eski emoji avatarı: kabuk artık çizmiyor (Faz 2, halkalı baş harf); çağıranlar bozulmasın diye tip duruyor. */
  avatarEmoji?: string | null;
  streak?: number;
  streakFreeze?: StreakFreezeBadgeState | null;
  account?: StudentAccountContext;
  /** Doğrulanmamış e-posta (sunucunun oturum okuması): şerit ilk çizimde görünür. */
  emailUnverified?: boolean;
  promo?: PromoCampaign | null;
  recentConversations?: RecentConversation[];
  /** Ana ekran ve sınav listesi üst barı: yaklaşan sınav geri sayımı. */
  countdown?: ExamCountdown | null;
  /**
   * Sınav sohbeti: logo ve sekme çubuğu yerine geri, seri, menü ve avatar.
   * Diğer sayfalar `app` kabuğunda kalır.
   */
  chrome?: "app" | "exam" | "focus" | "session";
  /**
   * Alt sayfanın "Geri" adresi (hazırlığın podcast kurulumu, düello, müfredat …). Üst çubukta değil, içeriğin sol
   * üstünde 40 px cam düğme: ana ekrana eklenmiş uygulamada tarayıcının geri tuşu yok (13 Kasım 2026).
   */
  backHref?: string;
  /**
   * Geçmiş satırı bu adresin `?sohbet=` parametresiyle açılır.
   * Verilmezse genel öğretmen sohbetine gider.
   */
  conversationBaseHref?: string;
  /**
   * Hazırlık sayfası (17 Ekim 2026, kıyas ürünüyle yan yana): üst çubukta yalnız Geri ve
   * sayfanın kendi simgeleri; seri, menü, avatar ve kurucu rozeti yok.
   */
  minimalTop?: boolean;
}) {
  const pathname = usePathname();
  // Kütüphane'nin sayfaları: üst çubukta ve telefonun alt çubuğunda Kütüphane etkin, sekmelerden hiçbiri değil.
  const libraryActive = isLibraryPath(pathname ?? "");
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(ACCOUNT_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNT_REFRESH_EVENT, refresh);
  }, [router]);
  // Disleksi dostu okuma, ses ve öneri tercihi: oturumda bir kez profilden.
  useEffect(() => {
    syncLearningPrefsOnce();
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(streak);
  const [freezeState, setFreezeState] = useState<StreakFreezeBadgeState | null>(streakFreeze ?? null);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [journeyTab, setJourneyTab] = useState<JourneyTab>("streak");
  // Pencere seriyi günlük kayıttan yeniden hesaplıyor; düğmedeki sayı da ona uysun.
  const syncStreak = useCallback((journey: BadgeJourney) => {
    setStreakCount(journey.streak.current);
  }, []);
  const [limitDismissed, setLimitDismissed] = useState(false);
  const isAdmin = Boolean(account?.isAdmin);
  const isPremium = Boolean(account?.isPremium);
  const showBuy = !isAdmin && account?.showsUpgradeChrome === true;
  const showPlusLimit =
    !isAdmin && isPremium && Boolean(account) && !account?.canSpend && !limitDismissed;
  /**
   * Profil plan satırı kitleye göre: ücretsiz Temel + yükseltme, Plus/Sigma
   * rozet + dönem + ek paket. Metin `profilePlanView` tek kaynağından gelir.
   */
  const planView = account && !isAdmin ? profilePlanView(account) : null;
  /** Profil kimliği (13 Kasım 2026, Faz 2): halka, köşe işareti ve plan etiketi; kapsül, panel ve alt çubuk aynı. */
  const identity = planIdentity(account);
  const initial = (userInitial?.slice(0, 1) || "?").toLocaleUpperCase("tr-TR");
  const displayName = userName?.trim() || "Öğrenci";
  const periodEndLabel = account?.subscriptionPeriodEnd ? formatDate(account.subscriptionPeriodEnd) : null;
  const isStudio = pathname.startsWith("/studio");
  // "focus": sınav kabuğunun başlığı (Geri, seri, menü, avatar) ama temaya
  // uyan renk ve normal sayfa kaydırması. Hazırlık sayfası bunu kullanıyor —
  // kıyas ürününde hazırlığın içinde üst sekme çubuğu yok.
  // "session": ders, test, podcast oturumu. kıyas ürününde üst çubuk yok; yalnız
  // ilerleme ve × (oturumun kendi çubuğu). 3 Ekim 2026.
  const examChrome = chrome === "exam" || chrome === "focus" || chrome === "session";
  /**
   * Kabuk (13 Kasım 2026, ürün sahibinin kararı): ana ekrandaki üst çubuk ve telefonun alt çubuğu giriş yapılmış
   * bütün öğrenci sayfalarında aynı (uygulama, hazırlık, sınav sohbeti). Tam ekran odak görünümlerinde (ders, test,
   * oturum, fiyat: `session`) çubuk ve logo yok. Eski "Geri"li odak çubuğu, yıldız düğmesi ve kurucu çipi kalktı:
   * gezinme sekmelerden, yıldızlar "Daha fazla"dan.
   */
  const showTopBar = chrome !== "session";
  /** Hazırlık sayfasının kendisinde (sade üst) Geri yok; gezinme sekmelerden. */
  const showBack = showTopBar && Boolean(backHref) && !minimalTop;
  // Fiyatın "Kapat"ı geldiği sayfaya döner: uygulama içinde gezinildiyse ya da aynı siteden gelindiyse bir geri,
  // yoksa (dışarıdan bağlantı, yeni sekme) ana ekran.
  useEffect(() => {
    if (firstPathname === null) firstPathname = pathname;
    else if (pathname !== firstPathname) movedInApp = true;
  }, [pathname]);
  const closeFocus = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    let sameSite = false;
    try {
      sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch {
      sameSite = false;
    }
    if ((movedInApp || sameSite) && window.history.length > 1) router.back();
    else router.push(closeHref ?? "/ogretmen");
  };
  const startTeacher = () => {
    // Sayfada öğretmen sohbeti varsa (ana ekran) ilk sözü orada açar; yoksa ana ekrana gider ve orada açar.
    const event = new Event(HOME_START_EVENT, { cancelable: true });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) router.push("/ogretmen?basla=1");
  };
  // Başka sayfadaki "Başla" ana ekrana `?basla=1` ile gelir: öğretmenin ilk sözü açılır, adres temizlenir.
  // (Çocukların etkileri önce çalışır; sohbetin dinleyicisi bu anda hazır.)
  useEffect(() => {
    if (pathname !== "/ogretmen") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("basla") !== "1") return;
    params.delete("basla");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    window.dispatchEvent(new Event(HOME_START_EVENT));
  }, [pathname]);
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
        setFreezeState({
          remaining: Number(data?.freezeRemaining ?? 0),
          protected: Boolean(data?.freezeProtected),
          used: Boolean(data?.freezeUsed),
        });
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
    setProfileOpen(false);
  }, [pathname]);

  // Profil panelindeki "Mevcut seri" seri penceresini açar (pencerenin durumu kabukta).
  useEffect(() => {
    const open = () => {
      setJourneyTab("streak");
      setJourneyOpen(true);
    };
    window.addEventListener(OPEN_STREAK_EVENT, open);
    return () => window.removeEventListener(OPEN_STREAK_EVENT, open);
  }, []);

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
      <div className={cn("cp-sor-root", home && chrome === "app" && "cp-sor-root--home", isPremium && "cp-sor-root--plus", isStudio && "cp-sor-root--studio", chrome === "exam" && "cp-sor-root--exam", chrome === "focus" && "cp-sor-root--focus", chrome === "session" && "cp-sor-root--session", minimalTop && "cp-sor-root--minimal-top")}>
      {account?.freePreview && chrome !== "session" ? (
        <div className="cp-free-preview-bar" role="status">
          <span>Ücretsiz önizleme açık: ücretsiz bir öğrencinin gördüğünü görüyorsun.</span>
          <FreePreviewToggle on className="cp-free-preview-off" label="Kapat" />
        </div>
      ) : null}
      {/* Tek şerit, her öğrenci kabuğunda (Paket J takip #3): oturum ekranları dahil; kurucuda hiç. */}
      {account?.isAdmin ? null : <EmailVerifyBanner initialUnverified={emailUnverified} />}
      {showTopBar ? (
        <header className="cx-home-top">
          {/* Logo (13 Kasım 2026, tasarım tahtası): depodaki dosya düz <img>; üstünde iki maskeli katman (parıltı, renk
              akışı) ve arkasında yumuşak ışık. Logonun kendisi değişmez. */}
          <Link href="/ogretmen" className="cx-home-logo" aria-label="Cortex Plus Ana Sayfa">
            <span className="lg" aria-hidden="true">
              <i className="gl" />
              {/* eslint-disable-next-line @next/next/no-img-element -- maskeli katmanlar aynı dosyayı kullanıyor; boyut CSS'te */}
              <img src="/logo-mark-trim.png" alt="" width={432} height={280} draggable={false} />
              <i className="sh" />
              <i className="fl" />
            </span>
            <span className="cx-home-logo-word">
              Cortex <span className="gp">Plus</span>
            </span>
          </Link>
          <div className="cx-home-nav">
            <nav className="cx-home-tray" aria-label="Ana bölümler">
              {studentTopTabs
                .filter((tab) => tab.id !== "profile")
                .map((tab) => {
                  const active = tab.match(pathname) && !libraryActive;
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      className={cn("cx-home-tab", active && "is-active cx-glass")}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="cx-home-tab-icon" aria-hidden />
                      <span>{tab.label}</span>
                    </Link>
                  );
                })}
            </nav>
            <button
              type="button"
              className={cn("cx-home-more", libraryActive && "is-active cx-glass")}
              aria-label="Kütüphane"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Library aria-hidden />
              <span className="cx-home-more-label">Kütüphane</span>
            </button>
          </div>
          <div className="cx-home-actions">
            <button type="button" className="cx-home-start cx-glass" onClick={startTeacher}>
              <Sparkles aria-hidden />
              Başla
            </button>
            <button
              type="button"
              className="cx-home-streak cx-glass"
              aria-label={`Seri: ${streakCount} gün. Seri ve rozetleri aç`}
              aria-haspopup="dialog"
              onClick={() => {
                setJourneyTab("streak");
                setJourneyOpen(true);
              }}
            >
              <Flame aria-hidden />
              <span>{streakCount}</span>
              {freezeState ? <StreakFreezeBadge state={freezeState} compact /> : null}
            </button>
            {showBuy ? (
              <Link href="/pay" className="cx-home-buy" aria-label="Plus planına bak">
                {/* Telefonda mevcut kısa etiket ("Plus"); yazılar eski çubuktakiyle aynı. */}
                <span className="cx-home-buy-full">Plus&apos;a geç</span>
                <span className="cx-home-buy-short">Plus</span>
              </Link>
            ) : null}
            <AccountCapsule
              name={displayName}
              initial={initial}
              identity={identity}
              open={profileOpen}
              onOpen={() => setProfileOpen(true)}
            />
          </div>
        </header>
      ) : closeHref ? (
        /* Tam ekran odak görünümü (fiyat): çubuk ve logo yok; sağ üstte cam kapat. */
        <Link href={closeHref} className="cx-shell-close cx-glass" aria-label="Kapat" onClick={closeFocus}>
          <X aria-hidden />
        </Link>
      ) : null}

      {showBack && backHref ? (
        <div className="cx-shell-back">
          <Link href={backHref} className="cx-shell-back-link cx-glass">
            <ArrowLeft aria-hidden />
            Geri
          </Link>
        </div>
      ) : null}

      {/* Yaklaşan sınav şeridi yalnız sınav listesinde; üst çubuğun parçası değil, altında durur. */}
      {chrome === "app" && countdown ? (
        <div className="cx-shell-countdown">
          <ExamCountdownBadge countdown={countdown} />
        </div>
      ) : null}

      {showPlusLimit ? (
        <PlusLimitBanner onDismiss={() => setLimitDismissed(true)} />
      ) : null}

      {/* Kampanya bandı yalnızca ücretsiz katmanda: abone olana indirim
          duyurusu göstermek anlamsız. */}
      {promo && showBuy && !examChrome ? <PromoBanner campaign={promo} /> : null}

      {/* cx-app-main: girişli sayfa kuralları (cx-pages.css, 13 Kasım 2026); odak görünümleri (ders, test, fiyat) almaz. */}
      <main className={cn("cp-sor-main", chrome === "app" && !closeHref && "cx-app-main")}>{children}</main>

      {/* Telefon alt çubuğu (13 Kasım 2026, Faz 2): Ana Sayfa, Sınavlar, Stüdyo, Kütüphane, Profil. Profil sekmesinde
          planlı 28 px halka; Kütüphane paneli açar. */}
      {showTopBar ? <nav className="cp-sor-bottomnav" aria-label="Ana gezinme">
        {studentBottomTabs
          .filter((tab) => tab.id !== "profile")
          .map((tab) => {
            const Icon = tab.icon;
            const active = tab.match(pathname) && !libraryActive;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn("cp-sor-bottomnav-link", active && "cp-sor-bottomnav-link--active cx-glass")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{tab.shortLabel ?? tab.label}</span>
              </Link>
            );
          })}
        <button
          type="button"
          className={cn("cp-sor-bottomnav-link", libraryActive && "cp-sor-bottomnav-link--active cx-glass")}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Library className="h-5 w-5" aria-hidden />
          <span>Kütüphane</span>
        </button>
        {studentBottomTabs
          .filter((tab) => tab.id === "profile")
          .map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn("cp-sor-bottomnav-link", active && "cp-sor-bottomnav-link--active cx-glass")}
                aria-current={active ? "page" : undefined}
                aria-label={identity.aria}
              >
                <ProfileRing initial={initial} identity={identity} size="s" />
                <span aria-hidden>{tab.label}</span>
              </Link>
            );
          })}
      </nav> : null}

      {menuOpen && chrome === "exam" ? (
        <ExamChatMenu
          conversations={recentConversations}
          conversationHref={openConversation}
          onClose={closeMenu}
        />
      ) : null}

      {menuOpen && chrome !== "exam" ? (
        <div
          className="cp-sor-menu-backdrop cx-lib-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cx-lib-title"
          onClick={closeMenu}
        >
          {/* Kütüphane (13 Kasım 2026, Faz 2): ortalanmış 480 px diyalog, satırlar 60 px (skill §6 liste satırı). */}
          <div className="cx-lib-panel cx-surface-1" onClick={(e) => e.stopPropagation()}>
            <div className="cx-lib-head">
              <h2 id="cx-lib-title" className="cx-lib-title">Kütüphane</h2>
              <button type="button" className="cx-lib-close cx-glass" aria-label="Kapat" onClick={closeMenu}>
                <X aria-hidden />
              </button>
            </div>
            <nav className="cx-lib-list" aria-label="Kütüphane">
              {LIBRARY_LINKS.map((item) => {
                const Icon = item.icon;
                const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("cx-lib-row", current && "is-current")}
                    aria-current={current ? "page" : undefined}
                  >
                    <Icon className="cx-lib-row-icon" aria-hidden />
                    <span className="cx-lib-row-label">{item.label}</span>
                    <ChevronRight className="cx-lib-row-go" aria-hidden />
                  </Link>
                );
              })}
            </nav>
            <div className="cx-lib-recent">
              {recentConversations.length ? (
                recentConversations.map((item) => (
                  <Link key={item.id} href={`/ogretmen?sohbet=${item.id}`} className="cx-lib-recent-item">
                    <span>{item.title || "Yeni sohbet"}</span>
                    <em>{relativeTr(item.updatedAt)}</em>
                  </Link>
                ))
              ) : (
                <p className="cx-lib-empty">Henüz sohbet yok</p>
              )}
            </div>
            {account?.adminPanel ? (
              <div className="cx-lib-list">
                <Link href={ADMIN_PANEL_LINK.href} className="cx-lib-row" data-testid="admin-panel-link">
                  <ShieldCheck className="cx-lib-row-icon" aria-hidden />
                  <span className="cx-lib-row-label">{ADMIN_PANEL_LINK.label}</span>
                  <ChevronRight className="cx-lib-row-go" aria-hidden />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showTopBar ? (
        <ProfileSidePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          name={displayName}
          initial={initial}
          identity={identity}
          periodEndLabel={periodEndLabel}
        />
      ) : null}

      <ParityDialogHost onOpenMenu={openMenuFromUrl} plan={planView} />
      <Suspense fallback={null}>
        <MenuDialogUrlSync onOpen={openMenuFromUrl} />
      </Suspense>
      {isPremium ? <GamificationGate /> : null}
      <JourneyDialog
        open={journeyOpen}
        tab={journeyTab}
        onClose={() => setJourneyOpen(false)}
        onLoaded={syncStreak}
      />
      <BadgeUnlockNotice
        onJourney={syncStreak}
        onOpenBadges={() => {
          setJourneyTab("badges");
          setJourneyOpen(true);
        }}
      />
    </div>
    </StudentShellProvider>
  );
}
