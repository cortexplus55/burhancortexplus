import { AstraAppChrome } from "@/components/parity/astra-app-chrome";
import { astraUserInitial } from "@/components/parity/astra-app-utils";
import { TeacherVerificationBanner } from "@/components/teacher/verification-banner";
import { requireTeacher } from "@/lib/auth/session";
import { getTeacherEntitlements } from "@/lib/teacher/entitlements";

export async function TeacherShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { supabase, user, roles } = await requireTeacher();

  const [{ data: profile }, entitlements] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, teacher_application_status")
      .eq("id", user.id)
      .maybeSingle(),
    getTeacherEntitlements(supabase, user.id, roles),
  ]);

  const avatar = profile?.avatar_url as string | null | undefined;

  return (
    <AstraAppChrome
      navRole="teacher"
      pageTitle={title}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      userInitial={astraUserInitial(profile?.full_name, user.email)}
    >
      {entitlements ? (
        <TeacherVerificationBanner
          applicationStatus={
            (profile?.teacher_application_status as string | null) ?? "pending"
          }
          entitlements={entitlements}
        />
      ) : null}
      {children}
    </AstraAppChrome>
  );
}
