import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { SmtpTestButton } from "@/components/admin/smtp-test-button";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { SERVICE_NOTES } from "@/lib/admin/labels";
import { paytrMode } from "@/lib/payments/paytr";
import {
  AUTO_RENEW_SUPPORTED,
  RECURRING_BLOCKERS,
  probePaytrRecurring,
} from "@/lib/payments/paytr-capability";
import { ACCEPTED_OMISSIONS, missingSellerFields } from "@/lib/legal/seller";
import { probeSchema } from "@/lib/admin/schema-probe";

export const metadata = { title: "Yönetim · Sistem durumu" };

/**
 * `critical` olanlar eksikse ürünün bir parçası hiç çalışmaz; diğerleri
 * eksikse ürün çalışır ama körsün (ölçüm, hata takibi).
 *
 * `env` bir liste, çünkü aynı ayar farklı adlarla gelebiliyor. 5 Eylül
 * 2026'da bu satırın tek isme bakması yüzünden bir sorun günlerce görünmedi:
 * Upstash 1 Eylül'den beri bağlıydı, panel "kurulu değil" diyordu, kimse de
 * hız sınırının çalışmadığını fark etmedi. Bir durum ekranının en kötü hâli
 * yanlış bilgi vermesidir.
 */
const SERVICES: { name: string; env: string[]; critical: boolean; all?: boolean }[] = [
  { name: "Supabase", env: ["NEXT_PUBLIC_SUPABASE_URL"], critical: true },
  { name: "Supabase service key", env: ["SUPABASE_SECRET_KEY"], critical: true },
  { name: "OpenAI", env: ["OPENAI_API_KEY"], critical: true },
  { name: "Workspace SMTP", env: ["SMTP_PASS"], critical: true },
  {
    name: "PayTR",
    env: ["PAYTR_MERCHANT_ID", "PAYTR_MERCHANT_KEY", "PAYTR_MERCHANT_SALT"],
    critical: true,
    all: true,
  },
  {
    name: "Upstash Redis",
    // Vercel'in Upstash entegrasyonu KV_* adlarını enjekte ediyor.
    env: ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"],
    critical: false,
  },
  { name: "PostHog", env: ["NEXT_PUBLIC_POSTHOG_KEY"], critical: false },
  {
    name: "Sentry",
    env: ["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN"],
    critical: false,
  },
];

export default async function AdminSistemPage() {
  await requireAdmin();
  const service = createServiceClient();
  const pending = await countPendingApplications(service);

  const rows = SERVICES.map((item) => ({
    ...item,
    configured: item.all
      ? item.env.every((name) => Boolean(process.env[name]))
      : item.env.some((name) => Boolean(process.env[name])),
  }));

  const missingCritical = rows.filter((row) => row.critical && !row.configured);
  const mode = paytrMode();
  // Panel açılışını bekletmemek için yoklamanın kendi zaman aşımı var.
  const capability = await probePaytrRecurring();
  const missingSeller = missingSellerFields();
  const schema = await probeSchema(service);
  const schemaBroken = schema.filter((check) => !check.ok);
  const schemaCritical = schemaBroken.filter((check) => check.critical);

  return (
    <AdminShell href="/admin/sistem" pendingApplications={pending}>
      <AdminNote tone="info">
        Burada yalnızca bir ayarın <strong>tanımlı olup olmadığı</strong>{" "}
        görünür; şifrelerin ve anahtarların kendisi asla gösterilmez. Bir satır
        eksik görünüyorsa ayar sunucuda (Vercel) tanımlanmalı.
      </AdminNote>

      {/*
        Ödeme kipi kendi uyarısını hak ediyor.

        Üç anahtar girildiği an tablo "PayTR: Tanımlı" diyor ve fiyat
        sayfasındaki buton "Satın al"a dönüyor. Ama PAYTR_TEST_MODE varsayılanı
        "1": akış baştan sona çalışıyor, kredi bile yükleniyor, yalnızca PARA
        GELMİYOR. Kurulumu yapan kişi ödeme almaya başladığını sanıyor ve hata
        sessiz kalıyor.
      */}
      {mode === "test" ? (
        <AdminNote tone="warn">
          PayTR <strong>TEST kipinde</strong>. Ödeme akışı baştan sona
          çalışıyor ve krediler yükleniyor, ama{" "}
          <strong>gerçek para çekilmiyor</strong>. Canlıya geçmek için Vercel&apos;de{" "}
          <code>PAYTR_TEST_MODE=0</code> tanımlayıp yeniden dağıtın.
        </AdminNote>
      ) : null}

      {mode === "live" ? (
        <AdminNote tone="info">
          PayTR <strong>canlı kipte</strong> — ödemeler gerçek karttan çekilir.
        </AdminNote>
      ) : null}

      {/*
        Tekrarlayan tahsilat yetkisi. "Yetki alındı sanıyorum" ile "yetki var"
        arasındaki farkı kapatıyor: burada PayTR'ye sorulup cevabı yazılıyor.

        Gözle panelden bakılan şey zamanla bayatlıyor ve yanlış hatırlanıyor.
        Yetkinin olduğu sanılıp otomatik yenileme açılırsa abonelik sessizce
        biter ve sözleşmede vaat edilen tahsilat hiç olmaz.
      */}
      {mode === "unconfigured" ? null : (
        <AdminNote
          tone={
            capability.recurring === "available"
              ? "info"
              : capability.recurring === "unavailable"
                ? "warn"
                : "info"
          }
        >
          <strong>PayTR kart saklama yetkisi:</strong>{" "}
          {capability.recurring === "available"
            ? "açık"
            : capability.recurring === "unavailable"
              ? "kapalı"
              : "belirlenemedi"}
          . {capability.detail}
        </AdminNote>
      )}

      {/*
        Şema durumu.

        Bu projede göç dosyaları elle uygulanıyor (repo geçmişi ile uzak
        veritabanının geçmişi ayrışmış) ve elle uygulamanın riski bir dosyanın
        atlandığının fark edilmemesi. 18 Eylül 2026'da tam olarak bu oldu:
        dal yayına çıktı, sayfa açıldı, `/api/health` "ok" dedi — ama
        `credit_reserve` eski imzada kalmışsa her kredi ayırma isteği düşüyor.

        En pahalı arıza, en sessiz görünen arızaydı. Burası onu sesli yapıyor.
      */}
      {schemaCritical.length ? (
        <AdminNote tone="warn">
          <strong>Şema koddan geride:</strong>{" "}
          {schemaCritical.map((check) => check.name).join(", ")}. Ürünün bir
          parçası şu anda hiç çalışmıyor — göç dosyalarını uygulayın.
        </AdminNote>
      ) : schemaBroken.length ? (
        <AdminNote tone="info">
          <strong>Şema büyük ölçüde güncel.</strong> Eksik olanlar ürünü
          durdurmuyor ama yeni özellikler kapalı:{" "}
          {schemaBroken.map((check) => check.name).join(", ")}.
        </AdminNote>
      ) : (
        <AdminNote tone="info">
          <strong>Şema kodla uyumlu.</strong> Beklenen göç dosyalarının hepsi
          canlı veritabanında.
        </AdminNote>
      )}

      <AdminCard
        title="Canlı şema"
        desc="Her satır bir göç dosyasının kanıt nesnesini arıyor. Kırmızı bir satır, o dosyanın uygulanmadığı anlamına gelir."
        bodyless
      >
        <AdminTableFrame columns={["Kontrol", "Durum", "Ayrıntı"]}>
          {schema.map((check) => (
            <tr key={check.name}>
              <td className="font-medium">{check.name}</td>
              <td>
                {check.ok ? (
                  <AdminBadge tone="ok">uyumlu</AdminBadge>
                ) : check.critical ? (
                  <AdminBadge tone="bad">eksik</AdminBadge>
                ) : (
                  <AdminBadge tone="warn">eksik</AdminBadge>
                )}
              </td>
              <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                {check.detail}
              </td>
            </tr>
          ))}
        </AdminTableFrame>
      </AdminCard>

      {/*
        Yetki tek başına yetmiyor. Yukarıdaki satır "PayTR izin verdi mi"
        sorusunu cevaplıyor; burada ise entegrasyonun bunu taşıyıp taşımadığı
        yazıyor. İkisi karıştığında ortaya "yetki geldi, açalım" kararı çıkıyor
        ve abonelik sessizce bitiyor.
      */}
      {AUTO_RENEW_SUPPORTED ? null : (
        <AdminCard
          title="Otomatik yenileme neden kapalı"
          desc="Yetki gelse bile bugün açılamaz; önce bu üç madde aşılmalı. Sözleşme metni de bu yüzden “otomatik yenilenmez” diyor."
          bodyless
        >
          <AdminTableFrame columns={["Engel", "Neden"]}>
            {RECURRING_BLOCKERS.map((blocker) => (
              <tr key={blocker.title}>
                <td className="font-medium">{blocker.title}</td>
                <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                  {blocker.detail}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        </AdminCard>
      )}

      {/*
        Satıcı bilgileri. Hukuki sayfalarda okuyucuya görünen uyarının
        yönetim tarafındaki karşılığı; ayrıca BİLEREK yayınlanmayan alanlar
        burada gerekçesiyle duruyor.

        Neden: bir kararın "biz böyle karar verdik" ile "kimse fark etmedi"
        arasındaki fark, yazılı olup olmamasıdır. Aylar sonra "telefon neden
        yok" diye sorulduğunda cevabın bir yerde durması gerekiyor.
      */}
      {missingSeller.length ? (
        <AdminNote tone="warn">
          <strong>Satıcı bilgisi eksik:</strong> {missingSeller.join(", ")}.
          Hukuki sayfalarda bu alanlar “[doldurulacak]” görünüyor ve ödeme
          akışı yasal olarak eksik sayılır.
        </AdminNote>
      ) : (
        <AdminNote tone="info">
          <strong>Satıcı bilgileri tam.</strong> Bilerek yayınlanmayanlar:{" "}
          {ACCEPTED_OMISSIONS.map((item) => item.label).join(", ")} — bunlar
          eksiklik değil, ürün kararı. Gerekçeler{" "}
          <code>src/lib/legal/seller.ts</code> içinde.
        </AdminNote>
      )}

      {missingCritical.length ? (
        <AdminNote tone="warn">
          {missingCritical.length} zorunlu ayar eksik:{" "}
          <strong>{missingCritical.map((row) => row.name).join(", ")}</strong>.
          Bunlar olmadan ürünün bir kısmı çalışmaz.
        </AdminNote>
      ) : null}

      <AdminCard
        title="Bağlantılar"
        desc="Her satırın açıklaması, o ayar eksik olursa neyin bozulacağını söylüyor."
        bodyless
      >
        <AdminTableFrame columns={["Servis", "Ne işe yarar", "Durum"]}>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-[var(--adm-muted)]">
                  {row.env.join(" / ")}
                </div>
              </td>
              <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                {SERVICE_NOTES[row.name] ?? "—"}
              </td>
              <td>
                {row.configured ? (
                  <AdminBadge tone="ok">Tanımlı</AdminBadge>
                ) : row.critical ? (
                  <AdminBadge tone="bad">Eksik</AdminBadge>
                ) : (
                  <AdminBadge tone="warn">Tanımsız</AdminBadge>
                )}
              </td>
            </tr>
          ))}
        </AdminTableFrame>
      </AdminCard>

      <AdminCard
        title="E-posta bağlantısını sına"
        desc="Kayıt ve doğrulama e-postalarının gidip gitmediğini kontrol eder. Kimseye e-posta göndermez, yalnızca bağlantıyı dener."
      >
        <SmtpTestButton />
      </AdminCard>
    </AdminShell>
  );
}
