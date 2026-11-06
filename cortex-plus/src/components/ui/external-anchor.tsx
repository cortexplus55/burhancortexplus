import type { AnchorHTMLAttributes, ReactNode } from "react";
import { ExternalLink } from "lucide-react";

/** Ekran okuyucunun duyduğu tek Türkçe not; görünmez. */
export const NEW_TAB_NOTE = "(yeni sekmede açılır)";

/**
 * Yeni sekmede açılan bağlantı (6 Kasım 2026, Paket 4). Canlıda resmî kılavuz bağlantısının metninde İngilizce
 * "Open" görünüyordu: yeni sekmeye giden bağlantının adı yalnız görünen metindi, simge ve araçlar boşluğu kendi
 * dillerinde dolduruyordu. Bağlantı kendi Türkçe notunu taşır (`sr-only`), simge ad almaz (`aria-hidden`,
 * odaklanmaz); `rel` her zaman `noopener noreferrer`.
 */
export function ExternalAnchor({
  href,
  children,
  icon = false,
  iconClassName = "inline h-3 w-3",
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & {
  href: string | undefined;
  children: ReactNode;
  /** Bağlantı metninin yanına küçük dış bağlantı simgesi. */
  icon?: boolean;
  iconClassName?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      {icon ? (
        <>
          {" "}
          <ExternalLink className={iconClassName} aria-hidden focusable={false} />
        </>
      ) : null}
      {" "}
      <span className="sr-only">{NEW_TAB_NOTE}</span>
    </a>
  );
}
