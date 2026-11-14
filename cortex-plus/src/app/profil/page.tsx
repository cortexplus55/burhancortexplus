import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ProfileCard } from "@/components/parity/profile-identity";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadProfileDashboard } from "@/lib/student/profile-dashboard";
import { planIdentity } from "@/lib/student/plan-identity";
import { toMyStars } from "@/lib/stars/view";
import { formatDate } from "@/lib/format";
import { parityFullName } from "@/components/parity/app-utils";

export const metadata = { title: "Profil" };

/**
 * Profil (13 Kasım 2026, Faz 2): kapsülün açtığı yan panelle aynı içerik, tam sayfa. Telefonda alt çubuğun Profil
 * sekmesi buraya gelir. Davet kartı kalktı: "Davet et" listede tek satır, kart /davet'te.
 */
export default async function ProfilPage() {
  const { supabase, user } = await requireStudentArea();

  const [shell, dashboard, stars] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadProfileDashboard(supabase, user.id),
    supabase.rpc("my_stars").then(
      (result) => (result.error ? null : toMyStars(result.data).all),
      () => null,
    ),
  ]);

  const account = shell.account;
  const name = parityFullName(dashboard.fullName, user.email);
  const initial = name.slice(0, 1).toLocaleUpperCase("tr-TR");

  return (
    <ParitySorShell {...shell}>
      <PageShell width="read">
        <ProfileCard
          name={name}
          initial={initial}
          identity={planIdentity(account)}
          data={{ dashboard, stars }}
          heading="h1"
          periodEndLabel={account?.subscriptionPeriodEnd ? formatDate(account.subscriptionPeriodEnd) : null}
        />
      </PageShell>
    </ParitySorShell>
  );
}
