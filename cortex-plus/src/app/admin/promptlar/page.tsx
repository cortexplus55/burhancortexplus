import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { PromptActivate } from "@/components/admin/admin-rows";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · AI talimatları" };

export default async function AdminAiTalimatlariPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: prompts }, pending] = await Promise.all([
    service
      .from("prompt_versions")
      .select("id, key, version, content, active, created_at")
      .order("key")
      .order("version", { ascending: false }),
    countPendingApplications(service),
  ]);

  const rows = prompts ?? [];

  return (
    <AdminShell href="/admin/promptlar" pendingApplications={pending}>
      <AdminNote tone="warn">
        Talimat, yapay zekâya &ldquo;nasıl davran&rdquo; diyen metindir —
        öğretmenin üslubunu, adım adım anlatıp anlatmayacağını bunlar belirler.
        Yayına aldığın sürüm <strong>bir sonraki sorudan itibaren</strong>{" "}
        geçerli olur. Her başlıkta aynı anda yalnızca bir sürüm yayında
        kalabilir.
      </AdminNote>

      <AdminCard
        title="Talimat sürümleri"
        desc="Aynı başlığın birden çok sürümü olabilir; hangisinin yayında olduğunu buradan değiştirirsin."
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame columns={["Başlık", "Sürüm", "İçerik (başlangıcı)", "Eklenme", "Durum"]}>
            {rows.map((prompt) => (
              <tr key={prompt.id}>
                <td className="font-medium">{prompt.key}</td>
                <td className="adm-num">v{prompt.version}</td>
                <td className="max-w-md truncate text-xs text-[var(--adm-muted)]">
                  {prompt.content.slice(0, 120)}
                  {prompt.content.length > 120 ? "…" : ""}
                </td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {formatDate(prompt.created_at)}
                </td>
                <td>
                  <PromptActivate promptId={prompt.id} active={prompt.active} />
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Kayıtlı talimat yok">
            Talimatlar veritabanına eklendiğinde burada listelenir; şu an kodda
            tanımlı varsayılanlar kullanılıyor.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
