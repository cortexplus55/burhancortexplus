import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { loadProfileDashboard } from "@/lib/student/profile-dashboard";
import { toMyStars } from "@/lib/stars/view";

/**
 * Profil yan panelinin verisi (13 Kasım 2026): yalnız okur, hiçbir şey yazmaz.
 *
 * Panel her sayfada değil, açıldığında okunur. Profil bilgileri /profil sayfasıyla aynı yükleyiciden
 * (`loadProfileDashboard`), yıldızlar Yıldızlar penceresiyle aynı kaynaktan (`my_stars`). Yıldızlar okunamazsa
 * panel yine açılır; sayı yerine boş kalır.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "profile-panel-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const [dashboard, stars] = await Promise.all([
    loadProfileDashboard(supabase, userId),
    supabase.rpc("my_stars").then(
      (result) => (result.error ? null : toMyStars(result.data).all),
      () => null,
    ),
  ]);

  return NextResponse.json(
    { dashboard, stars },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
