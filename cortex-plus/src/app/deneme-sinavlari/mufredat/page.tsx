import { ParitySorShell } from "@/components/parity/sor-shell";
import { CurriculumPage } from "@/components/parity/exam-catalog-pages";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Müfredat" };
export const dynamic = "force-dynamic";

/** Sınavlar → MÜFREDAT kutusu (Astra'da ayrı sayfa, 17 Ekim 2026). */
export default async function CurriculumRoute() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const { data: profile } = await supabase.from("profiles").select("grade_level").eq("id", user.id).maybeSingle();
  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <CurriculumPage gradeLevel={(profile?.grade_level as string | null) ?? null} />
    </ParitySorShell>
  );
}
