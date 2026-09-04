import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { PlanEditor } from "@/components/admin/plan-editor";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatNumber, formatTry } from "@/lib/format";

export const metadata = { title: "Yönetim · Paketler" };

export default async function AdminPaketlerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: plans }, pending] = await Promise.all([
    service
      .from("plans")
      .select("id, slug, name, description, price_try, credit_amount, is_premium, active, sort_order")
      .order("sort_order"),
    countPendingApplications(service),
  ]);

  const rows = plans ?? [];

  return (
    <AdminShell href="/admin/paketler" pendingApplications={pending}>
      <AdminNote tone="warn">
        Buradaki fiyat <strong>fiyatlandırma sayfasında anında</strong> görünür.
        Satın alma sırasındaki kişileri etkilememek için değişikliği yoğun
        saatlerde yapmamak iyi olur. &ldquo;Satışta&rdquo; işaretini kaldırdığın
        paket listeden düşer ama daha önce satın alanlar etkilenmez.
      </AdminNote>

      <AdminCard
        title="Satıştaki planlar"
        desc="Fiyatı, verdiği krediyi ve satışta olup olmadığını buradan değiştirebilirsin."
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame columns={["Paket", "Tür", "Şu anki fiyat", "Durum", "Düzenle"]}>
            {rows.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-xs text-[var(--adm-muted)]">
                    {plan.description || plan.slug}
                  </div>
                </td>
                <td>
                  {plan.is_premium ? (
                    <AdminBadge tone="gold">Abonelik</AdminBadge>
                  ) : (
                    <AdminBadge tone="mute">Kredi paketi</AdminBadge>
                  )}
                </td>
                <td className="adm-num">
                  {formatTry(plan.price_try)}
                  <span className="ml-2 text-xs text-[var(--adm-muted)]">
                    {formatNumber(plan.credit_amount)} kredi
                  </span>
                </td>
                <td>
                  {plan.active ? (
                    <AdminBadge tone="ok">Satışta</AdminBadge>
                  ) : (
                    <AdminBadge tone="mute">Kapalı</AdminBadge>
                  )}
                </td>
                <td>
                  <PlanEditor
                    planId={plan.id}
                    price={plan.price_try}
                    credits={plan.credit_amount}
                    active={plan.active}
                  />
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Tanımlı paket yok">
            Paketler veritabanına eklendiğinde burada listelenir.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
