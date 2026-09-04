import { Search } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { UserActions } from "@/components/admin/user-actions";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · Kullanıcılar" };

const PAGE_SIZE = 50;

export default async function AdminKullanicilarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { user: actor } = await requireAdmin();
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  const service = createServiceClient();

  /*
    `user_roles!user_roles_user_id_fkey` bilerek açık yazılı.

    O tablonun `profiles`'a iki bağlantısı var: yetkinin sahibi (`user_id`) ve
    yetkiyi veren kişi (`granted_by`). Hangisi olduğu söylenmezse veritabanı
    seçemiyor ve sorgunun tamamı boş dönüyor — hata da vermiyor, yalnızca sıfır
    satır. Bu sayfa uzun süredir bu yüzden boş görünüyordu.
  */
  let query = service
    .from("profiles")
    .select(
      "id, full_name, grade_level, created_at, credit_wallets(balance), user_roles!user_roles_user_id_fkey(role, revoked_at)",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (term) query = query.ilike("full_name", `%${term}%`);

  const [{ data: profiles }, pending] = await Promise.all([
    query,
    countPendingApplications(service),
  ]);

  /*
    E-posta `profiles` içinde tutulmuyor, kimlik tarafında duruyor. Tek
    seferde çekip eşleştiriyoruz — bu, kullanıcı sayısı binleri geçtiğinde
    sayfalama ister; şimdilik tek istek yeterli ve satır başına sorgu
    açmaktan çok daha ucuz.
  */
  const emails = new Map<string, string>();
  const { data: authUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const authUser of authUsers?.users ?? []) {
    if (authUser.email) emails.set(authUser.id, authUser.email);
  }

  const rows = (profiles ?? []).map((profile) => {
    const roles = (profile.user_roles ?? [])
      .filter((role) => !role.revoked_at)
      .map((role) => role.role as string);
    const wallet = profile.credit_wallets as { balance?: number } | null;
    return {
      id: profile.id,
      name: profile.full_name || "İsimsiz kullanıcı",
      email: emails.get(profile.id) ?? "—",
      grade: profile.grade_level,
      created: profile.created_at,
      balance: wallet?.balance ?? 0,
      isAdmin: roles.includes("admin"),
      isTeacher: roles.includes("teacher") || roles.includes("verified_teacher"),
    };
  });

  return (
    <AdminShell href="/admin/kullanicilar" pendingApplications={pending}>
      <AdminNote tone="warn">
        Buradaki işlemler <strong>anında</strong> geçerli olur ve kullanıcıya
        haber verilmez. Kredi düşerken bakiyeyi eksiye indiremezsin; yönetici
        yetkisi verdiğin kişi bu panelin tamamını görür.
      </AdminNote>

      <AdminCard
        title={`Kayıtlı hesaplar${term ? ` · "${term}" araması` : ""}`}
        desc={`${formatNumber(rows.length)} kayıt gösteriliyor. En yeni kayıt üstte.`}
        bodyless
        actions={
          <form method="get" className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={term}
              placeholder="İsimle ara"
              aria-label="Kullanıcı ara"
              className="adm-input"
            />
            <button type="submit" className="adm-btn">
              <Search className="h-3.5 w-3.5" aria-hidden />
              Ara
            </button>
          </form>
        }
      >
        {rows.length ? (
          <AdminTableFrame columns={["Kişi", "Kredi", "Yetki", "Kayıt", "İşlem"]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-[var(--adm-muted)]">
                    {row.email}
                    {row.grade ? ` · ${row.grade}` : ""}
                  </div>
                </td>
                <td className="adm-num">{formatNumber(row.balance)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {row.isAdmin ? <AdminBadge tone="gold">Yönetici</AdminBadge> : null}
                    {row.isTeacher ? <AdminBadge tone="ok">Öğretmen</AdminBadge> : null}
                    {!row.isAdmin && !row.isTeacher ? (
                      <AdminBadge tone="mute">Öğrenci</AdminBadge>
                    ) : null}
                  </div>
                </td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {formatDate(row.created)}
                </td>
                <td>
                  <UserActions
                    userId={row.id}
                    isAdmin={row.isAdmin}
                    isTeacher={row.isTeacher}
                    isSelf={row.id === actor.id}
                  />
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title={term ? "Eşleşen hesap yok" : "Henüz kullanıcı yok"}>
            {term
              ? "Aramayı temizleyip tüm hesapları görebilirsin."
              : "İlk kayıt olduğunda hesaplar burada listelenir."}
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
