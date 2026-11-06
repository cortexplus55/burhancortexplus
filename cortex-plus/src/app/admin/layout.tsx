import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";
import { loadAdminContext } from "@/lib/auth/admin-guard";
import { ADMIN_ROLE_BADGE } from "@/lib/auth/admin-role";
import { countPendingApplications } from "@/lib/admin/pending";
import { createServiceClient } from "@/lib/supabase/server";
import "@/styles/admin-panel.css";

/*
  Yönetim panelinin ortak düzeni (6 Kasım 2026): üst çubuk ("🛡️ Yönetim Paneli" + rol rozeti), PIN kapısı
  kapalıysa sarı uyarı, beş kategorili yan menü. Suspense ya da loading.tsx yok (AGENTS.md: sayfayı boşaltıyor).

  Koruma burada DEĞİL yalnız: istemci gezinmesinde düzen yeniden çizilmez. Her sayfa kendi
  `requireAdminPage()` / `requireFounderPage()` çağrısını yapar; buradaki kontrol yalnız menüyü kimseye
  göstermemek için. Kapı geçilmemişse menü çizilmez (kapı sayfası ya da kapıya yönlenen sayfa).
*/

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await loadAdminContext();
  if (!context) notFound();

  const { role, gate } = context;
  const showNav = gate.passed;
  const pending = showNav ? await countPendingApplications(createServiceClient()).catch(() => 0) : 0;

  return (
    <div className={showNav ? "adm" : "adm adm--bare"}>
      {showNav ? (
        <aside className="adm-side">
          <Link href="/admin" className="adm-brand">
            <CortexMark size={22} />
            <span className="adm-brand-word">cortex</span>
            <span className="adm-brand-tag">Yönetim</span>
          </Link>

          <AdminNavLinks role={role} pendingApplications={pending} />

          <div className="adm-side-foot">
            <Link href="/ogretmen" className="adm-side-link">
              <ArrowLeft className="inline h-3.5 w-3.5" aria-hidden /> Uygulamaya dön
            </Link>
          </div>
        </aside>
      ) : null}

      <div className="adm-body">
        <div className="adm-topbar">
          <p className="adm-topbar-title">🛡️ Yönetim Paneli</p>
          <span className={`adm-role adm-role--${role}`} data-role={role}>
            {ADMIN_ROLE_BADGE[role]}
          </span>
        </div>

        {gate.state === "off" ? (
          <p className="adm-gate-warn" role="status">
            ⚠️ Ek doğrulama kapalı: Vercel&apos;de ADMIN_GATE_PIN_HASH tanımla
          </p>
        ) : null}

        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
