import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { PromoCreateForm, PromoToggle } from "@/components/admin/promo-tools";
import { CampaignForm } from "@/components/admin/campaign-form";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · Kampanyalar" };

export default async function AdminPromosyonlarPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: promos }, { data: campaign }, pending] = await Promise.all([
    service
      .from("promo_codes")
      .select("id, code, credit_amount, max_redemptions, redemption_count, active, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("promo_campaigns")
      .select("title, description, href, ends_at")
      .eq("active", true)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    countPendingApplications(service),
  ]);

  const rows = promos ?? [];

  return (
    <AdminShell href="/admin/promosyonlar" pendingApplications={pending}>
      <AdminNote tone="info">
        Kampanya kodu, giren kişiye <strong>hediye kredi</strong> tanımlar. Bir
        kişi aynı kodu bir kez kullanabilir. Kodu kapattığında daha önce
        kullananların kredisi geri alınmaz.
      </AdminNote>

      <AdminCard
        title="Ana ekran duyuru bandı"
        desc="Ücretsiz kullanıcıların ana ekranında görünen geri sayımlı şerit. Bitiş tarihi geçtiğinde kendiliğinden kaybolur; süresiz bant yoktur."
      >
        <CampaignForm
          current={
            campaign
              ? {
                  title: campaign.title,
                  description: campaign.description,
                  href: campaign.href,
                  endsAt: campaign.ends_at,
                }
              : null
          }
        />
      </AdminCard>

      <AdminCard
        title="Yeni kod oluştur"
        desc="Kod yalnızca harf, rakam ve tire içerebilir; küçük yazsan da büyük harfe çevrilir."
      >
        <PromoCreateForm />
      </AdminCard>

      <AdminCard title="Kodlar" desc="En yeni kod üstte." bodyless>
        {rows.length ? (
          <AdminTableFrame
            columns={["Kod", "Hediye", "Kullanım", "Durum", "Oluşturma", "İşlem"]}
          >
            {rows.map((promo) => {
              const limitReached =
                promo.max_redemptions !== null &&
                promo.redemption_count >= promo.max_redemptions;
              const expired =
                promo.expires_at !== null && new Date(promo.expires_at) < new Date();

              return (
                <tr key={promo.id}>
                  <td className="font-mono font-medium">{promo.code}</td>
                  <td className="adm-num">{formatNumber(promo.credit_amount)} kredi</td>
                  <td className="adm-num">
                    {formatNumber(promo.redemption_count)}
                    {promo.max_redemptions !== null
                      ? ` / ${formatNumber(promo.max_redemptions)}`
                      : " / sınırsız"}
                  </td>
                  <td>
                    {!promo.active ? (
                      <AdminBadge tone="mute">Kapalı</AdminBadge>
                    ) : expired ? (
                      <AdminBadge tone="bad">Süresi doldu</AdminBadge>
                    ) : limitReached ? (
                      <AdminBadge tone="warn">Kontenjan doldu</AdminBadge>
                    ) : (
                      <AdminBadge tone="ok">Kullanılabilir</AdminBadge>
                    )}
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {formatDate(promo.created_at)}
                  </td>
                  <td>
                    <PromoToggle promoId={promo.id} active={promo.active} />
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz kod yok">
            Yukarıdaki formdan ilk kampanya kodunu oluşturabilirsin.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
