import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Girişli öğrenci sayfalarının tek iskeleti (13 Kasım 2026, ürün sahibinin kararı; skill §3, §7).
 *
 * - Başlık `heading-xl` (40 / 600, satır aralığı 1,15); telefonda 32 px (uzun başlık iki satıra düşmesin).
 * - Genişlik: liste sayfaları 816 px (768 içerik + 24 + 24), okuma ve form sayfaları 768 px; yan boşluk 24 px,
 *   telefonda 16 px.
 * - Başlığın altındaki açıklama ve sağındaki eylemler sayfanın kendi metniyle gelir; bu bileşen metin yazmaz.
 */
export type PageShellWidth = "list" | "read";

export function PageShell({
  title,
  titleId,
  lead,
  actions,
  width = "list",
  eyebrow,
  className,
  headClassName,
  children,
}: {
  /** Sayfanın h1'i. Yoksa (ör. boş durumda başlık kartın içinde) yalnız eylemler çizilir. */
  title?: ReactNode;
  titleId?: string;
  /** Başlığın altındaki tek açıklama (sayfanın bugünkü metni). */
  lead?: ReactNode;
  /** Başlığın sağındaki eylemler (sayfanın bugünkü düğmeleri). */
  actions?: ReactNode;
  width?: PageShellWidth;
  /** Başlığın üstündeki küçük etiket (sayfanın bugünkü metni; varsa). */
  eyebrow?: ReactNode;
  className?: string;
  headClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("cx-page", width === "read" ? "cx-page--read" : "cx-page--list", className)}>
      {title || actions ? (
        <header className={cn("cx-page-head", !title && "cx-page-head--actions", headClassName)}>
          {title ? (
            <div className="cx-page-head-text">
              {eyebrow ? <div className="cx-page-eyebrow">{eyebrow}</div> : null}
              <h1 id={titleId} className="cx-page-title">
                {title}
              </h1>
              {lead ? <div className="cx-page-lead">{lead}</div> : null}
            </div>
          ) : null}
          {actions ? <div className="cx-page-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </div>
  );
}
