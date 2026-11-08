import { ParitySorShell } from "@/components/parity/sor-shell";
import { MyPrepsView } from "@/components/parity/my-preps-view";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadPrepCards } from "@/lib/learning/prep-cards";
import { pathSkipKinds } from "@/lib/billing/node-free-meter";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Sınav hazırlıklarım" };
export const dynamic = "force-dynamic";

/** Bütün hazırlıklar, Yaklaşan / Geçmiş (kıyas ürünü, 1 Ekim 2026). */
export default async function MyPrepsPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const cards = await pathSkipKinds(createServiceClient(), user.id)
      .catch(() => new Set<string>())
      .then((skip) => loadPrepCards(supabase, user.id, 100, skip));

  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <MyPrepsView cards={cards} userInitial={shell.userInitial} />
    </ParitySorShell>
  );
}
