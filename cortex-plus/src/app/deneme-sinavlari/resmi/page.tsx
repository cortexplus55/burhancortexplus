import { ParitySorShell } from "@/components/parity/sor-shell";
import { OfficialExamsPage } from "@/components/parity/exam-catalog-pages";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Resmî sınavlar" };
export const dynamic = "force-dynamic";

/** Sınavlar → RESMÎ SINAVLAR kutusu (Astra'da ayrı sayfa, 17 Ekim 2026). */
export default async function OfficialExamsRoute() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <OfficialExamsPage />
    </ParitySorShell>
  );
}
