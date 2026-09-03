import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { UygulamalarLabGrid } from "@/components/parity/uygulamalar-lab-client";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { toStatMap } from "@/lib/parity/lab-stats";

export const metadata = { title: "Öğrenme uygulamaları" };

export default async function UygulamalarPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Toplu sayılar herkese görünür olmalı ama tekil oynanma satırları değil;
  // bu yüzden RLS'i aşan güvenlik-tanımlayıcı fonksiyondan okunuyor.
  const { data: stats } = await supabase.rpc("lab_app_stats");

  return (
    <AstraParitySorShell {...shell}>
      <UygulamalarLabGrid stats={toStatMap(stats)} />
    </AstraParitySorShell>
  );
}
