import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { AppCreator } from "@/components/parity/app-creator";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Uygulama oluştur" };

export default async function UygulamaOlusturPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Bedel sunucudan okunuyor: kredi kuralları veritabanında yaşıyor, arayüzde
  // sabit bir sayı yazmak ikisinin ayrışmasına açık kapı bırakırdı.
  const { data: rule } = await supabase
    .from("credit_rules")
    .select("credit_cost")
    .eq("action_code", "LAB_APP_GENERATE")
    .eq("active", true)
    .maybeSingle();

  return (
    <AstraParitySorShell {...shell}>
      <AppCreator creditCost={(rule?.credit_cost as number | null) ?? null} />
    </AstraParitySorShell>
  );
}
