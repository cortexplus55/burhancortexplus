import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Promptlar" };

export default async function AdminPromptlarPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: versions } = await service
    .from("prompt_versions")
    .select("key, version, active, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell variant="admin" title="Prompt versiyonları">
      <p className="mb-4 text-sm text-muted-foreground">
        Sistem promptları veritabanında versiyonlanır; üretimde aktif sürüm kullanılır.
      </p>
      <AdminTable
        columns={["Anahtar", "Versiyon", "Aktif", "Tarih"]}
        rows={(versions ?? []).map((version) => [
          version.key,
          version.version,
          version.active ? "Evet" : "Hayır",
          formatDate(version.created_at),
        ])}
        emptyMessage="Henüz prompt versiyonu kaydedilmedi."
      />
    </AppShell>
  );
}
