import { ParitySorShell } from "@/components/parity/sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { loadGeneralReviewDue } from "@/lib/learning/general-review";

export const metadata = { title: "Çalışma Stüdyosu" };

export default async function AraclarPage() {
  const { supabase, user } = await requireStudentArea();
  const [shell, deck] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadGeneralReviewDue(createServiceClient(), user.id),
  ]);

  return (
    <ParitySorShell {...shell}>
      <ToolsHub deck={{ dueCount: deck.dueCount, total: deck.total }} />
    </ParitySorShell>
  );
}
