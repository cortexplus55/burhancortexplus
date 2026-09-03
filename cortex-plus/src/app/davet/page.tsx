import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
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
    loadReferralSummary(supabase),
  ]);

  // QR sunucuda uretilir; davet kodu dis servise gitmez.
  const inviteQr = await qrDataUri(inviteUrl, 200);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Arkadaşını davet et</h1>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            QR’ı paylaş veya bağlantıyı kopyala. Arkadaşın kayıt olurken senin
            kodun hesaba işlenir.
          </p>
        </div>

        <ReferralRewardCard summary={referral} inviteUrl={inviteUrl} />

        <InviteShare url={inviteUrl} code={code ?? "—"} qr={inviteQr} />
      </div>
    </AstraParitySorShell>
  );
}
