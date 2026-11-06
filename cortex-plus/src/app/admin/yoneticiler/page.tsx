import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { AdminGrantForm, AdminRevokeButton } from "@/components/admin/admin-team-controls";
import { requireFounderPage } from "@/lib/auth/admin-guard";
import { ADMIN_ROLE_BADGE } from "@/lib/auth/admin-role";
import { mergeTeamRows, type AdminTeamMember } from "@/lib/admin/admin-team";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · Yöneticiler ve Yetkiler" };
export const dynamic = "force-dynamic";

/** "👑 Yöneticiler ve Yetkiler" (yalnız kurucu): etkin yöneticiler, e-postayla ekleme, tek tıkla geri alma. */
export default async function AdminTeamPage() {
  const { user } = await requireFounderPage();
  const service = createServiceClient();

  const { data: roleRows, error } = await service
    .from("user_roles")
    .select("user_id, role, granted_at, granted_by")
    .in("role", ["admin", "founder"])
    .is("revoked_at", null);

  const merged = mergeTeamRows(
    (roleRows ?? []).map((row) => ({
      user_id: String(row.user_id),
      role: String(row.role),
      granted_at: String(row.granted_at),
      granted_by: (row.granted_by as string | null) ?? null,
    })),
  );

  const ids = [...new Set([...merged.map((row) => row.userId), ...merged.flatMap((row) => (row.grantedBy ? [row.grantedBy] : []))])];
  const { data: profiles } = ids.length
    ? await service.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const nameOf = new Map((profiles ?? []).map((row) => [String(row.id), (row.full_name as string | null) || "İsimsiz"]));

  const emails = await Promise.all(
    merged.map(async (row) => {
      const { data } = await service.auth.admin.getUserById(row.userId).catch(() => ({ data: null }));
      return data?.user?.email ?? "—";
    }),
  );

  const members: AdminTeamMember[] = merged.map((row, index) => ({
    userId: row.userId,
    role: row.role,
    name: nameOf.get(row.userId) ?? "İsimsiz",
    email: emails[index] ?? "—",
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy ? (nameOf.get(row.grantedBy) ?? "—") : null,
  }));

  return (
    <AdminShell href="/admin/yoneticiler">
      <AdminNote tone="info">
        Yönetici destek talepleri, soru bildirimleri ve kullanıcı listesi gibi günlük işleri yapar. Paket fiyatı,
        kredi kuralı, harcama tavanı, kur, özellik anahtarları ve yönetici ekleme <strong>yalnız kurucuya</strong> açık.
        Geri alınan yetkinin satırı silinmez; her işlem İşlem Kayıtları&apos;na yazılır.
      </AdminNote>

      <AdminCard title="Yönetici ekle" desc="Kişinin önce Cortex Plus'ta hesap açmış olması gerekir; buradan yeni hesap oluşturulmaz.">
        <AdminGrantForm />
      </AdminCard>

      <AdminCard title="Etkin yöneticiler" desc={`${members.length} kişi panele girebiliyor.`} bodyless>
        {error ? (
          <AdminEmpty title="Liste okunamadı">Yetki tablosu şu an okunamıyor; sayfayı yenile.</AdminEmpty>
        ) : members.length ? (
          <AdminTableFrame columns={["Ad", "E-posta", "Rol", "Veriliş", "Veren", ""]}>
            {members.map((member) => (
              <tr key={member.userId}>
                <td className="font-medium">{member.name}</td>
                <td className="break-all">{member.email}</td>
                <td>
                  <AdminBadge tone={member.role === "founder" ? "gold" : "mute"}>{ADMIN_ROLE_BADGE[member.role]}</AdminBadge>
                </td>
                <td>{formatDate(member.grantedAt)}</td>
                <td>{member.grantedBy ?? "—"}</td>
                <td className="text-right">
                  {member.role === "founder" || member.userId === user.id ? (
                    <span className="text-xs text-[var(--adm-muted)]">
                      {member.role === "founder" ? "Kurucu çıkarılamaz" : "Kendini çıkaramazsın"}
                    </span>
                  ) : (
                    <AdminRevokeButton userId={member.userId} name={member.name} />
                  )}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Yönetici yok">Henüz kimseye yönetici yetkisi verilmedi.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
