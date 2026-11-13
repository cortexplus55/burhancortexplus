import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { InviteShare } from "@/components/parity/invite-share";
import { ReferralRewardCard } from "@/components/parity/referral-reward-card";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadInviteLink } from "@/lib/credits/invite-code";
import { loadReferralSummary } from "@/lib/credits/referral";
import { qrDataUri } from "@/lib/qr";

export const metadata = { title: "Davet et" };

export default async function DavetPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ code, url: inviteUrl }, referral] = await Promise.all([
    loadInviteLink(supabase, user.id),
    loadReferralSummary(supabase, user.id),
  ]);

  // QR sunucuda uretilir; davet kodu dis servise gitmez.
  const inviteQr = await qrDataUri(inviteUrl, 200);

  return (
    <ParitySorShell {...shell}>
      <PageShell
        width="read"
        title="Arkadaşını davet et"
        lead={
          <>
            QR’ı paylaş veya bağlantıyı kopyala. Arkadaşın kayıt olurken senin
            kodun hesaba işlenir.
          </>
        }
      >
        <ReferralRewardCard summary={referral} inviteUrl={inviteUrl} />

        <InviteShare url={inviteUrl} code={code ?? "—"} qr={inviteQr} />
      </PageShell>
    </ParitySorShell>
  );
}
