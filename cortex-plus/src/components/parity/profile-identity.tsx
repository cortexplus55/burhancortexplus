"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronRight,
  CreditCard,
  Flame,
  Gauge,
  Gift,
  HelpCircle,
  LogOut,
  Plus,
  Settings,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { FounderChip } from "@/components/student/founder-chip";
import { parityFullName } from "@/components/parity/app-utils";
import type { PlanIdentity } from "@/lib/student/plan-identity";
import type { ProfileDashboard } from "@/lib/student/profile-dashboard";
import { useDismiss } from "@/lib/ui/use-dismiss";
import { cn } from "@/lib/utils";
import "@/styles/cx-profile.css";

/**
 * Profil kimliği (13 Kasım 2026, ürün sahibinin tasarım tahtası): planlı halka, üst çubuktaki iki satırlı kapsül,
 * kapsülün açtığı 480 px yan panel ve /profil sayfası aynı içerikten. Plan renk dışında da okunur: halka + köşe
 * işareti + etiket (`plan-identity.ts`). Sigma tonları yalnız plan kimliğinde; hata kırmızısı (--cx-danger) ayrı.
 */

/** Seri penceresini kabuk açar (durumu kabuğun); panel ve /profil sayfası bu olayla ister. */
export const OPEN_STREAK_EVENT = "cortex:open-streak";

export function ProfileRing({
  initial,
  identity,
  size = "m",
}: {
  initial: string;
  identity: PlanIdentity;
  /** s: telefon alt çubuğu 28 px · m: kapsül 40 px · l: panel 72 px */
  size?: "s" | "m" | "l";
}) {
  return (
    <span className={cn("cx-pring", `cx-pring--${size}`, `cx-pring--${identity.look}`)} aria-hidden>
      <i>{initial}</i>
      {identity.mark ? <b className="cx-pring-mark">{identity.mark}</b> : null}
    </span>
  );
}

/** Üst çubuktaki profil kapsülü: halkalı baş harf, ad (13/600) ve mono plan etiketi. */
export const AccountCapsule = forwardRef<
  HTMLButtonElement,
  { name: string; initial: string; identity: PlanIdentity; open: boolean; onOpen: () => void }
>(function AccountCapsule({ name, initial, identity, open, onOpen }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn("cx-capsule", `cx-capsule--${identity.look}`, open && "is-open")}
      aria-label={identity.aria}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
    >
      <ProfileRing initial={initial} identity={identity} />
      <span className="cx-capsule-text">
        <span className="cx-capsule-name">{name}</span>
        <span className={cn("cx-plan-label", `cx-plan-label--${identity.look}`)}>{identity.label}</span>
      </span>
    </button>
  );
});

const LIST = [
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
  { href: "/krediler", label: "Kullanım limitleri", icon: Gauge },
  { href: "/pay", label: "Abonelik", icon: CreditCard },
  { href: "/davet", label: "Davet et", icon: Gift },
  { href: "/yardim", label: "Yardım ve destek", icon: HelpCircle },
  { href: "/mobil-uygulama", label: "Telefondan kullan", icon: Smartphone },
] as const;

export type ProfilePanelData = { dashboard: ProfileDashboard | null; stars: number | null };

/**
 * Profilin içeriği; yan panel ve /profil sayfası aynı bileşeni çizer. Veri gelene kadar ad, halka ve plan
 * kabuktan bilinir; okul, seri ve sayaçlar gelince dolar (sayı yerine "—").
 */
export function ProfileCard({
  name,
  initial,
  identity,
  data,
  periodEndLabel = null,
  titleId,
  heading = "h2",
  aside,
  onLeave,
}: {
  name: string;
  initial: string;
  identity: PlanIdentity;
  data: ProfilePanelData | null;
  /** Plus/Sigma dönem bitişi, İstanbul saatiyle. */
  periodEndLabel?: string | null;
  titleId?: string;
  heading?: "h1" | "h2";
  /** Başlığın sağındaki öğe (panelde Kapat). */
  aside?: ReactNode;
  /** Bir bağlantıya ya da pencereye geçilince (panel kapanır). */
  onLeave?: () => void;
}) {
  const pathname = usePathname();
  const dashboard = data?.dashboard ?? null;
  const meta = [dashboard?.schoolName, dashboard?.gradeLevel].filter(Boolean).join(" · ");
  const Heading = heading;
  const premium = identity.kind === "plus" || identity.kind === "week" || identity.kind === "sigma";
  const badge = identity.kind === "sigma" ? "Sigma" : "Plus";

  const openStreak = () => {
    onLeave?.();
    window.dispatchEvent(new Event(OPEN_STREAK_EVENT));
  };
  const openStars = () => {
    onLeave?.();
    const params = new URLSearchParams(window.location.search);
    params.set("dialog", "stars");
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div className={cn("cx-pp", `cx-pp--${identity.look}`)}>
      <div className="cx-pp-head">
        <ProfileRing initial={initial} identity={identity} size="l" />
        <div className="cx-pp-id">
          <Heading id={titleId} className="cx-pp-name">
            {name}
          </Heading>
          {meta ? <span className="cx-pp-meta">{meta}</span> : null}
          <span className={cn("cx-pp-chip", `cx-pp-chip--${identity.look}`)}>{identity.label}</span>
        </div>
        {aside}
      </div>

      <div className="cx-pp-stats">
        <button type="button" className="cx-pp-stat" onClick={openStreak}>
          <span className="cx-pp-stat-top">
            <span className="cx-pp-stat-label">Mevcut seri</span>
            <Flame className="cx-pp-stat-flame" aria-hidden />
          </span>
          <span className="cx-pp-stat-value">
            <strong>{dashboard ? dashboard.currentStreak : "—"}</strong>
            {dashboard ? <span className="cx-pp-stat-sub">En uzun {dashboard.longestStreak}</span> : null}
          </span>
        </button>
        <button type="button" className="cx-pp-stat" onClick={openStars}>
          <span className="cx-pp-stat-top">
            <span className="cx-pp-stat-label">Yıldızlar</span>
            <Star aria-hidden />
          </span>
          <span className="cx-pp-stat-value">
            <strong>{data?.stars ?? "—"}</strong>
          </span>
        </button>
      </div>

      <div className="cx-pp-tiles">
        <Link href="/ilerleme" className="cx-pp-tile" onClick={onLeave}>
          <span className="cx-pp-tile-top">
            <span className="cx-pp-ico">
              <TrendingUp aria-hidden />
            </span>
          </span>
          <span className="cx-pp-tile-text">
            <strong>İlerleme</strong>
            <span>Öğrenme ilerlemeni takip et</span>
          </span>
        </Link>
        <Link href="/takvimim" className="cx-pp-tile" onClick={onLeave}>
          <span className="cx-pp-tile-top">
            <span className="cx-pp-ico">
              <CalendarDays aria-hidden />
            </span>
            {dashboard && dashboard.upcomingEvents > 0 ? (
              <em className="cx-pp-count">{dashboard.upcomingEvents}</em>
            ) : null}
          </span>
          <span className="cx-pp-tile-text">
            <strong>Takvimim</strong>
            <span>Yaklaşan etkinlikleri gör</span>
          </span>
        </Link>
      </div>

      <div className={cn("cx-pp-strip", `cx-pp-strip--${identity.look}`)}>
        {identity.kind === "founder" ? (
          <>
            <span className="cx-pp-strip-text">
              <strong>Kurucu</strong>
              <span>Sınırsız · işlemler hakkından düşmez</span>
            </span>
            <FounderChip className="cx-pp-founder" />
          </>
        ) : premium ? (
          <>
            <span className="cx-pp-strip-text">
              <strong>{badge}</strong>
              <span>{`${badge} · ${periodEndLabel ? `${periodEndLabel} bitiyor` : "aylık kota"}`}</span>
            </span>
            <Link href="/pay" className="cx-pp-extra" onClick={onLeave}>
              <Sparkles aria-hidden />
              Ek paket
            </Link>
          </>
        ) : (
          <>
            <span className="cx-pp-strip-text">
              <strong>Temel</strong>
              <span>Ücretsiz plan</span>
            </span>
            <Link href="/pay" className="cx-pp-gold" onClick={onLeave}>
              <Plus aria-hidden />
              Plus&apos;a geç
            </Link>
          </>
        )}
      </div>

      <nav className="cx-pp-list" aria-label="Hesap">
        {LIST.map((item) => {
          const Icon = item.icon;
          const href = item.href === "/pay" && premium ? "/odemeler" : item.href;
          return (
            <Link key={item.href} href={href} className="cx-pp-row" onClick={onLeave}>
              <Icon className="cx-pp-row-icon" aria-hidden />
              {item.label}
              <ChevronRight className="cx-pp-row-go" aria-hidden />
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/signout" method="post" className="cx-pp-signout">
        <button type="submit" className="cx-pp-row">
          <LogOut className="cx-pp-row-icon" aria-hidden />
          Çıkış yap
        </button>
      </form>
    </div>
  );
}

/**
 * Kapsülün açtığı yan panel (skill §6: 480 px, sağ-alta 8 px boşlukla, shadow-sheet, cx-surface-1). Veri
 * açılınca yalnız okuyan uçtan (`/api/student/profile-panel`) gelir; Esc, dışarıya dokunuş ve Kapat kapatır,
 * odak açan kapsüle döner.
 */
export function ProfileSidePanel({
  open,
  onClose,
  name,
  initial,
  identity,
  periodEndLabel,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  initial: string;
  identity: PlanIdentity;
  periodEndLabel?: string | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<ProfilePanelData | null>(null);
  useDismiss(open, onClose, { initialFocus: closeRef });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/student/profile-panel", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ProfilePanelData | null) => {
        if (!cancelled && body) setData(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="cx-pp-scrim" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("cx-pp-panel cx-surface-1", `cx-pp-panel--${identity.look}`)}
        onClick={(event) => event.stopPropagation()}
      >
        <ProfileCard
          name={data?.dashboard?.fullName ? parityFullName(data.dashboard.fullName, null) : name}
          initial={initial}
          identity={identity}
          data={data}
          periodEndLabel={periodEndLabel}
          titleId={titleId}
          onLeave={onClose}
          aside={
            <button ref={closeRef} type="button" className="cx-pp-close cx-glass" aria-label="Kapat" onClick={onClose}>
              <X aria-hidden />
            </button>
          }
        />
      </aside>
    </div>
  );
}
