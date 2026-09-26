import Link from "next/link";
import {
  CalendarDays,
  CreditCard,
  Download,
  Flame,
  HelpCircle,
  History,
  LogOut,
  Settings,
  Sparkles,
  TrendingUp,
  UserPen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileDashboard } from "@/lib/student/profile-dashboard";
import type { SubscriptionBadge } from "@/lib/student/subscription-badge";

/**
 * Profil paneli.
 *
 * Önceden /profil doğrudan ayar formuydu; Referans üründe avatar bir panele açılıyor
 * ve form onun altındaki "Bilgilerim"de duruyor. Panel yeni veri üretmiyor,
 * dağınık duran şeyleri (streak, davet, plan, kısayollar) tek yerde topluyor.
 */

const MENU = [
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
  { href: "/profil/duzenle", label: "Bilgilerim", icon: UserPen },
  { href: "/krediler", label: "Kullanım", icon: TrendingUp },
  { href: "/paketler", label: "Abonelikler", icon: CreditCard },
  { href: "/sohbetler", label: "Geçmiş konuşmalar", icon: History },
  { href: "/yardim", label: "Yardım ve destek", icon: HelpCircle },
  { href: "/mobil-uygulama", label: "Telefondan kullan", icon: Download },
];

export function ProfilePanel({
  data,
  email,
  isPremium,
  subscriptionBadge,
  periodEndLabel = null,
  children,
}: {
  data: ProfileDashboard;
  email: string | null;
  isPremium: boolean;
  subscriptionBadge: SubscriptionBadge;
  /** Plus/Sigma dönem bitişi, İstanbul saatiyle. */
  periodEndLabel?: string | null;
  /** Davet kartı — sunucu tarafında hazırlanıp buraya veriliyor. */
  children?: React.ReactNode;
}) {
  const name = data.fullName?.trim() || email?.split("@")[0] || "Öğrenci";
  const initial = name.slice(0, 1).toLocaleUpperCase("tr-TR");

  const identity = [data.schoolName, data.gradeLevel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="cp-pp">
      <header className="cp-pp-head">
        <span className="cp-pp-avatar" aria-hidden>
          {initial}
        </span>
        {/* Sayfanın tek başlığı bu; `p` olduğu için sayfanın h1'i yoktu. */}
        <h1 className="cp-pp-name">
          {name}
          {isPremium ? (
            <span className="cp-pp-badge" title={subscriptionBadge ?? "Plus"}>
              {subscriptionBadge === "Sigma" ? "Σ" : "+"}
            </span>
          ) : null}
        </h1>
        {identity ? <p className="cp-pp-identity">{identity}</p> : null}
        <Link href="/ayarlar" className="cp-pp-settings">
          <Settings className="h-4 w-4" aria-hidden /> Ayarlar
        </Link>
      </header>

      <div className="cp-pp-plan">
        <div>
          <strong>{subscriptionBadge ?? "Temel"}</strong>
          <span>
            {isPremium
              ? `${subscriptionBadge ?? "Plus"} · ${periodEndLabel ? `${periodEndLabel} bitiyor` : "aylık kota"}`
              : "Ücretsiz plan"}
          </span>
        </div>
        <Link
          href="/paketler"
          className="cp-pp-upgrade"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {isPremium ? "Ek paket" : "Daha hızlı öğren"}
        </Link>
      </div>

      {children}

      <section className="cp-pp-streak" aria-label="Çalışma serisi">
        <div className="cp-pp-streak-head">
          <Flame className="h-7 w-7 text-[var(--cp-gold)]" aria-hidden />
          <div>
            <strong>{data.currentStreak}</strong>
            <span>Mevcut seri</span>
          </div>
          <div>
            <strong>{data.longestStreak}</strong>
            <span>En uzun seri</span>
          </div>
        </div>
        <ol className="cp-pp-week">
          {data.week.map((day) => (
            <li key={day.iso} className={cn(day.isToday && "is-today")}>
              <span className="cp-pp-day">{day.label}</span>
              <span
                className={cn("cp-pp-flame", day.active && "is-on")}
                title={day.active ? "Çalıştın" : "Kayıt yok"}
              >
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="cp-pp-cards">
        <Link href="/ilerleme" className="cp-pp-card">
          <TrendingUp className="h-5 w-5" aria-hidden />
          <strong>Aktivitelerim</strong>
          <span>Öğrenme ilerlemeni takip et</span>
        </Link>
        <Link href="/takvimim" className="cp-pp-card">
          <CalendarDays className="h-5 w-5" aria-hidden />
          {data.upcomingEvents > 0 ? (
            <em className="cp-pp-card-badge">{data.upcomingEvents}</em>
          ) : null}
          <strong>Takvimim</strong>
          <span>Yaklaşan etkinlikleri gör</span>
        </Link>
      </div>

      <nav className="cp-pp-menu" aria-label="Hesap">
        {MENU.map((item) => {
          const Icon = item.icon;
          const href =
            item.href === "/paketler" && isPremium ? "/odemeler" : item.href;
          return (
            <Link key={item.href} href={href}>
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/signout" method="post" className="cp-pp-signout">
        <button type="submit">
          <LogOut className="h-4 w-4" aria-hidden />
          Çıkış yap
        </button>
      </form>
    </div>
  );
}
