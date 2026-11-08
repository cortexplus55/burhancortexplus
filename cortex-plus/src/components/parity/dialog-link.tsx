"use client";

import type { ReactNode } from "react";

/**
 * Pencere açan bağlantı (8 Kasım 2026, Ayarlar). `?dialog=…` adresi sunucuya gitmeden yazılır: Next.js tarayıcı
 * geçmişini `useSearchParams` ile eşler, pencere anında açılır. Düz `<Link>` bütün sayfayı sunucuda yeniden çizip
 * pencereyi 2-3 sn sonra açıyordu. Sağ tıklama / yeni sekme için gerçek adres kalır.
 */
export function DialogLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        window.history.pushState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
