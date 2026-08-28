import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { ProfileForm } from "@/components/profile/profile-form";
import { TeacherApplicationForm } from "@/components/profile/teacher-application-form";
import {
  ParentRequests,
  type ParentRequest,
} from "@/components/profile/parent-requests";
import { ParentProfileForm } from "@/components/parent/parent-profile-form";
import { PendingChildCard } from "@/components/parent/pending-child-card";
import { Badge } from "@/components/ui/badge";
import { getUserRoles, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { parseTutorStyle } from "@/lib/learning/tutor-style";
import {
  childAvatarLabel,
  childMetaLine,
  firstLinkedProfile,
} from "@/lib/parent/child-profile";
import { parentPlusHref } from "@/lib/parent/plus-href";
import type { ParentRelation } from "@/lib/parity/signup";
import { PARENT_RELATION_OPTIONS } from "@/lib/parity/signup";

export const metadata = { title: "Profil" };

const applicationLabels: Record<string, string> = {
  pending: "Değerlendirmede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

function relationLabel(value: string | null | undefined) {
  return (
    PARENT_RELATION_OPTIONS.find((option) => option.id === value)?.title ?? null
  );
}

export default async function ProfilPage() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);

  const [{ data: profile }, { data: application }, { data: parentLinks }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, grade_level, locale, created_at, invite_code, primary_role, tutor_style, parent_relation, phone",
        )
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

  if (isParent) {
    const { data: children } = await supabase
      .from("parent_student_links")
      .select(
        "id, status, invite_email, created_at, student_id, profiles!parent_student_links_student_id_fkey(full_name, grade_level, school_name, avatar_url)",
      )
      .eq("parent_id", user.id)
      .neq("status", "revoked")
      .order("created_at", { ascending: false });

    const rows = children ?? [];
    const active = rows.filter((row) => row.status === "active");
    const pending = rows.filter((row) => row.status === "pending");
    const relation = relationLabel(profile?.parent_relation as string | null);

    return (
      <AppShell title="Profil" accountStrip={false}>
        <section className="pt-2">
          <h1 className="text-xl font-semibold">Profil</h1>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            {user.email}
            {relation ? ` · ${relation}` : " · Veli"}
            {" · Katılım "}
            {formatDate(profile?.created_at)}
          </p>
        </section>

        <section className="astra-pay-card mt-5 p-5">
          <h2 className="font-semibold">Hesap bilgileri</h2>
          <p className="mt-1 text-xs text-[var(--astra-muted)]">
            Yakınlık ve telefon yalnızca sende görünür; çocuğun sohbetlerine
            yansımaz.
          </p>
          <div className="mt-4">
            <ParentProfileForm
              fullName={profile?.full_name ?? ""}
              locale={(profile?.locale as "tr" | "en") ?? "tr"}
              parentRelation={
                (profile?.parent_relation as ParentRelation | null) ?? null
              }
              phone={(profile?.phone as string | null) ?? ""}
            />
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--astra-muted)]">
              Bağlı öğrenciler
            </h2>
            <Link
              href="/veli"
              className="text-xs font-semibold text-[var(--astra-primary)]"
            >
              Yönet
            </Link>
          </div>
          {active.length ? (
            <ul className="space-y-2">
              {active.map((row) => {
                const child = firstLinkedProfile(row.profiles);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/veli/cocuk/${row.student_id}`}
                      className="astra-pay-card flex items-center gap-3 p-3"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800/90 text-sm">
                        {childAvatarLabel(child)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {child?.full_name ?? "Öğrenci"}
                        </span>
                        <span className="block truncate text-xs text-[var(--astra-muted)]">
                          {childMetaLine(child)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {pending.length ? (
            <div className="mt-3 space-y-2">
              {pending.map((row) => {
                const child = firstLinkedProfile(row.profiles);
                return (
                  <PendingChildCard
                    key={row.id}
                    linkId={row.id as string}
                    title={
                      child?.full_name ??
                      (row.invite_email as string) ??
                      "Davet"
                    }
                    createdAt={row.created_at as string}
                  />
                );
              })}
            </div>
          ) : null}
          {!active.length && !pending.length ? (
            <p className="astra-pay-card p-4 text-sm text-[var(--astra-muted)]">
              Henüz bağlı öğrenci yok. Çocuklarım’dan davet gönder.
            </p>
          ) : null}
        </section>

        <Link
          href={parentPlusHref()}
          className="astra-pay-card mt-6 flex w-full items-center justify-center p-4 text-sm font-medium"
        >
          Çocuk kotası için Plus
        </Link>
      </AppShell>
    );
  }

  const requests: ParentRequest[] = (parentLinks ?? []).map((row) => ({
    id: row.id as string,
    parentName:
      (row.profiles as { full_name?: string } | null)?.full_name ?? "Bir veli",
    createdAt: row.created_at as string | null,
  }));

  return (
    <AppShell title="Profil" accountStrip={false}>
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
            tutorStyle={parseTutorStyle(profile?.tutor_style)}
          />
        </SectionCard>

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

        {isSchoolTeacher ? (
          <SectionCard
            title="Okul öğretmeni doğrulaması"
            description="Panel kayıt sonrası açılır. Belge onayı tam ödev haklarını açar; Plus sınırsız sınıf ve rapor sunar."
          >
            {isVerifiedTeacher ? (
              <p className="text-sm">
                Hesabın doğrulandı. Öğretmen panelinden sınıf ve ödevlerini
                yönetebilirsin.{" "}
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
                      {applicationLabels[application.status] ??
                        application.status}
                    </strong>
                    {application.institution
                      ? ` · ${application.institution}`
                      : ""}
                  </p>
                ) : null}
                <TeacherApplicationForm />
              </div>
            )}
          </SectionCard>
        ) : (
          <SectionCard
            title="Okul öğretmeni ol"
            description="Okul öğretmeni paneli için kayıt sihirbazında Okul öğretmeniyim seçeneğini kullan veya aşağıdan başvur."
          >
            <TeacherApplicationForm />
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
