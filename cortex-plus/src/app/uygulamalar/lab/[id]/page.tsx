import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { LabAppBody } from "@/components/lab/lab-app-body";
import { LAB_APPS } from "@/lib/parity/lab-apps";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export default async function LabDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const catalog = LAB_APPS.find((a) => a.id === id);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-4">
        <Link href="/uygulamalar" className="text-sm text-[var(--astra-primary)]">
          ← Uygulamalar
        </Link>
        <h1 className="text-xl font-semibold">{catalog?.title ?? "Uygulama"}</h1>
        <LabAppBody id={id} />
      </div>
    </AstraParitySorShell>
  );
}
