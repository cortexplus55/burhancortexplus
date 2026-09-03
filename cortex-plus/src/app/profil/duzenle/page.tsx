import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { getUserRoles, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { parseTutorStyle } from "@/lib/learning/tutor-style";
import { getStudentAccountContext } from "@/lib/student/account-context";

export const metadata = { title: "Bilgilerim" };

export default async function ProfilPage() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);

  const [{ data: profile }, account] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, grade_level, locale, created_at, tutor_style, primary_role",
      )
      .eq("id", user.id)
      .maybeSingle(),
    getStudentAccountContext(supabase, user.id),
  ]);

  return (
    <AppShell title="Profil" accountStrip={false}>
      <div className="space-y-6">
        <SectionCard title="Hesap bilgileri">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{user.email}</span>
            {account.isPremium ? (
              <Badge className="bg-amber-500/20 text-amber-200">Plus</Badge>
            ) : (
              <Badge variant="secondary">Ücretsiz</Badge>
            )}
            {roles.includes("admin") ? (
              <Badge variant="secondary">admin</Badge>
            ) : null}
            <span>· Katılım {formatDate(profile?.created_at)}</span>
          </div>
          <ProfileForm
            fullName={profile?.full_name ?? ""}
            gradeLevel={profile?.grade_level ?? ""}
            locale={(profile?.locale as "tr" | "en") ?? "tr"}
            tutorStyle={parseTutorStyle(profile?.tutor_style)}
          />
        </SectionCard>
      </div>
    </AppShell>
  );
}
