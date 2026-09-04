import { createClient } from "@/lib/supabase/server";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
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
    return <div className="astra-app min-h-dvh p-4">{children}</div>;
  }

  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      {/*
        `.ap-page` olmadan bu sayfaların içeriği hiçbir kapsayıcıya
        girmiyordu: başlık ekranın sol kenarına yapışıyor, form ve listeler
        geniş ekranda tek satıra dağılıyordu.
      */}
      <div className="ap-page">
        {title ? (
          <div className="ap-page-head">
            <h1 className="ap-page-title">{title}</h1>
            {creditHint ? <p className="ap-page-hint">{creditHint}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </AstraParitySorShell>
  );
}
