import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { FeatureFlagRow } from "@/components/admin/admin-rows";
import { requireFounderPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { paytrMode } from "@/lib/payments/paytr";

export const metadata = { title: "Yönetim · Özellik Anahtarları" };

/**
 * Bilinen anahtarların insan diliyle karşılığı. Veritabanında yalnızca kod ve
 * teknik bir açıklama duruyor; asıl önemli olan "kapatırsam ne olur" cevabı.
 *
 * 6 Kasım 2026: ad ve açıklamalar tamamen Türkçe (İngilizce terim bekçisi: `yonetim-sistem.test.ts`); kod
 * yalnız "Kod" sütununda küçük yazıyla durur.
 */
const KNOWN = [
  {
    key: "pdf_learning_v2",
    label: "Belgeden konu haritası (PDF öğrenme 2. sürüm)",
    description:
      "Açıkken belge işlendikten sonra sayfa bilgisi, konu haritası ve kapsam raporu çıkar; belge sayfasında incelenebilir. Kapalıyken sınav hazırlığı ve belgeyle sohbet eski yoldan aynen çalışır.",
  },
  {
    key: "adaptive_learning_enabled",
    label: "Uyarlamalı öğrenme motoru",
    description:
      "Genelde açarsan uyarlamalı yoldaki bütün öğrencileri etkiler. Deneme için genel anahtarı KAPALI tutup pilot listesini kullanın (Uyarlamalı Öğrenme Hata Ayıklama sayfası).",
  },
  {
    key: "jev_enabled",
    label: "Jev karar motoru",
    description:
      "Genelde açarsan uyarlamalı yoldaki bütün öğrencileri etkiler. Deneme için genel anahtarı KAPALI tutun; ortam ayarı ve pilot listesi de gerekir. Klasik sınav hazırlığı bu anahtardan bağımsızdır.",
  },
  {
    key: "adaptive_daily_replan_enabled",
    label: "Uyarlamalı günlük yeniden planlama",
    description:
      "Genelde açarsan uyarlamalı yoldaki bütün öğrencileri etkiler. Pilot listesi Uyarlamalı Öğrenme Hata Ayıklama sayfasından yönetilir.",
  },
  {
    key: "adaptive_model_router_enabled",
    label: "Uyarlamalı model yönlendirici",
    description:
      "Genelde açarsan uyarlamalı yoldaki bütün öğrencileri etkiler. Zor soruda daha büyük modele geçiş yolu; deneme için genel anahtarı kapalı tutun.",
  },
  {
    key: "spaced_review",
    label: "Aralıklı tekrar",
    description:
      "Açıkken yanlış yapılan sorular ve dersin sınav noktaları 1-3-7-14 gün sonra hazırlık sayfasında yeniden sorulur. Kapatırsan yeni tekrar yazılmaz, kart ve hatırlatma görünmez; kayıtlar silinmez.",
  },
  {
    key: "weekly_survey",
    label: "Haftalık kısa anket",
    description:
      "Açıkken Sınavlar sayfasında o hafta çalışan öğrenciye dört soruluk kart çıkar. Kapatırsan kart görünmez; eski cevaplar durur.",
  },
  {
    key: "vector_eviction",
    label: "Soğuk belge vektörlerini boşaltma",
    description:
      "Açıkken günlük bakım (ve Sistem Sağlığı'ndaki elle bakım) sınavı 45+ gün geçmiş, 30 gündür açılmayan hazırlıkların belgelerinden yalnız arama vektörlerini siler; öğrenci açınca yeniden kurulur. Kapatırsan veritabanı daha hızlı dolar.",
  },
  {
    key: "content_pool_fill",
    label: "Ortak havuzu toplu doldurma (acil durdurma)",
    description:
      "Havuzu dolduran toplu üretimin acil durdurma anahtarı. Kapatırsan doldurucu yeni ders ve soru üretmez; hazır içerik öğrencilere sunulmaya devam eder.",
  },
  {
    key: "content_pool_refresh",
    label: "Havuz derslerini yenileme (acil durdurma)",
    description:
      "Havuz derslerinin anlatımını kalite ölçütüyle yeniden yazan işin acil durdurma anahtarı. Kapatırsan yenileme durur; yayındaki dersler aynen kalır.",
  },
];

/**
 * Anahtar değil, ayar satırı: değeri (kur, tavan) kokpitteki formdan yazılır. Burada açıp kapatmak bir şey
 * değiştirmez; kilitli gösterilir ki "kapattım" sanılmasın.
 */
const SETTING_ROWS = [
  {
    key: "admin_ai_daily_cap",
    label: "Günlük Harcama Sigortası tavanı",
    description:
      "Türkiye gününün OpenAI gideri bu tavana ulaşınca ücretsiz hesapların maliyetli işleri durur (Plus sürer). Tavan Ana Kokpit'teki formdan değişir; açma kapatma ortam ayarıyla.",
    status: "Kokpitten ayarlanır",
  },
  {
    key: "admin_usd_try",
    label: "Dolar kuru (kâr marjı için)",
    description: "Kokpitteki kâr marjı hesabında 1 dolar kaç TL. Ana Kokpit'teki formdan girilir.",
    status: "Kokpitten ayarlanır",
  },
] as const;

/**
 * Kodun okumadığı eski bayraklar. Panelde anahtar gibi dururlarsa yönetici
 * canlı ödemeyi buradan açtığını sanır. Gerçek kontrol ortam değişkeninde.
 */
const INEFFECTIVE = [
  {
    key: "paytr_live",
    label: "Ödeme canlı kipi",
    description:
      "Bu anahtar kodda okunmuyor. Canlı tahsilat `PAYTR_TEST_MODE` ortam ayarıyla belirlenir (0 = canlı, 1 veya boş = test). Anahtarı açmak veya kapatmak hiçbir şeyi değiştirmez.",
  },
  {
    key: "rag_sources",
    label: "Sohbette kaynak gösterimi",
    description:
      "Bu anahtar kodda okunmuyor. Belgeye dayanan cevaplarda kaynak gösterimi her zaman çalışır; buradaki anahtar onu kapatmaz.",
  },
] as const;

/**
 * Üründen kaldırılmış özelliklerin eski veritabanı kayıtları bilerek kalabilir.
 * Bunları "tanımsız anahtar" olarak göstermek, yöneticiye artık var olmayan bir
 * özelliği açabileceği izlenimini verir.
 */
const RETIRED = new Set([
  "teacher_panel",
  ...INEFFECTIVE.map((flag) => flag.key),
  ...SETTING_ROWS.map((flag) => flag.key),
]);

export default async function AdminOzellikAnahtarlariPage() {
  await requireFounderPage();
  const service = createServiceClient();
  const mode = paytrMode();

  const [{ data: flags }, pending] = await Promise.all([
    service.from("feature_flags").select("key, enabled, description"),
    countPendingApplications(service),
  ]);

  const stored = new Map((flags ?? []).map((flag) => [flag.key, flag]));

  const merged = [
    ...KNOWN.map((flag) => ({
      key: flag.key,
      label: flag.label,
      description: flag.description,
      enabled: stored.get(flag.key)?.enabled ?? false,
    })),
    // Veritabanına sonradan eklenmiş, burada tanımlamadığımız anahtarlar da
    // görünmeli; yoksa panelde olmayan bir ayar sessizce açık kalabilir.
    ...(flags ?? [])
      .filter(
        (flag) =>
          !RETIRED.has(flag.key) &&
          !KNOWN.some((item) => item.key === flag.key),
      )
      .map((flag) => ({
        key: flag.key,
        label: "Panelde tanımlanmamış anahtar",
        description:
          flag.description ?? "Bu anahtar panelde tanımlanmamış; ne yaptığı kodda yazıyor. Kodu sağdaki sütunda.",
        enabled: flag.enabled,
      })),
  ];

  const paytrStatus =
    mode === "live" ? "Canlı (PAYTR_TEST_MODE=0)" : mode === "test" ? "Test (PAYTR_TEST_MODE≠0)" : "Kurulu değil";

  return (
    <AdminShell href="/admin/feature-flags" pendingApplications={pending}>
      <AdminNote tone="warn">
        Bir anahtarı değiştirdiğinde <strong>tüm kullanıcılar anında</strong>{" "}
        etkilenir; sayfayı yenilemelerine bile gerek kalmaz. Emin değilsen
        dokunma.
      </AdminNote>
      <AdminNote tone="info">
        Canlı ödeme bu listedeki &quot;Canlı PayTR ödemesi&quot; anahtarıyla açılmaz. Gerçek kip{" "}
        <code>PAYTR_TEST_MODE</code>: şu an <strong>{paytrStatus}</strong>.
      </AdminNote>

      <AdminCard
        title="Anahtarlar"
        desc="Her satırın açıklaması, kapatırsan ne olacağını söylüyor."
        bodyless
      >
        <AdminTableFrame columns={["Özellik", "Durum", "Kod", "Değiştir"]}>
          {merged.map((flag) => (
            <FeatureFlagRow
              key={flag.key}
              flagKey={flag.key}
              label={flag.label}
              description={flag.description}
              enabled={flag.enabled}
            />
          ))}
          {SETTING_ROWS.map((flag) => (
            <FeatureFlagRow
              key={flag.key}
              flagKey={flag.key}
              label={flag.label}
              description={flag.description}
              enabled={false}
              locked
              statusLabel={flag.status}
            />
          ))}
          {INEFFECTIVE.map((flag) => (
            <FeatureFlagRow
              key={flag.key}
              flagKey={flag.key}
              label={flag.label}
              description={flag.description}
              enabled={false}
              locked
              statusLabel={flag.key === "paytr_live" ? paytrStatus : "Kod okumuyor"}
            />
          ))}
        </AdminTableFrame>
      </AdminCard>
    </AdminShell>
  );
}
