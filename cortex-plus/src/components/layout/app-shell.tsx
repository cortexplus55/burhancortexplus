import { createClient } from "@/lib/supabase/server";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

/**
 * Öğrenci sayfalarının kabuğu.
 *
 * Eskiden bir de `variant="admin"` dalı vardı: yan menülü, tema düğmeli ayrı
 * bir yerleşim. Yönetim paneli kendi kabuğuna taşındığı için (`AdminShell`)
 * o dal artık hiçbir yerden çağrılmıyordu — menüsü de yanlıştı, yönetim
 * sayfalarında öğrenci bağlantılarını gösteriyordu. Silindi.
 */
export async function AppShell({
  children,
  title,
  creditHint,
}: {
  children: React.ReactNode;
  title?: string;
  /** Başlığın altında görünen kısa bilgi (ör. işlem bedeli). */
  creditHint?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="cs-app min-h-dvh p-4">{children}</div>;
  }

  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <ParitySorShell {...shell}>
      {/*
        `.cp-page` olmadan bu sayfaların içeriği hiçbir kapsayıcıya
        girmiyordu: başlık ekranın sol kenarına yapışıyor, form ve listeler
        geniş ekranda tek satıra dağılıyordu.
      */}
      <div className="cp-page">
        {title ? (
          <div className="cp-page-head">
            <h1 className="cp-page-title">{title}</h1>
            {/* Kurucuda işlem bedeli yazmıyor: hiçbir işlem kredi düşürmüyor. */}
            {creditHint && !shell.account.isAdmin ? (
              <p className="cp-page-hint">{creditHint}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </ParitySorShell>
  );
}
