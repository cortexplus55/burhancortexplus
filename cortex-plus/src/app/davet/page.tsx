import { randomBytes } from "crypto";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { InviteShare } from "@/components/parity/invite-share";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { appOrigin } from "@/lib/app-url";
import { qrDataUri } from "@/lib/qr";

export const metadata = { title: "Davet et" };

async function ensureReferralCode(
  supabase: Awaited<ReturnType<typeof requireStudentArea>>["supabase"],
  userId: string,
  existing: string | null,
) {
  if (existing) return existing;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const { data, error } = await supabase
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (data?.referral_code) return data.referral_code as string;
    if (error) continue;
    const { data: again } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();
    if (again?.referral_code) return again.referral_code as string;
  }
  return null;
}

export default async function DavetPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", user.id)
    .maybeSingle();

  const code = await ensureReferralCode(
    supabase,
    user.id,
    (profile?.referral_code as string | null) ?? null,
  );

  const inviteUrl = `${appOrigin()}/kayit?ref=${code ?? user.id.slice(0, 8)}`;
  // QR sunucuda uretilir; davet kodu dis servise gitmez.
  const inviteQr = await qrDataUri(inviteUrl, 200);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page">
        <h1 className="text-xl font-semibold">Arkadaşını davet et</h1>
        <p className="mt-2 text-sm text-[var(--astra-muted)]">
          QR’ı paylaş veya bağlantıyı kopyala. Arkadaşın kayıt olurken senin
          kodun hesaba işlenir.
        </p>
        <InviteShare url={inviteUrl} code={code ?? "—"} qr={inviteQr} />
      </div>
    </AstraParitySorShell>
  );
}
