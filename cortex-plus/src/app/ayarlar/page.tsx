import { PLAN_WORK_BY_ID, workCount } from "@/lib/billing/plan-value";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { DataDeletionButton } from "@/components/profile/data-deletion-button";
import { CookiePreferencesButton } from "@/components/legal/cookie-banner";
import { EmailChangeCard } from "@/components/profile/email-change-card";
import { EmailPreferencesCard } from "@/components/profile/email-preferences-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { createServiceClient } from "@/lib/supabase/server";
import { FounderBadge } from "@/components/student/founder-chip";

export const metadata = { title: "Ayarlar" };

export default async function AyarlarPage() {
  const { supabase, user } = await requireUser();

  // Üç okuma paralel (2 Kasım 2026, O12): hatırlatma tercihi önceden ayrı, sırayla bekleniyordu.
  const [{ data: deletionRequest }, account, { data: reminderPref }] = await Promise.all([
    supabase
      .from("data_deletion_requests")
      .select("id, status, requested_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getStudentAccountContext(supabase, user.id),
    // Kolon yoksa sorgu hata verir ve tercih "açık" varsayılır.
    supabase.from("profiles").select("study_reminder_email").eq("id", user.id).maybeSingle(),
  ]);
  // Kampanya izni yalnız sunucu anahtarıyla okunur (satır güvenliği tarayıcıya kapalı). 7 Kasım 2026.
  const { data: marketingPref } = await createServiceClient()
    .from("email_preferences")
    .select("marketing")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell title="Ayarlar">
      <div className="space-y-6">
        <Link href="/ogretmen?dialog=profile" className="cp-exam-continue inline-flex">
          Hızlı ayarlar paneli
        </Link>
        {account.isAdmin ? (
          // Kurucuda abonelik yükseltme ya da iptal düğmesi yok.
          <SectionCard title="Hesap">
            <div className="cp-founder-row">
              <span className="text-sm text-[var(--cp-text)]">Hesap türü</span>
              <FounderBadge />
            </div>
            <p className="cp-founder-note">Kredi sınırı yok.</p>
          </SectionCard>
        ) : (
          <SectionCard
            title="Plan"
            description={
              account.isPremium
                ? "Plus aboneliğin aktif. Kullanımını ve ödemelerini Kullanım sayfasından takip edebilirsin."
                : `Ücretsiz plandasın. Plus ile podcast, sözlü ve yazılı deneme, video ders ve ayda yaklaşık ${workCount(PLAN_ALLOWANCES.plusMonthly, PLAN_WORK_BY_ID.lesson).toLocaleString("tr-TR")} ders hakkı açılır.`
            }
          >
            <Link
              href={account.isPremium ? "/krediler" : "/pay"}
              className="text-sm font-medium underline"
            >
              {account.isPremium ? "Krediler" : "Plus’a yükselt"}
            </Link>
          </SectionCard>
        )}

        <SectionCard
          title="Öğrenme tercihleri"
          description="Öğretmen stili, günlük çalışma hedefi, önerilen sorular, okuma ve ses ayarları."
        >
          <Link href="/profil?dialog=profile" className="text-sm font-medium underline">
            Ayarları aç
          </Link>
        </SectionCard>

        <SectionCard
          title="E-posta tercihleri"
          description="Hesabınla ilgili bilgilendirmeler (doğrulama, ödeme, iade) her zaman gelir; aşağıdakileri istediğin gibi ayarla. Günde en fazla bir hatırlatma gönderiyoruz."
        >
          <EmailPreferencesCard
            initial={{
              reminders: (reminderPref?.study_reminder_email as boolean | null) ?? true,
              marketing: marketingPref?.marketing === true,
            }}
          />
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
            <Link href="/cerez-politikasi" className="underline">
              Çerez politikası
            </Link>
            <CookiePreferencesButton className="underline" />
            <Link href="/destek?konu=kvkk" className="underline">
              Kişisel veri başvurusu
            </Link>
            {account.isAdmin ? null : (
              <Link href="/pay" className="underline">
                Paketler
              </Link>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="E-posta ve şifre"
          description="Giriş yaptığın adres ve şifren."
        >
          <EmailChangeCard
            email={user.email ?? null}
            pendingEmail={(user as { new_email?: string | null }).new_email ?? null}
            hasPasswordLogin={
              (user.identities ?? []).some((identity) => identity.provider === "email") ||
              user.app_metadata?.provider === "email"
            }
          />
        </SectionCard>

        {/*
          Silme bir ekip işi değil: talep anında işleniyor, yarım kalırsa
          günlük cron yeniden deniyor (processPendingDeletionRequests). Eski
          metin "ekibimiz KVKK süresi içinde" diyor, durumu ham "pending"
          olarak gösteriyordu.
        */}
        <SectionCard
          title="Hesap verisi"
          description="Silme talebi hemen işlenir; tamamlandığında hesabın kapanır."
        >
          {deletionRequest ? (
            <p className="text-sm">
              {deletionRequest.status === "completed"
                ? "Silme talebin tamamlandı"
                : "Silme talebin işleniyor; yarım kalan adımlar her gün otomatik olarak yeniden deneniyor"}{" "}
              · {formatDate(deletionRequest.requested_at)}
            </p>
          ) : (
            <DataDeletionButton />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
