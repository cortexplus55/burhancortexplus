import Link from "next/link";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { UserActions } from "@/components/admin/user-actions";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";
import { hasExpired } from "@/lib/payments/subscription";
import {
  ADMIN_USER_PAGE_SIZE,
  adminUsersHref,
  parseAdminPage,
  parseAdminPlanFilter,
  subscriptionPlanKind,
  type AdminPlanFilter,
} from "@/lib/admin/user-list";

export const metadata = { title: "Yönetim · Kullanıcılar" };

export default async function AdminKullanicilarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; page?: string }>;
}) {
  const { user: actor } = await requireAdmin();
  const params = await searchParams;
  const term = (params.q ?? "").trim();
  const plan = parseAdminPlanFilter(params.plan);
  const page = parseAdminPage(params.page);

  const service = createServiceClient();

  /*
    `user_roles!user_roles_user_id_fkey` bilerek açık yazılı.

    O tablonun `profiles`'a iki bağlantısı var: yetkinin sahibi (`user_id`) ve
    yetkiyi veren kişi (`granted_by`). Hangisi olduğu söylenmezse veritabanı
    seçemiyor ve sorgunun tamamı boş dönüyor — hata da vermiyor, yalnızca sıfır
    satır. Bu sayfa uzun süredir bu yüzden boş görünüyordu.
  */
  /*
    E-posta `profiles` içinde tutulmuyor, kimlik tarafında duruyor. Tek
    seferde çekip eşleştiriyoruz — kullanıcı sayısı binleri geçtiğinde
    sayfalama yetmez, kimlik listesi de sayfalanır; şimdilik tek istek
    yeterli ve satır başına sorgu açmaktan çok daha ucuz.
  */
  const emails = new Map<string, string>();
  const { data: authUsers } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const authUser of authUsers?.users ?? []) {
    if (authUser.email) emails.set(authUser.id, authUser.email);
  }

  const { data: subscriptions } = await service
    .from("subscriptions")
    .select("user_id, status, current_period_end, plans(tier, slug)")
    .eq("status", "active");

  const paid = new Map<string, "plus" | "sigma">();
  for (const row of subscriptions ?? []) {
    if (hasExpired(row)) continue;
    const planRow = Array.isArray(row.plans) ? row.plans[0] : row.plans;
    const kind = subscriptionPlanKind({
      tier: planRow && typeof planRow === "object" ? (planRow as { tier?: string | null }).tier : null,
      slug: planRow && typeof planRow === "object" ? (planRow as { slug?: string | null }).slug : null,
    });
    if (!kind) continue;
    const previous = paid.get(row.user_id);
    paid.set(row.user_id, previous === "sigma" || kind === "sigma" ? "sigma" : "plus");
  }

  const plusIds = [...paid.entries()].filter(([, kind]) => kind === "plus").map(([id]) => id);
  const sigmaIds = [...paid.entries()].filter(([, kind]) => kind === "sigma").map(([id]) => id);
  const paidIds = [...paid.keys()];

  let query = service
    .from("profiles")
    .select(
      "id, full_name, grade_level, created_at, suspended_at, credit_wallets(balance), user_roles!user_roles_user_id_fkey(role, revoked_at)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (plan === "plus") {
    query = plusIds.length ? query.in("id", plusIds) : query.eq("id", "00000000-0000-4000-8000-000000000000");
  } else if (plan === "sigma") {
    query = sigmaIds.length ? query.in("id", sigmaIds) : query.eq("id", "00000000-0000-4000-8000-000000000000");
  } else if (plan === "free" && paidIds.length) {
    query = query.not("id", "in", `(${paidIds.join(",")})`);
  }

  if (term) {
    /*
      Destek yazan öğrenci adını değil e-postasını verir (18 Ekim 2026, plan 4.6): arama
      ikisine de bakar. E-posta kimlik tarafında olduğu için eşleşen kimlikleri burada
      bulup sorguya veriyoruz; virgül ve parantez PostgREST listesini bozmasın diye
      yalnız kimlikler gider, aranan metin ada `ilike` olarak.
    */
    const needle = term.toLocaleLowerCase("tr");
    const emailMatches = [...emails.entries()]
      .filter(([, email]) => email.toLocaleLowerCase("tr").includes(needle))
      .map(([id]) => id)
      .slice(0, 200);
    const namePattern = `%${term.replace(/[%_,()]/g, " ")}%`;
    query = emailMatches.length
      ? query.or(`full_name.ilike.${namePattern},id.in.(${emailMatches.join(",")})`)
      : query.ilike("full_name", namePattern);
  }

  const from = (page - 1) * ADMIN_USER_PAGE_SIZE;
  const to = from + ADMIN_USER_PAGE_SIZE - 1;
  query = query.range(from, to);

  const [{ data: profiles, count }, pending] = await Promise.all([
    query,
    countPendingApplications(service),
  ]);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_USER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const rows = (profiles ?? []).map((profile) => {
    const roles = (profile.user_roles ?? [])
      .filter((role) => !role.revoked_at)
      .map((role) => role.role as string);
    const wallet = profile.credit_wallets as { balance?: number } | null;
    const pack = paid.get(profile.id);
    return {
      id: profile.id,
      name: profile.full_name || "İsimsiz kullanıcı",
      email: emails.get(profile.id) ?? "—",
      grade: profile.grade_level,
      created: profile.created_at,
      balance: wallet?.balance ?? 0,
      pack: pack === "sigma" ? "Sigma" : pack === "plus" ? "Plus" : "Ücretsiz",
      isAdmin: roles.includes("admin"),
      isTeacher: roles.includes("teacher") || roles.includes("verified_teacher"),
      isSuspended: Boolean((profile as { suspended_at?: string | null }).suspended_at),
    };
  });

  const filterLabel = plan === "plus" ? "Plus" : plan === "sigma" ? "Sigma" : plan === "free" ? "Ücretsiz" : null;
  const titleBits = [
    "Kayıtlı hesaplar",
    term ? `"${term}" araması` : null,
    filterLabel ? `${filterLabel} filtresi` : null,
  ].filter(Boolean);

  return (
    <AdminShell href="/admin/kullanicilar" pendingApplications={pending}>
      <AdminNote tone="warn">
        Buradaki işlemler <strong>anında</strong> geçerli olur ve kullanıcıya
        haber verilmez. Kredi düşerken bakiyeyi eksiye indiremezsin; yönetici
        yetkisi verdiğin kişi bu panelin tamamını görür.
      </AdminNote>

      <AdminCard
        title={titleBits.join(" · ")}
        desc={`${formatNumber(rows.length)} / ${formatNumber(total)} kayıt · sayfa ${safePage}/${totalPages}. En yeni kayıt üstte.`}
        bodyless
        actions={
          <form method="get" className="flex flex-wrap gap-2">
            <input
              type="search"
              name="q"
              defaultValue={term}
              placeholder="İsim ya da e-postayla ara"
              aria-label="Kullanıcı ara"
              className="adm-input"
            />
            <select
              name="plan"
              defaultValue={plan ?? ""}
              aria-label="Pakete göre süz"
              className="adm-input"
            >
              <option value="">Tüm paketler</option>
              <option value="free">Ücretsiz</option>
              <option value="plus">Plus</option>
              <option value="sigma">Sigma</option>
            </select>
            <button type="submit" className="adm-btn">
              <Search className="h-3.5 w-3.5" aria-hidden />
              Ara
            </button>
          </form>
        }
      >
        {rows.length ? (
          <>
            <AdminTableFrame columns={["Kişi", "Paket", "Kredi", "Yetki", "Kayıt", "İşlem"]}>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium">
                      <Link href={`/admin/kullanicilar/${row.id}`} className="underline">
                        {row.name}
                      </Link>
                    </div>
                    <div className="text-xs text-[var(--adm-muted)]">
                      {row.email}
                      {row.grade ? ` · ${row.grade}` : ""}
                    </div>
                  </td>
                  <td>
                    <AdminBadge tone={row.pack === "Sigma" ? "gold" : row.pack === "Plus" ? "ok" : "mute"}>
                      {row.pack}
                    </AdminBadge>
                  </td>
                  <td className="adm-num">{formatNumber(row.balance)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {row.isAdmin ? <AdminBadge tone="gold">Yönetici</AdminBadge> : null}
                      {row.isTeacher ? <AdminBadge tone="ok">Öğretmen</AdminBadge> : null}
                      {!row.isAdmin && !row.isTeacher ? (
                        <AdminBadge tone="mute">Öğrenci</AdminBadge>
                      ) : null}
                      {row.isSuspended ? <AdminBadge tone="warn">Askıda</AdminBadge> : null}
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
                      isSuspended={row.isSuspended}
                    />
                  </td>
                </tr>
              ))}
            </AdminTableFrame>
            <AdminUsersPager q={term} plan={plan} page={safePage} totalPages={totalPages} />
          </>
        ) : (
          <AdminEmpty title={term || plan ? "Eşleşen hesap yok" : "Henüz kullanıcı yok"}>
            {term || plan
              ? "Aramayı veya süzgeci temizleyip tüm hesapları görebilirsin."
              : "İlk kayıt olduğunda hesaplar burada listelenir."}
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}

function AdminUsersPager({
  q,
  plan,
  page,
  totalPages,
}: {
  q: string;
  plan: AdminPlanFilter | null;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="adm-pager" aria-label="Sayfalar">
      {page > 1 ? (
        <Link href={adminUsersHref({ q, plan, page: page - 1 })} className="adm-btn">
          Önceki
        </Link>
      ) : (
        <span className="adm-btn" aria-disabled>
          Önceki
        </span>
      )}
      <p>
        Sayfa {page} / {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={adminUsersHref({ q, plan, page: page + 1 })} className="adm-btn">
          Sonraki
        </Link>
      ) : (
        <span className="adm-btn" aria-disabled>
          Sonraki
        </span>
      )}
    </nav>
  );
}
