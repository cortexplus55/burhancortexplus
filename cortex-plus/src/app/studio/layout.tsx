import { AppShell } from "@/components/layout/app-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-studyo.css";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireStudentArea();
  // Faz 8: `ui.v2.studyo` açıkken yeni görünümün sarmalayıcısı (kapalıyken DOM aynı).
  const studyo = await uiV2("studyo", user.id);
  return (
    <AppShell>
      <UiScope keys={studyo ? ["studyo"] : []}>{children}</UiScope>
    </AppShell>
  );
}
