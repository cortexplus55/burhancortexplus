import { ParitySorShell } from "@/components/parity/sor-shell";
import { SohbetlerList } from "@/components/parity/sohbetler-list";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";
import { loadConversationGroups } from "@/lib/tutor/conversation-groups";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-kutuphane.css";

export const metadata = { title: "Sohbetler" };

export default async function SohbetlerPage() {
  const { supabase, user } = await requireStudentArea();
  // Faz 11 (`ui.v2.kutuphane`): sarmalayıcı sayfanın içinde (bu rotanın loading.tsx'i var; düzen eklenmedi).
  // Faz 11 (teacher.v2): bayrak açıkken liste hazırlığa göre gruplu; okuma düşerse kapalı (bugünkü liste).
  const [shell, kutuphane, teacherV2] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    uiV2("kutuphane", user.id),
    isFeatureEnabled(createServiceClient(), TEACHER_V2_FLAG, user.id).catch(() => false),
  ]);

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(80);

  const items = (conversations ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
  // Bağ tablosu yoksa ya da okunamazsa `null`: bugünkü gün gruplu liste aynen.
  const groups = teacherV2
    ? await loadConversationGroups(createServiceClient(), user.id, items).catch(() => null)
    : null;

  return (
    <ParitySorShell {...shell}>
      <UiScope keys={kutuphane ? ["kutuphane"] : []}>
      <SohbetlerList
        now={new Date().toISOString()}
        items={items}
        groups={groups ?? undefined}
      />
      </UiScope>
    </ParitySorShell>
  );
}
