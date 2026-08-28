import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { DataDeletionButton } from "@/components/profile/data-deletion-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ayarlar" };

export default async function AyarlarPage() {
  const { supabase, user } = await requireUser();

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

  return (
    <AppShell title="Ayarlar">
      <div className="space-y-6">
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
