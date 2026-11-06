import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { BetaCodeForm, PromoCreateForm, PromoToggle, SharedBetaCodeForm } from "@/components/admin/promo-tools";
import { CampaignForm } from "@/components/admin/campaign-form";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { promoGrantLabel, promoStatus, promoUsage } from "@/lib/billing/promo-form";
import { formatDate, formatNumber } from "@/lib/format";
import { appOrigin } from "@/lib/app-url";

export const metadata = { title: "Yönetim · Promosyon ve Hediye Kodları" };
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
  await requireAdminPage();
  const service = createServiceClient();
  const now = new Date();

  const [{ data: promos }, { data: campaign }, { count: activeTrials }] = await Promise.all([
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
      .gt("ends_at", now.toISOString())
      .order("ends_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Denemesi süren öğrenci: kodla açılmış ve dönemi henüz bitmemiş abonelik.
    service
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("trial_until", "is", null)
      .gt("current_period_end", now.toISOString()),
  ]);

  const rows = (promos ?? []) as PromoRow[];
  // Tek kişilik beta kodu ile ortak kod (ilk N kişi) ayrı sayılır: ortak kod tek satırda çok kullanım.
  const betaRows = rows.filter((row) => row.plus_days && row.max_redemptions === 1);
  const betaUsed = betaRows.filter((row) => row.redemption_count > 0).length;
  const sharedRows = rows.filter((row) => row.plus_days && row.max_redemptions !== 1);
  const sharedUsed = sharedRows.reduce((sum, row) => sum + row.redemption_count, 0);
  const activeCount = rows.filter((row) => promoStatus(row, now).label === "Aktif").length;
  const origin = appOrigin();

  return (
    <AdminShell href="/admin/promosyonlar">
      <AdminNote tone="info">
        Öğrenci kodu Abonelik sayfasındaki <strong>Kodun var mı?</strong> kutusuna girer ya da{" "}
        <strong>/pay?kod=…</strong> bağlantısını açar. Bir kod ya <strong>gün Plus</strong> (deneme; bitince hesap
        ücretsize döner, ücret alınmaz) ya da <strong>hediye kredi</strong> verir. Bir kişi aynı kodu bir kez kullanır;
        Plus denemesi hesap başına birdir. Kodu pasif yaptığında daha önce kullananların hakkı geri alınmaz. Kod
        oluşturmak ve açıp kapatmak yöneticiye açık; her işlem kayda geçer.
      </AdminNote>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">Aktif kod</span>
          <span className="adm-stat-value">{formatNumber(activeCount)}</span>
          <span className="adm-stat-hint">Toplam {formatNumber(rows.length)} kod</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Denemedeki öğrenci</span>
          <span className="adm-stat-value">{formatNumber(activeTrials ?? 0)}</span>
          <span className="adm-stat-hint">Kodla açılmış, süresi bitmemiş Plus</span>
        </div>
      </div>

      <AdminCard
        title="Yeni kod oluştur"
        desc="Kod adını boş bırakırsan karışan harf içermeyen bir kod üretilir. Yazdığın kod büyük harfe çevrilir; yalnız harf, rakam ve tire."
      >
        <PromoCreateForm origin={origin} />
      </AdminCard>

      <AdminCard
        title="Beta kodları (toplu, tek kişilik Plus denemesi)"
        desc={`Her kod tek kişilik; belirtilen gün kadar Plus açar. Şu an: ${formatNumber(betaRows.length)} kod · ${formatNumber(betaUsed)} kullanıldı.`}
      >
        <BetaCodeForm origin={origin} />
      </AdminCard>

      <AdminCard
        title="Ortak beta kodu (sosyal medya)"
        desc={`Tek kod, tek bağlantı: ilk N kişiye Plus denemesi. Deneme hakkını daha önce kullanan ya da ücretli abonesi olan açamaz; kontenjan dolunca öğrenci "Bu kodun kullanım hakkı doldu" görür. Şu an: ${formatNumber(sharedRows.length)} ortak kod · ${formatNumber(sharedUsed)} kişi kullandı.`}
      >
        <SharedBetaCodeForm origin={origin} />
      </AdminCard>

      <AdminCard title="Kodlar" desc="En yeni kod üstte. Aktif / Pasif tek tıkla değişir." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Kod", "Hak", "Kullanım", "Son gün", "Durum", "Oluşturma", "Kullananlar", "İşlem"]}>
            {rows.map((promo) => {
              const status = promoStatus(promo, now);
              const redemptions = promo.promo_redemptions ?? [];
              return (
                <tr key={promo.id}>
                  <td className="font-mono font-medium">
                    {promo.code}
                    {promo.batch ? <span className="block text-xs font-normal text-[var(--adm-muted)]">Grup: {promo.batch}</span> : null}
                  </td>
                  <td className="adm-num">{promoGrantLabel(promo)}</td>
                  <td className="adm-num">{promoUsage(promo)}</td>
                  <td className="adm-num text-xs">{promo.expires_at ? formatDate(promo.expires_at) : "Süresiz"}</td>
                  <td>
                    <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">{formatDate(promo.created_at)}</td>
                  <td className="text-xs">
                    {redemptions.slice(0, 3).map((redemption) => (
                      <Link key={redemption.user_id} href={`/admin/kullanicilar/${redemption.user_id}`} className="block underline">
                        {formatDate(redemption.created_at)}
                      </Link>
                    ))}
                    {redemptions.length > 3 ? `+${redemptions.length - 3} kişi` : null}
                    {redemptions.length === 0 ? "—" : null}
                  </td>
                  <td>
                    <PromoToggle promoId={promo.id} active={promo.active} code={promo.code} />
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz kod yok">Yukarıdaki formdan ilk kodu oluşturabilirsin.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Ana ekran duyuru bandı"
        desc="Ücretsiz kullanıcıların ana ekranında görünen geri sayımlı şerit. Bitiş tarihi geçtiğinde kendiliğinden kaybolur; süresiz bant yoktur."
      >
        <CampaignForm
          current={
            campaign
              ? { title: campaign.title, description: campaign.description, href: campaign.href, endsAt: campaign.ends_at }
              : null
          }
        />
      </AdminCard>
    </AdminShell>
  );
}
