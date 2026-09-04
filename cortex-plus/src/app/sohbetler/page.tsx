import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { SohbetlerList } from "@/components/parity/sohbetler-list";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sohbetler" };

export default async function SohbetlerPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(80);

  return (
    <AstraParitySorShell {...shell}>
      <SohbetlerList
        items={(conversations ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          updatedAt: row.updated_at,
        }))}
      />
    </AstraParitySorShell>
  );
}
