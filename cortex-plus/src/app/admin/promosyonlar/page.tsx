import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { BetaCodeForm, PromoCreateForm, PromoToggle, SharedBetaCodeForm } from "@/components/admin/promo-tools";
import { CampaignForm } from "@/components/admin/campaign-form";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";
import { appOrigin } from "@/lib/app-url";

export const metadata = { title: "Yönetim · Kampanyalar" };
export const dynamic = "force-dynamic";

type PromoRow = {
  id: string;
  code: string;
  credit_amount: number;
  max_redemptions: number | null;
  redemption_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  plus_days?: number | null;
  batch?: string | null;
  promo_redemptions?: { user_id: string; created_at: string }[] | null;
};

export default async function AdminPromosyonlarPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: promos }, { data: campaign }, pending, { count: activeTrials }] = await Promise.all([
    service
      .from("promo_codes")
      .select(
        "id, code, credit_amount, max_redemptions, redemption_count, active, expires_at, created_at, plus_days, batch, promo_redemptions(user_id, created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(400),
    service
      .from("promo_campaigns")
      .select("title, description, href, ends_at")
      .eq("active", true)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    countPendingApplications(service),
    // Denemesi süren öğrenci: kodla açılmış ve dönemi henüz bitmemiş abonelik.
    service
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("trial_until", "is", null)
      .gt("current_period_end", new Date().toISOString()),
  ]);

  const rows = (promos ?? []) as PromoRow[];
  // Tek kişilik beta kodu ile ortak kod (ilk N kişi) ayrı sayılır: ortak kod tek satırda çok kullanım.
  const betaRows = rows.filter((row) => row.plus_days && row.max_redemptions === 1);
  const betaUsed = betaRows.filter((row) => row.redemption_count > 0).length;
  const sharedRows = rows.filter((row) => row.plus_days && row.max_redemptions !== 1);
  const sharedUsed = sharedRows.reduce((sum, row) => sum + row.redemption_count, 0);

  return (
    <AdminShell href="/admin/promosyonlar" pendingApplications={pending}>
      <AdminNote tone="info">
        Öğrenci kodu Abonelik sayfasındaki <strong>Kodun var mı?</strong> kutusuna
        girer (/pay). Kampanya kodu <strong>hediye kredi</strong>, beta kodu{" "}
        <strong>Plus denemesi</strong> tanımlar. Bir kişi aynı kodu bir kez
        kullanabilir. Kodu kapattığında daha önce kullananların hakkı geri alınmaz.
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
        title="Beta kodları (Plus denemesi)"
        desc={`Tek kullanımlık; her kod belirtilen gün kadar Plus açar, bitince hesap ücretsize döner, ücret alınmaz. Bir hesap denemeyi bir kez alır. Şu an: ${formatNumber(betaRows.length)} kod · ${formatNumber(betaUsed)} kullanıldı · ${formatNumber(activeTrials ?? 0)} öğrenci denemede.`}
      >
        <BetaCodeForm origin={appOrigin()} />
      </AdminCard>

      <AdminCard
        title="Ortak beta kodu (sosyal medya)"
        desc={`Tek kod, tek bağlantı: ilk N kişiye Plus denemesi. Kişi başına bir kez; deneme hakkını daha önce kullanan ya da ücretli abonesi olan açamaz. Kontenjan dolunca öğrenci "Bu kodun kullanım hakkı doldu" görür. Şu an: ${formatNumber(sharedRows.length)} ortak kod · ${formatNumber(sharedUsed)} kişi kullandı.`}
      >
        <SharedBetaCodeForm origin={appOrigin()} />
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
            columns={["Kod", "Hediye", "Kullanım", "Kullanan", "Durum", "Oluşturma", "İşlem"]}
          >
            {rows.map((promo) => {
              const limitReached =
                promo.max_redemptions !== null &&
                promo.redemption_count >= promo.max_redemptions;
              const expired =
                promo.expires_at !== null && new Date(promo.expires_at) < new Date();

              return (
                <tr key={promo.id}>
                  <td className="font-mono font-medium">
                    {promo.code}
                    {promo.batch ? <span className="block text-xs font-normal text-[var(--adm-muted)]">{promo.batch}</span> : null}
                  </td>
                  <td className="adm-num">
                    {promo.plus_days ? `${promo.plus_days} gün Plus` : `${formatNumber(promo.credit_amount)} kredi`}
                  </td>
                  <td className="adm-num">
                    {formatNumber(promo.redemption_count)}
                    {promo.max_redemptions !== null
                      ? ` / ${formatNumber(promo.max_redemptions)}`
                      : " / sınırsız"}
                  </td>
                  <td className="text-xs">
                    {(promo.promo_redemptions ?? []).slice(0, 3).map((redemption) => (
                      <Link
                        key={redemption.user_id}
                        href={`/admin/kullanicilar/${redemption.user_id}`}
                        className="block underline"
                      >
                        {formatDate(redemption.created_at)}
                      </Link>
                    ))}
                    {(promo.promo_redemptions ?? []).length > 3 ? `+${(promo.promo_redemptions ?? []).length - 3}` : null}
                    {(promo.promo_redemptions ?? []).length === 0 ? "—" : null}
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
