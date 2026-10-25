import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { FeatureFlagRow } from "@/components/admin/admin-rows";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { paytrMode } from "@/lib/payments/paytr";

export const metadata = { title: "Yönetim · Özellik anahtarları" };

/**
 * Bilinen anahtarların insan diliyle karşılığı. Veritabanında yalnızca kod ve
 * teknik bir açıklama duruyor; asıl önemli olan "kapatırsam ne olur" cevabı.
 */
const KNOWN = [
  {
    key: "pdf_learning_v2",
    label: "PDF öğrenme v2 (konu haritası)",
    description:
      "Açıkken belge işleme sonrası sayfa meta, konu haritası ve kapsam raporu üretilir; /dokumanlar/[id] incelenebilir. Kapalıyken mevcut sınav hazırlığı ve klasik RAG process aynen çalışır.",
  },
  {
    key: "adaptive_learning_enabled",
    label: "Adaptive öğrenme motoru",
    description:
      "Global açarsan tüm adaptive kullanıcıları etkiler. Pilot için globali KAPALI tutup metadata.pilot_user_ids kullanın (/admin/adaptive).",
  },
  {
    key: "jev_enabled",
    label: "Jev karar motoru",
    description:
      "Global açarsan tüm adaptive kullanıcıları etkiler. Pilot için globali KAPALI tutun; JEV_ENABLED env + pilot listesi gerekir. Klasik sınav hazırlığı bu bayraktan bağımsızdır.",
  },
  {
    key: "adaptive_daily_replan_enabled",
    label: "Adaptive günlük replan",
    description:
      "Global açarsan tüm adaptive kullanıcıları etkiler. Pilot listesi /admin/adaptive üzerinden yönetilir.",
  },
  {
    key: "adaptive_model_router_enabled",
    label: "Adaptive model router",
    description:
      "Global açarsan tüm adaptive kullanıcıları etkiler. gpt-4o yükseltme yolu; pilot için globali kapalı tutun.",
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
];

/**
 * Kodun okumadığı eski bayraklar. Panelde anahtar gibi dururlarsa yönetici
 * canlı ödemeyi buradan açtığını sanır. Gerçek kontrol ortam değişkeninde.
 */
const INEFFECTIVE = [
  {
    key: "paytr_live",
    label: "Ödeme canlı modu",
    description:
      "Bu bayrak kodda okunmuyor. Canlı tahsilat `PAYTR_TEST_MODE` ortam değişkeniyle kontrol edilir (0 = canlı, 1 veya boş = test). Anahtarı açmak veya kapatmak hiçbir şeyi değiştirmez.",
  },
  {
    key: "rag_sources",
    label: "Sohbette kaynak gösterimi",
    description:
      "Bu bayrak kodda okunmuyor. Belgeye dayanan cevaplarda kaynak gösterimi her zaman çalışır; buradaki anahtar onu kapatmaz.",
  },
] as const;

/**
 * Üründen kaldırılmış özelliklerin eski veritabanı kayıtları bilerek kalabilir.
 * Bunları "tanımsız anahtar" olarak göstermek, yöneticiye artık var olmayan bir
 * özelliği açabileceği izlenimini verir.
 */
const RETIRED = new Set(["teacher_panel", ...INEFFECTIVE.map((flag) => flag.key)]);

export default async function AdminOzellikAnahtarlariPage() {
  await requireAdmin();
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
        label: flag.key,
        description: flag.description ?? "Bu anahtar panelde tanımlanmamış; ne yaptığı kodda yazıyor.",
        enabled: flag.enabled,
      })),
  ];

  const paytrStatus =
    mode === "live" ? "Canlı (PAYTR_TEST_MODE=0)" : mode === "test" ? "Test (PAYTR_TEST_MODE≠0)" : "Kurulu değil";

  return (
    <AdminShell href="/admin/feature-flags" pendingApplications={pending}>
      <AdminNote tone="warn">
        Bir anahtarı değiştirdiğinde <strong>tüm kullanıcılar anında</strong>
        etkilenir; sayfayı yenilemelerine bile gerek kalmaz. Emin değilsen
        dokunma.
      </AdminNote>
      <AdminNote tone="info">
        Canlı ödeme bu listedeki <code>paytr_live</code> ile açılmaz. Gerçek kip{" "}
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
