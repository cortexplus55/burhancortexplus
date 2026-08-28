import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { ProfileForm } from "@/components/profile/profile-form";
import { TeacherApplicationForm } from "@/components/profile/teacher-application-form";
import {
  ParentRequests,
  type ParentRequest,
} from "@/components/profile/parent-requests";
import { Badge } from "@/components/ui/badge";
import { getUserRoles, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Profil" };

const applicationLabels: Record<string, string> = {
  pending: "Değerlendirmede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

export default async function ProfilPage() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);

  const [{ data: profile }, { data: application }, { data: parentLinks }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, grade_level, locale, created_at, invite_code, primary_role")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("teacher_applications")
        .select("id, status, institution, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("parent_student_links")
        .select(
          "id, created_at, profiles!parent_student_links_parent_id_fkey(full_name)",
        )
        .eq("student_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const isVerifiedTeacher = roles.includes("verified_teacher");
  const isSchoolTeacher =
    roles.includes("teacher") ||
    isVerifiedTeacher ||
    profile?.primary_role === "teacher" ||
    profile?.primary_role === "verified_teacher";
  const isParent = profile?.primary_role === "parent";

  const requests: ParentRequest[] = (parentLinks ?? []).map((row) => ({
    id: row.id as string,
    parentName:
      (row.profiles as { full_name?: string } | null)?.full_name ?? "Bir veli",
    createdAt: row.created_at as string | null,
  }));

  return (
    <AppShell title="Profil">
      <div className="space-y-6">
        <SectionCard title="Hesap bilgileri">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{user.email}</span>
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            <span>· Katılım {formatDate(profile?.created_at)}</span>
          </div>
          <ProfileForm
            fullName={profile?.full_name ?? ""}
            gradeLevel={profile?.grade_level ?? ""}
            locale={(profile?.locale as "tr" | "en") ?? "tr"}
          />
        </SectionCard>

        {!isParent ? (
          <SectionCard
            title="Veli davet kodun"
            description="Bu kodu velinle paylaş; bağlantı isteğini sen onaylarsın."
          >
            <p className="font-mono text-2xl tracking-[0.4em]">
              {profile?.invite_code ?? "—"}
            </p>
            <div className="mt-4">
              <ParentRequests requests={requests} />
            </div>
          </SectionCard>
        ) : null}

        {!isParent && isSchoolTeacher ? (
          <SectionCard
            title="Okul öğretmeni doğrulaması"
            description="Panel kayıt sonrası açılır. Belge onayı tam ödev haklarını açar; Plus sınırsız sınıf ve rapor sunar."
          >
            {isVerifiedTeacher ? (
              <p className="text-sm">
                Hesabın doğrulandı. Öğretmen panelinden sınıf ve ödevlerini yönetebilirsin.{" "}
                <Link href="/ogretmen-paneli/plus" className="underline">
                  Plus
                </Link>
              </p>
            ) : (
              <div className="space-y-4">
                {application ? (
                  <p className="text-sm">
                    Başvuru:{" "}
                    <strong>
                      {applicationLabels[application.status] ?? application.status}
                    </strong>
                    {application.institution ? ` · ${application.institution}` : ""}
                  </p>
                ) : null}
                <TeacherApplicationForm />
              </div>
            )}
          </SectionCard>
        ) : !isParent ? (
          <SectionCard
            title="Okul öğretmeni ol"
            description="Okul öğretmeni paneli için kayıt sihirbazında Okul öğretmeniyim seçeneğini kullan veya aşağıdan başvur."
          >
            <TeacherApplicationForm />
          </SectionCard>
        ) : null}
      </div>
    </AppShell>
  );
}
