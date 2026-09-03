import Link from "next/link";
import { notFound } from "next/navigation";
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
  // Katalogda olmayan kimlik icin bos sayfa yerine 404.
  if (!LAB_APPS.some((a) => a.id === id)) notFound();

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-4">
        <Link href="/uygulamalar" className="text-sm text-[var(--astra-primary)]">
          ← Uygulamalar
        </Link>
        {/* Baslik simulasyonun kendi kabugunda; burada yinelemek gereksiz. */}
        <LabAppBody id={id} />
      </div>
    </AstraParitySorShell>
  );
}
