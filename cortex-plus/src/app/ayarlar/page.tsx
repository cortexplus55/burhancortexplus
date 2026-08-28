import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { DataDeletionButton } from "@/components/profile/data-deletion-button";
import { ParentSettingsLink } from "@/components/parent/parent-settings-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPrimaryRole, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ayarlar" };

export default async function AyarlarPage() {
  const { supabase, user } = await requireUser();
  const role = await getPrimaryRole(user.id);

  const [{ data: deletionRequest }, { data: profile }] = await Promise.all([
    supabase
      .from("data_deletion_requests")
      .select("id, status, requested_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("primary_role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const isTeacher =
    profile?.primary_role === "teacher" ||
    profile?.primary_role === "verified_teacher";
  const isParent = role === "parent";

  if (isParent) {
    return (
      <AppShell title="Ayarlar" accountStrip={false}>
        <section className="pt-2">
          <h1 className="text-xl font-semibold">Ayarlar</h1>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Veli hesabı, çocuk bağlantısı ve gizlilik.
          </p>
        </section>

        <nav className="mt-5 space-y-2" aria-label="Hesap ayarları">
          <ParentSettingsLink
            href="/profil"
            title="Profil ve yakınlık"
            body="Ad, yakınlık ve isteğe bağlı telefon"
          />
          <ParentSettingsLink
            href="/veli"
            title="Çocuk bağlantıları"
            body="Davet gönder, onay bekle, bağlı öğrenciler"
          />
          <ParentSettingsLink
            href="/veli/plus"
            title="Plus (çocuk kotası)"
            body="Raporlar ücretsiz; kota çocuğunun hesabına gider"
          />
          <ParentSettingsLink
            href="/odemeler"
            title="Ödeme geçmişi"
            body="Çocuk kotası için yaptığın ödemeler"
          />
          <ParentSettingsLink
            href="/bildirimler"
            title="Bildirimler"
            body="Bağlantı, ödeme ve kota güncellemeleri"
          />
          <ParentSettingsLink
            href="/destek"
            title="Yardım"
            body="Ekibe yaz — Destek AI /veli/sor’da"
          />
        </nav>

        <section className="astra-pay-card mt-6 p-4">
          <h2 className="text-sm font-semibold">Görünüm</h2>
          <p className="mt-1 text-xs text-[var(--astra-muted)]">
            Veli paneli koyu temada kalır. Bu düğme pazarlama sayfalarını
            etkiler.
          </p>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </section>

        <section className="astra-pay-card mt-4 p-4">
          <h2 className="text-sm font-semibold">Gizlilik</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/gizlilik" className="text-[var(--astra-primary)] underline-offset-2 hover:underline">
              Gizlilik
            </Link>
            <Link href="/kvkk" className="text-[var(--astra-primary)] underline-offset-2 hover:underline">
              KVKK
            </Link>
            <Link
              href="/kullanim-kosullari"
              className="text-[var(--astra-primary)] underline-offset-2 hover:underline"
            >
              Kullanım koşulları
            </Link>
          </div>
        </section>

        <section className="astra-pay-card mt-4 p-4">
          <h2 className="text-sm font-semibold">Hesap verisi</h2>
          <p className="mt-1 text-xs text-[var(--astra-muted)]">
            Silme talebi veli hesabını kapsar; bağlı öğrenci hesapları silinmez.
          </p>
          <div className="mt-3">
            {deletionRequest ? (
              <p className="text-sm">
                Talep durumu: <strong>{deletionRequest.status}</strong> ·{" "}
                {formatDate(deletionRequest.requested_at)}
              </p>
            ) : (
              <DataDeletionButton tone="astra" />
            )}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ayarlar">
      <div className="space-y-6">
        <SectionCard
          title="Öğrenme tercihleri"
          description="AI öğretmen stilini ve sınıf bilgini profilden güncelleyebilirsin."
        >
          <Link href="/profil" className="text-sm font-medium underline">
            Profile git
          </Link>
        </SectionCard>

        <SectionCard
          title="Görünüm"
          description="Açık ve koyu tema arasında geçiş yapabilirsin."
        >
          <ThemeToggle />
        </SectionCard>

        <SectionCard
          title="Gizlilik"
          description="Verilerinin nasıl işlendiğini ilgili metinlerden inceleyebilirsin."
        >
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href="/gizlilik" className="underline">
              Gizlilik politikası
            </Link>
            <Link href="/kvkk" className="underline">
              KVKK aydınlatma metni
            </Link>
            <Link href="/kullanim-kosullari" className="underline">
              Kullanım koşulları
            </Link>
            {isTeacher ? (
              <Link href="/ogretmen-paneli/plus" className="underline">
                Öğretmen Plus
              </Link>
            ) : (
              <Link href="/paketler" className="underline">
                Paketler
              </Link>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Hesap verisi"
          description="Silme talebi oluşturduğunda ekibimiz KVKK süresi içinde işlemi tamamlar."
        >
          {deletionRequest ? (
            <p className="text-sm">
              Talep durumu: <strong>{deletionRequest.status}</strong> ·{" "}
              {formatDate(deletionRequest.requested_at)}
            </p>
          ) : (
            <DataDeletionButton />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
