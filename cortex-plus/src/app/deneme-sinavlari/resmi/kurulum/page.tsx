import { ParitySorShell } from "@/components/parity/sor-shell";
import { OfficialSetupFlow } from "@/components/parity/official-setup-flow";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isSetupExam, isYksAlan } from "@/lib/curriculum/yks-alan";

export const metadata = { title: "Resmî sınav kurulumu" };
export const dynamic = "force-dynamic";

/** Sınavlar → Resmî → YKS / LGS: kayıt defteri destekli kurulum (1 Kasım 2026). */
export default async function OfficialSetupRoute({
  searchParams,
}: {
  searchParams: Promise<{ sinav?: string; alan?: string; konu?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const params = await searchParams;
  const exam = isSetupExam(params.sinav) ? params.sinav : null;
  const alan = exam === "yks" && isYksAlan(params.alan) ? params.alan : null;
  // Konu seçili açılış (13 Kasım 2026, turdan kayda süreklilik): ağaçta aranacak tek sözcük; kısa ve harf olmalı.
  const topic = exam && typeof params.konu === "string" && /^[\p{L} ]{3,40}$/u.test(params.konu.trim()) ? params.konu.trim() : null;
  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari/resmi">
      <OfficialSetupFlow initialExam={exam} initialAlan={alan} initialTopic={topic} />
    </ParitySorShell>
  );
}
