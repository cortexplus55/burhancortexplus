"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * Menü bağlantıları. Hangi sayfada olduğunu bilmek için istemci tarafında —
 * kabuğun geri kalanı sunucuda kalabilsin diye ayrı dosyada.
 */
export function AdminNavLinks({
  pendingApplications = 0,
}: {
  pendingApplications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="adm-nav" aria-label="Yönetim menüsü">
      {ADMIN_NAV.map((group) => (
        <div key={group.group} className="adm-nav-group">
          <p className="adm-nav-title">{group.group}</p>
          {group.items.map((item) => {
            // "/admin" her sayfanın öneki olduğu için tam eşleşme gerekiyor;
            // yoksa Özet hep etkin görünürdü.
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const showCount =
              item.href === "/admin/ogretmen-basvurulari" && pendingApplications > 0;

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
