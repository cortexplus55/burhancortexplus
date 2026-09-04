import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { FeatureFlagRow } from "@/components/admin/admin-rows";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";

export const metadata = { title: "Yönetim · Özellik anahtarları" };

/**
 * Bilinen anahtarların insan diliyle karşılığı. Veritabanında yalnızca kod ve
 * teknik bir açıklama duruyor; asıl önemli olan "kapatırsam ne olur" cevabı.
 */
const KNOWN = [
  {
    key: "rag_sources",
    label: "Sohbette kaynak gösterimi",
    description:
      "Açıkken yapay zekâ, yüklenen dokümandan yararlandığında hangi sayfadan aldığını gösterir. Kapatırsan yanıtlar gelmeye devam eder ama kaynak bağlantısı görünmez.",
  },
  {
    key: "teacher_panel",
    label: "Öğretmen paneli",
    description:
      "Onaylı öğretmenlerin sınıf ve ödev ekranlarını açar. Kapalıyken öğretmenler de normal öğrenci gibi görür.",
  },
  {
    key: "paytr_live",
    label: "Ödeme canlı modu",
    description:
      "Açıkken kartlardan gerçekten para çekilir. Test bitmeden açma — açık kalırsa deneme alışverişleri gerçek tahsilat olur.",
  },
];

export default async function AdminOzellikAnahtarlariPage() {
  await requireAdmin();
  const service = createServiceClient();

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
      .filter((flag) => !KNOWN.some((item) => item.key === flag.key))
      .map((flag) => ({
        key: flag.key,
        label: flag.key,
        description: flag.description ?? "Bu anahtar panelde tanımlanmamış; ne yaptığı kodda yazıyor.",
        enabled: flag.enabled,
      })),
  ];

  return (
    <AdminShell href="/admin/feature-flags" pendingApplications={pending}>
      <AdminNote tone="warn">
        Bir anahtarı değiştirdiğinde <strong>tüm kullanıcılar anında</strong>
        etkilenir; sayfayı yenilemelerine bile gerek kalmaz. Emin değilsen
        dokunma.
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
        </AdminTableFrame>
      </AdminCard>
    </AdminShell>
  );
}
