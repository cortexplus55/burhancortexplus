import { ParitySorShell } from "@/components/parity/sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { loadGeneralReviewDue } from "@/lib/learning/general-review";
import { uiV2 } from "@/lib/ui-v2/flags";
import { loadLatestPrep } from "@/lib/learning/prep-cards";
import { plusOnlyLocked } from "@/lib/billing/node-free-meter";
import { examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-studyo.css";

export const metadata = { title: "Çalışma Stüdyosu" };

export default async function AraclarPage() {
  const { supabase, user } = await requireStudentArea();
  const service = createServiceClient();
  const [shell, deck, studyo, latestPrep, cramLocked] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadGeneralReviewDue(service, user.id),
    uiV2("studyo", user.id),
    loadLatestPrep(supabase, user.id),
    plusOnlyLocked(service, user.id).catch(() => false),
  ]);
  // Sınav sabahı kâğıdı (15 Kasım 2026): son hazırlığın kâğıdına kısa yol. Ücretsiz hesapta kâğıt sayfası Plus kapısını
  // gösterir; kartta "Plus" rozeti.
  const cram = latestPrep
    ? { href: examPrepCramSheetHref(latestPrep.id), prepTitle: latestPrep.title, locked: cramLocked }
    : null;

  return (
    <ParitySorShell {...shell}>
      <UiScope keys={studyo ? ["studyo"] : []}>
        <ToolsHub deck={{ dueCount: deck.dueCount, total: deck.total }} gated={studyo} cram={cram} />
      </UiScope>
    </ParitySorShell>
  );
}
