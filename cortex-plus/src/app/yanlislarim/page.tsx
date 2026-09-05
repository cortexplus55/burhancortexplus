import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { MistakeNotebookView } from "@/components/parity/mistake-notebook-view";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  countMistakes,
  loadOpenMistakes,
  toClientGroups,
} from "@/lib/learning/mistake-notebook";

export const metadata = { title: "Yanlış defteri" };

/**
 * Oturum gerektiren sayfa: `loading.tsx` yok, `Suspense` yok. Bu projede
 * o sınır sayfayı boşaltıyor — AGENTS.md'deki "Suspense sınırı" bölümü.
 */
export default async function YanlislarimPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [groups, counts] = await Promise.all([
    loadOpenMistakes(supabase, user.id),
    countMistakes(supabase, user.id),
  ]);

  return (
    <AstraParitySorShell {...shell}>
      <MistakeNotebookView
        groups={toClientGroups(groups)}
        masteredCount={counts.mastered}
      />
    </AstraParitySorShell>
  );
}
