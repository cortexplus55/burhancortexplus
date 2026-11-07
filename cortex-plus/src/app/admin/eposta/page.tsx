import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { CampaignRowControls, EmailComposer } from "@/components/admin/email-composer";
import { ReferralCapForm } from "@/components/admin/referral-cap-form";
import { isFeatureEnabled, MARKETING_EMAIL_FLAG } from "@/lib/admin/feature-flags";
import { requireFounderPage } from "@/lib/auth/admin-guard";
import { listCampaigns, type CampaignRow } from "@/lib/email/campaign";
import { resendConfigured } from "@/lib/email/mailer";
import { formatDate, formatNumber } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Yönetim · E-posta ve Davet" };
export const dynamic = "force-dynamic";
// Gönderim turları sunucu eylemleriyle yürür (her tur ~45 sn); işlev süresi bunu karşılamalı.
export const maxDuration = 120;

const KIND_LABEL: Record<CampaignRow["kind"], string> = {
  single: "Tek kişi",
  service: "Hizmet duyurusu",
  marketing: "Kampanya",
};

type ReferralStats = { invited: number; gifted: number; gifts_today: number; daily_cap: number; enabled: boolean };
type Inviter = { inviter_id: string; full_name: string | null; invited: number; gifted: number };

/** "✉️ E-posta ve Davet" (yalnız kurucu): tek kişiye ya da toplu e-posta, son gönderimler, davet programının durumu. */
export default async function AdminEpostaPage() {
  await requireFounderPage();
  const service = createServiceClient();

  const [campaigns, campaignsOpen, serviceCount, marketingCount, optIns, referral, inviters] = await Promise.all([
    listCampaigns(service, 15),
    isFeatureEnabled(service, MARKETING_EMAIL_FLAG).catch(() => false),
    service.rpc("email_audience_count", { p_kind: "service", p_plan: "all", p_signup_days: null, p_exam_days: null }),
    service.rpc("email_audience_count", { p_kind: "marketing", p_plan: "all", p_signup_days: null, p_exam_days: null }),
    service.from("email_preferences").select("user_id", { count: "exact", head: true }).eq("marketing", true),
    service.rpc("referral_admin_stats"),
    service.rpc("referral_top_inviters", { p_limit: 5 }),
  ]);

  const resendReady = resendConfigured();
  const stats = ((Array.isArray(referral.data) ? referral.data[0] : referral.data) ?? null) as ReferralStats | null;
  const top = (inviters.data ?? []) as Inviter[];

  return (
    <AdminShell href="/admin/eposta">
      <AdminNote tone="info">
        Burada yazdığın mesaj şablona konur, öğrencinin adı ve sınavına kalan günle kişiselleşir ve Resend ile gönderilir.
        <strong> Hizmet duyurusu</strong> hesabı doğrulanmış herkese gider ve yalnız hesapla ilgili bilgi içindir;
        <strong> kampanya</strong> yalnız duyuru e-postası almayı kabul edenlere gider. Her gönderim İşlem Kayıtları&apos;na yazılır.
      </AdminNote>

      <AdminCard title="Durum" desc="Gönderimden önce bakılacak dört şey.">
        <div className="flex flex-wrap gap-2">
          <AdminBadge tone={resendReady ? "ok" : "bad"}>{resendReady ? "E-posta altyapısı hazır" : "E-posta altyapısı yapılandırılmamış"}</AdminBadge>
          <AdminBadge tone={campaignsOpen ? "ok" : "warn"}>{campaignsOpen ? "Kampanya e-postası açık" : "Kampanya e-postası kapalı"}</AdminBadge>
          <AdminBadge tone="mute">Hizmet duyurusu alabilecek: {formatNumber(Number(serviceCount.data ?? 0))}</AdminBadge>
          <AdminBadge tone="mute">
            Kampanya izni verenler: {formatNumber(optIns.count ?? 0)} (doğrulanmış: {formatNumber(Number(marketingCount.data ?? 0))})
          </AdminBadge>
        </div>
        <p className="mt-3 text-sm text-[var(--adm-muted)]">
          Ücretsiz Resend planında günde 100, ayda 3.000 e-posta gönderilebilir; kota dolarsa gönderim durur ve kimse kaybolmaz, ertesi gün «Devam et» ile sürer.
          Öğrenci sayısı arttıkça Resend planını yükselt (Resend → Ayarlar → Faturalama).
        </p>
      </AdminCard>

      <AdminCard title="Mesaj yaz" desc="Önce «Kendime deneme gönder» ile nasıl göründüğüne bak.">
        <EmailComposer campaignsOpen={campaignsOpen} resendReady={resendReady} />
      </AdminCard>

      <AdminCard title="Son gönderimler" desc="Yarıda kalan gönderim buradan sürdürülür." bodyless>
        {campaigns.length ? (
          <AdminTableFrame columns={["Tarih", "Tür", "Konu", "Gönderildi", "Atlanan / başarısız", "Durum"]} stack>
            {campaigns.map((row) => (
              <tr key={row.id}>
                <td data-label="Tarih">{formatDate(row.created_at)}</td>
                <td data-label="Tür">{KIND_LABEL[row.kind]}</td>
                <td data-label="Konu">{row.subject}</td>
                <td data-label="Gönderildi">
                  {formatNumber(row.sent)} / {formatNumber(row.total)}
                </td>
                <td data-label="Atlanan / başarısız">
                  {formatNumber(row.skipped)} / {formatNumber(row.failed)}
                </td>
                <td data-label="Durum">
                  <CampaignRowControls
                    campaignId={row.id}
                    initial={{
                      id: row.id,
                      status: row.status,
                      total: row.total,
                      sent: row.sent,
                      failed: row.failed,
                      skipped: row.skipped,
                      remaining: Math.max(0, row.total - row.sent - row.failed - row.skipped),
                      stopReason: row.stop_reason,
                    }}
                  />
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz gönderim yok">İlk mesajını yukarıdan yazabilirsin.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Davet programı"
        desc="Arkadaşını davet eden ve davetli ilk çalışmasını yapınca iki tarafa ders hediyesi yazılır; davet eden en çok 3 hediye alır."
      >
        {stats ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <AdminBadge tone={stats.enabled ? "ok" : "bad"}>{stats.enabled ? "Hediye açık" : "Hediye kapalı"}</AdminBadge>
              <AdminBadge tone="mute">Davetle gelen: {formatNumber(Number(stats.invited))}</AdminBadge>
              <AdminBadge tone="mute">Hediyesi yazılan: {formatNumber(Number(stats.gifted))}</AdminBadge>
              <AdminBadge tone={stats.gifts_today >= stats.daily_cap ? "warn" : "mute"}>
                Bugün: {formatNumber(Number(stats.gifts_today))} / {formatNumber(Number(stats.daily_cap))}
              </AdminBadge>
            </div>
            <p className="text-sm text-[var(--adm-muted)]">
              Günlük tavan, sahte hesap sürüsünün en kötü günlük bedelini sınırlar. Tavan dolunca ya da hediye kapatılınca yeni hediye yazılmaz;
              davetli sonraki çalışmasında yeniden denenir, kimse hakkını kaybetmez. Anahtarı Özellik Anahtarları sayfasından kapatıp açabilirsin;
              tavanı aşağıdan değiştir.
            </p>
            <ReferralCapForm current={Number(stats.daily_cap)} />
            {top.length ? (
              <AdminTableFrame columns={["Davet eden", "Davetle gelen", "Hediyesi yazılan"]} stack>
                {top.map((row) => (
                  <tr key={row.inviter_id}>
                    <td data-label="Davet eden">{row.full_name ?? "İsimsiz"}</td>
                    <td data-label="Davetle gelen">{formatNumber(Number(row.invited))}</td>
                    <td data-label="Hediyesi yazılan">{formatNumber(Number(row.gifted))}</td>
                  </tr>
                ))}
              </AdminTableFrame>
            ) : (
              <p className="text-sm text-[var(--adm-muted)]">Henüz davetle gelen yok.</p>
            )}
          </div>
        ) : (
          <AdminEmpty title="Davet özeti okunamadı">Veritabanı değişikliği henüz uygulanmamış olabilir.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
