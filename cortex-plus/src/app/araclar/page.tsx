import { ParitySorShell } from "@/components/parity/sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { loadGeneralReviewDue } from "@/lib/learning/general-review";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-studyo.css";

export const metadata = { title: "Çalışma Stüdyosu" };

export default async function AraclarPage() {
  const { supabase, user } = await requireStudentArea();
  const [shell, deck, studyo] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadGeneralReviewDue(createServiceClient(), user.id),
    uiV2("studyo", user.id),
  ]);

  return (
    <ParitySorShell {...shell}>
      <UiScope keys={studyo ? ["studyo"] : []}>
        <ToolsHub deck={{ dueCount: deck.dueCount, total: deck.total }} gated={studyo} />
      </UiScope>
    </ParitySorShell>
  );
}
