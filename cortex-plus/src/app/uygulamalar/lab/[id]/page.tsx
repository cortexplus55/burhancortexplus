import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { LAB_APPS } from "@/lib/parity/lab-apps";
import { LabAppBody } from "@/components/lab/lab-app-body";

export default async function LabDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalog = LAB_APPS.find((a) => a.id === id);

  return (
    <AppShell title={catalog?.title ?? "Uygulama"}>
      <div className="space-y-4">
        <Link
          href="/uygulamalar"
          className="text-sm text-[var(--astra-primary)]"
        >
          ← Uygulamalar
        </Link>
        <LabAppBody id={id} />
      </div>
    </AppShell>
  );
}
