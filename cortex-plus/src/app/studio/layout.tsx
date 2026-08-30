import { AppShell } from "@/components/layout/app-shell";
import { requireStudentArea } from "@/lib/auth/session";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStudentArea();
  return <AppShell accountStrip={false}>{children}</AppShell>;
}
