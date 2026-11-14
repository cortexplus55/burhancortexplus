import { ParitySorShell } from "@/components/parity/sor-shell";
import { SohbetlerList } from "@/components/parity/sohbetler-list";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-kutuphane.css";

export const metadata = { title: "Sohbetler" };

export default async function SohbetlerPage() {
  const { supabase, user } = await requireStudentArea();
  // Faz 11 (`ui.v2.kutuphane`): sarmalayıcı sayfanın içinde (bu rotanın loading.tsx'i var; düzen eklenmedi).
  const [shell, kutuphane] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    uiV2("kutuphane", user.id),
  ]);

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(80);

  return (
    <ParitySorShell {...shell}>
      <UiScope keys={kutuphane ? ["kutuphane"] : []}>
      <SohbetlerList
        now={new Date().toISOString()}
        items={(conversations ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          updatedAt: row.updated_at,
        }))}
      />
      </UiScope>
    </ParitySorShell>
  );
}
