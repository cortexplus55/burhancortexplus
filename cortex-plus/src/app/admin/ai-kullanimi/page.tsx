import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "AI kullanımı" };

export default async function AdminAiKullanimiPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: events } = await service
    .from("ai_usage_events")
    .select("action_code, model, tokens_in, tokens_out")
    .order("created_at", { ascending: false })
    .limit(500);

  const byAction = new Map<
    string,
    { count: number; tokensIn: number; tokensOut: number; model: string }
  >();

  for (const event of events ?? []) {
    const key = `${event.action_code}|${event.model}`;
    const entry = byAction.get(key) ?? {
      count: 0,
      tokensIn: 0,
      tokensOut: 0,
      model: event.model,
    };
    entry.count += 1;
    entry.tokensIn += event.tokens_in ?? 0;
    entry.tokensOut += event.tokens_out ?? 0;
    byAction.set(key, entry);
  }

  return (
    <AppShell variant="admin" title="AI kullanımı">
      <AdminTable
        columns={["İşlem", "Model", "Çağrı", "Girdi token", "Çıktı token"]}
        rows={[...byAction.entries()].map(([key, entry]) => [
          key.split("|")[0],
          entry.model,
          formatNumber(entry.count),
          formatNumber(entry.tokensIn),
          formatNumber(entry.tokensOut),
        ])}
        emptyMessage="Henüz AI kullanımı kaydedilmedi."
      />
    </AppShell>
  );
}
