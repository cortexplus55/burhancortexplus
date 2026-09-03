import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { AstraProfilePanel } from "@/components/parity/astra-profile-panel";
import { ReferralRewardCard } from "@/components/parity/referral-reward-card";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadProfileDashboard } from "@/lib/student/profile-dashboard";
import { loadReferralSummary } from "@/lib/credits/referral";
import { loadInviteLink } from "@/lib/credits/invite-code";

export const metadata = { title: "Profil" };

export default async function ProfilPage() {
  const { supabase, user } = await requireStudentArea();

  const [shell, dashboard, referral, invite] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    loadProfileDashboard(supabase, user.id),
    loadReferralSummary(supabase),
    loadInviteLink(supabase, user.id),
  ]);

  return (
    <AstraParitySorShell {...shell}>
      <AstraProfilePanel
        data={dashboard}
        email={user.email ?? null}
        isPremium={Boolean(shell.account?.isPremium)}
      >
        <ReferralRewardCard summary={referral} inviteUrl={invite.url} />
      </AstraProfilePanel>
    </AstraParitySorShell>
  );
}
