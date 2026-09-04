import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { adminNavItem } from "@/lib/admin/nav";
import "@/styles/admin-panel.css";

/**
 * Yönetim panelinin kabuğu.
 *
 * Öğrenci kabuğundan ayrı duruyor. Sebebi tasarım hevesi değil iş farkı:
 * öğrenci ekranı tek bir şeye odaklanmak için, yönetim ekranı ise on iki
 * bölüm arasında gezinmek için var. Üstte sekme olsaydı yarısı sığmazdı.
 *
 * Sayfa başlığı ve açıklaması menüyle aynı kaynaktan (`lib/admin/nav.ts`)
 * geliyor; menüde okuduğun cümlenin aynısını sayfanın başında da görüyorsun.
 */
export function AdminShell({
  href,
  children,
  pendingApplications = 0,
  actions,
}: {
  /** Menüdeki karşılığı bulmak için sayfanın kendi adresi. */
  href: string;
  children: React.ReactNode;
  /** Menüde "öğretmen başvuruları" yanında görünen bekleyen iş sayısı. */
  pendingApplications?: number;
  /** Başlığın sağındaki sayfaya özel düğmeler. */
  actions?: React.ReactNode;
}) {
  const item = adminNavItem(href);

  return (
    <div className="adm">
      <aside className="adm-side">
        <Link href="/admin" className="adm-brand">
          <CortexMark size={22} />
          <span className="adm-brand-word">cortex</span>
          <span className="adm-brand-tag">Yönetim</span>
        </Link>

        <AdminNavLinks pendingApplications={pendingApplications} />

        <div className="adm-side-foot">
          <Link href="/ogretmen" className="adm-side-link">
            <ArrowLeft className="inline h-3.5 w-3.5" aria-hidden /> Uygulamaya dön
          </Link>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-head">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="adm-title">{item?.label ?? "Yönetim"}</h1>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
          {item?.blurb ? <p className="adm-blurb">{item.blurb}</p> : null}
        </header>

        {children}
      </main>
    </div>
  );
}
