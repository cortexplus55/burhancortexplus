import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageShell, type PageShellWidth } from "@/components/parity/page-shell";
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
  lead,
  actions,
  width,
  focus = false,
}: {
  children: React.ReactNode;
  /** Tam ekran odak görünümü (fiyat, 13 Kasım 2026): üst çubuk, logo ve alt çubuk yok; sağ üstte cam kapat. */
  focus?: boolean;
  title?: string;
  /** Başlığın altında görünen kısa bilgi (ör. işlem bedeli). */
  creditHint?: string;
  /** Başlığın altındaki açıklama (sayfanın kendi metni). */
  lead?: ReactNode;
  /** Başlığın sağındaki eylemler (sayfanın kendi düğmeleri). */
  actions?: ReactNode;
  /** Sayfa iskeleti genişliği (13 Kasım 2026): liste 816, okuma/form 768. Başlık varsa varsayılan liste. */
  width?: PageShellWidth;
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
    <ParitySorShell {...shell} {...(focus ? { chrome: "session" as const, closeHref: "/ogretmen" } : {})}>
      {title || width ? (
        /* Girişli sayfaların tek iskeleti (13 Kasım 2026): heading-xl başlık, liste 816 / okuma 768 px. */
        <PageShell
          title={title}
          width={width ?? "list"}
          actions={actions}
          lead={
            lead ??
            /* Kurucuda işlem bedeli yazmıyor: hiçbir işlem kredi düşürmüyor. */
            (creditHint && !shell.account.isAdmin ? creditHint : undefined)
          }
        >
          {children}
        </PageShell>
      ) : (
        /*
          `.cp-page` olmadan bu sayfaların içeriği hiçbir kapsayıcıya
          girmiyordu: başlık ekranın sol kenarına yapışıyor, form ve listeler
          geniş ekranda tek satıra dağılıyordu. (Fiyat ekranı ve stüdyolar kendi düzeninde.)
        */
        <div className="cp-page">{children}</div>
      )}
    </ParitySorShell>
  );
}
