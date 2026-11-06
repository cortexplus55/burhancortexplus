import { adminNavItem } from "@/lib/admin/nav";
import "@/styles/admin-panel.css";

/**
 * Yönetim sayfasının başlığı.
 *
 * 6 Kasım 2026'dan beri yan menü, üst çubuk ("🛡️ Yönetim Paneli" + rol rozeti) ve kapı uyarısı ortak
 * düzende (`src/app/admin/layout.tsx`); bu bileşen yalnız sayfanın başlığını ve açıklamasını yazar.
 * Başlık ve açıklama menüyle aynı kaynaktan (`lib/admin/nav.ts`).
 */
export function AdminShell({
  href,
  children,
  actions,
  title,
  blurb,
}: {
  /** Menüdeki karşılığı bulmak için sayfanın kendi adresi. */
  href: string;
  children: React.ReactNode;
  /** Eski çağıranlar için duruyor: bekleyen başvuru sayısı artık düzende sayılıyor. */
  pendingApplications?: number;
  /** Başlığın sağındaki sayfaya özel düğmeler. */
  actions?: React.ReactNode;
  /** Menüde olmayan sayfa için başlık ve açıklama. */
  title?: string;
  blurb?: string;
}) {
  const item = adminNavItem(href);
  const heading = title ?? item?.label ?? "Yönetim";
  const description = blurb ?? item?.blurb;

  return (
    <>
      <header className="adm-head">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="adm-title">{heading}</h1>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {description ? <p className="adm-blurb">{description}</p> : null}
      </header>

      {children}
    </>
  );
}
