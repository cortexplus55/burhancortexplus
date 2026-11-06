"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { ADMIN_NAV, canOpenAdminItem } from "@/lib/admin/nav";
import type { AdminRole } from "@/lib/auth/admin-role";
import { cn } from "@/lib/utils";

/**
 * Menü bağlantıları. Hangi sayfada olduğunu bilmek için istemci tarafında — kabuğun geri kalanı
 * sunucuda kalabilsin diye ayrı dosyada. Rol sunucudan gelir; kurucuya özel öğe yöneticiye kilitli
 * görünür (bağlantı değil). Asıl engel sunucuda: sayfa `requireFounderPage()`, eylem `checkFounderActor()`.
 */
export function AdminNavLinks({
  role,
  pendingApplications = 0,
}: {
  role: AdminRole;
  pendingApplications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="adm-nav" aria-label="Yönetim menüsü">
      {ADMIN_NAV.map((group) => (
        <div key={group.group} className="adm-nav-group">
          <p className="adm-nav-title">{group.group}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            if (!canOpenAdminItem(item, role)) {
              return (
                <span
                  key={item.href}
                  className="adm-nav-link adm-nav-link--locked"
                  aria-disabled={true}
                  title="Yalnız kurucu açabilir"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                  <Lock className="adm-nav-lock h-3.5 w-3.5" aria-label="Yalnız kurucu" />
                </span>
              );
            }
            // "/admin" her sayfanın öneki: tam eşleşme. Kokpit içindeki bölüm bağlantısı (#) etkin sayılmaz.
            const active = item.href.includes("#")
              ? false
              : item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const showCount = item.href === "/admin/ogretmen-basvurulari" && pendingApplications > 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.blurb}
                aria-current={active ? "page" : undefined}
                className={cn("adm-nav-link", active && "adm-nav-link--active")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
                {showCount ? (
                  <span className="adm-nav-count" aria-label={`${pendingApplications} bekleyen`}>
                    {pendingApplications}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
