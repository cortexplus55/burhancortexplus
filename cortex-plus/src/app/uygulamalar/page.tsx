import { AppShell } from "@/components/layout/app-shell";
import { UygulamalarLabGrid } from "@/components/parity/uygulamalar-lab-client";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Uygulamalar" };

export default async function UygulamalarPage() {
  await requireUser();
  return (
    <AppShell title="Uygulamalar">
      <UygulamalarLabGrid />
    </AppShell>
  );
}
