import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { BirimDonusturucu } from "@/components/lab/tools/birim-donusturucu";
import { DenklemCozucu } from "@/components/lab/tools/denklem-cozucu";
import { IntegralHesaplayici } from "@/components/lab/tools/integral-hesaplayici";
import { PeriyodikTablo } from "@/components/lab/tools/periyodik-tablo";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { findTool } from "@/lib/parity/tools";

const TOOL_COMPONENTS: Record<string, () => React.ReactNode> = {
  denklem: DenklemCozucu,
  integral: IntegralHesaplayici,
  periyodik: PeriyodikTablo,
  birim: BirimDonusturucu,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: findTool(id)?.title ?? "Araç" };
}

export default async function AracPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const Component = TOOL_COMPONENTS[id];
  // Katalogda olmayan ya da sayfada açılmayan kimlik için 404.
  if (!Component) notFound();

  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      <Component />
    </AstraParitySorShell>
  );
}
