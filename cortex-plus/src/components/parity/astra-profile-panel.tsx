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

/**
 * Profil paneli.
 *
 * Önceden /profil doğrudan ayar formuydu; Astra'da avatar bir panele açılıyor
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
  { href: "/mobil-uygulama", label: "Uygulamayı indir", icon: Download },
];

export function AstraProfilePanel({
  data,
  email,
  isPremium,
  children,
}: {
  data: ProfileDashboard;
  email: string | null;
  isPremium: boolean;
  /** Davet kartı — sunucu tarafında hazırlanıp buraya veriliyor. */
  children?: React.ReactNode;
}) {
  const name = data.fullName?.trim() || email?.split("@")[0] || "Öğrenci";
  const initial = name.slice(0, 1).toLocaleUpperCase("tr-TR");

  const identity = [data.schoolName, data.gradeLevel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ap-pp">
      <header className="ap-pp-head">
        <span className="ap-pp-avatar" aria-hidden>
          {initial}
        </span>
        {/* Sayfanın tek başlığı bu; `p` olduğu için sayfanın h1'i yoktu. */}
        <h1 className="ap-pp-name">
          {name}
          {isPremium ? (
            <span className="ap-pp-badge" title="Cortex Plus">
              +
            </span>
          ) : null}
        </h1>
        {identity ? <p className="ap-pp-identity">{identity}</p> : null}
        <Link href="/ayarlar" className="ap-pp-settings">
          <Settings className="h-4 w-4" aria-hidden /> Ayarlar
        </Link>
      </header>

      {/* Ücretsiz kullanıcıya planını ve çıkışını göster; premium'da bu satır
          yalnızca gürültü olurdu. */}
      {!isPremium ? (
        <div className="ap-pp-plan">
          <div>
            <strong>Temel</strong>
            <span>Ücretsiz plan</span>
          </div>
          <Link href="/paketler" className="ap-pp-upgrade">
            <Sparkles className="h-4 w-4" aria-hidden /> Daha hızlı öğren
          </Link>
        </div>
      ) : null}

      {children}

      <section className="ap-pp-streak" aria-label="Çalışma serisi">
        <div className="ap-pp-streak-head">
          <Flame className="h-7 w-7 text-[var(--ap-gold)]" aria-hidden />
          <div>
            <strong>{data.currentStreak}</strong>
            <span>Mevcut seri</span>
          </div>
          <div>
            <strong>{data.longestStreak}</strong>
            <span>En uzun seri</span>
          </div>
        </div>
        <ol className="ap-pp-week">
          {data.week.map((day) => (
            <li key={day.iso} className={cn(day.isToday && "is-today")}>
              <span className="ap-pp-day">{day.label}</span>
              <span
                className={cn("ap-pp-flame", day.active && "is-on")}
                title={day.active ? "Çalıştın" : "Kayıt yok"}
              >
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="ap-pp-cards">
        <Link href="/ilerleme" className="ap-pp-card">
          <TrendingUp className="h-5 w-5" aria-hidden />
          <strong>Aktivitelerim</strong>
          <span>Öğrenme ilerlemeni takip et</span>
        </Link>
        <Link href="/takvimim" className="ap-pp-card">
          <CalendarDays className="h-5 w-5" aria-hidden />
          {data.upcomingEvents > 0 ? (
            <em className="ap-pp-card-badge">{data.upcomingEvents}</em>
          ) : null}
          <strong>Takvimim</strong>
          <span>Yaklaşan etkinlikleri gör</span>
        </Link>
      </div>

      <nav className="ap-pp-menu" aria-label="Hesap">
        {MENU.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/signout" method="post" className="ap-pp-signout">
        <button type="submit">
          <LogOut className="h-4 w-4" aria-hidden />
          Çıkış yap
        </button>
      </form>
    </div>
  );
}
