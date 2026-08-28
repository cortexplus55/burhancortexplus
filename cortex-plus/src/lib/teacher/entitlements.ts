import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPremiumUser } from "@/lib/ai/generate";
import { getUserRoles } from "@/lib/auth/session";

export const FREE_MAX_CLASSROOMS = 1;
export const FREE_MAX_STUDENTS = 30;
export const PENDING_TRIAL_ASSIGNMENTS = 1;
export const PENDING_TRIAL_QUIZZES = 1;
export const PENDING_TRIAL_REPORTS = 1;

export type TeacherTier = "pending" | "verified_free" | "plus";

export type TeacherEntitlements = {
  tier: TeacherTier;
  isVerified: boolean;
  isPremium: boolean;
  classroomLimit: number | null;
  studentLimit: number | null;
  assignmentsCreated: number;
  quizzesGenerated: number;
  reportsViewed: number;
  canCreateClassroom: (currentClassCount: number) => boolean;
  canAddStudent: (currentStudentCount: number) => boolean;
  canCreateAssignment: () => boolean;
  canGenerateQuiz: () => boolean;
  canViewReports: () => boolean;
  canAttachQuizToAssignment: () => boolean;
  remainingTrialAssignments: number | null;
  remainingTrialQuizzes: number | null;
  remainingTrialReports: number | null;
};

type UsageRow = {
  assignments_created: number;
  quizzes_generated: number;
  reports_viewed: number;
};

async function ensureUsageRow(
  service: SupabaseClient,
  userId: string,
): Promise<UsageRow> {
  const { data } = await service
    .from("teacher_usage")
    .select("assignments_created, quizzes_generated, reports_viewed")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) return data as UsageRow;

  await service.from("teacher_usage").insert({ user_id: userId });
  return { assignments_created: 0, quizzes_generated: 0, reports_viewed: 0 };
}

export async function getTeacherEntitlements(
  service: SupabaseClient,
  userId: string,
  roles?: string[],
): Promise<TeacherEntitlements | null> {
  const roleList = roles ?? (await getUserRoles(userId));
  const isTeacher =
    roleList.includes("teacher") ||
    roleList.includes("verified_teacher") ||
    roleList.includes("admin");
  if (!isTeacher) return null;

  const isVerified =
    roleList.includes("verified_teacher") || roleList.includes("admin");
  const isPremium = await isPremiumUser(service, userId);
  const usage = await ensureUsageRow(service, userId);

  let tier: TeacherTier = "pending";
  if (isPremium) tier = "plus";
  else if (isVerified) tier = "verified_free";

  const classroomLimit = isPremium ? null : FREE_MAX_CLASSROOMS;
  const studentLimit = isPremium ? null : FREE_MAX_STUDENTS;

  const canCreateAssignment = () => {
    if (isPremium) return true;
    if (isVerified) return true;
    return usage.assignments_created < PENDING_TRIAL_ASSIGNMENTS;
  };

  const canGenerateQuiz = () => {
    if (!isPremium) {
      if (isVerified) return false;
      return usage.quizzes_generated < PENDING_TRIAL_QUIZZES;
    }
    return true;
  };

  const canViewReports = () => {
    if (isPremium) return true;
    if (isVerified) return false;
    return usage.reports_viewed < PENDING_TRIAL_REPORTS;
  };

  return {
    tier,
    isVerified,
    isPremium,
    classroomLimit,
    studentLimit,
    assignmentsCreated: usage.assignments_created,
    quizzesGenerated: usage.quizzes_generated,
    reportsViewed: usage.reports_viewed,
    canCreateClassroom: (n) =>
      classroomLimit === null ? true : n < classroomLimit,
    canAddStudent: (n) => (studentLimit === null ? true : n < studentLimit),
    canCreateAssignment,
    canGenerateQuiz,
    canViewReports,
    canAttachQuizToAssignment: () => isPremium,
    remainingTrialAssignments: isVerified || isPremium
      ? null
      : Math.max(0, PENDING_TRIAL_ASSIGNMENTS - usage.assignments_created),
    remainingTrialQuizzes: isVerified || isPremium
      ? null
      : Math.max(0, PENDING_TRIAL_QUIZZES - usage.quizzes_generated),
    remainingTrialReports: isVerified || isPremium
      ? null
      : Math.max(0, PENDING_TRIAL_REPORTS - usage.reports_viewed),
  };
}

export async function incrementTeacherUsage(
  service: SupabaseClient,
  userId: string,
  field: "assignments_created" | "quizzes_generated" | "reports_viewed",
) {
  await ensureUsageRow(service, userId);
  const { data } = await service
    .from("teacher_usage")
    .select(field)
    .eq("user_id", userId)
    .maybeSingle();
  const current = (data as Record<string, number> | null)?.[field] ?? 0;
  await service
    .from("teacher_usage")
    .update({
      [field]: current + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function countTeacherStudents(
  service: SupabaseClient,
  teacherId: string,
): Promise<number> {
  const { data: classrooms } = await service
    .from("classrooms")
    .select("id, classroom_members(id)")
    .eq("teacher_id", teacherId);

  return (classrooms ?? []).reduce(
    (sum, c) => sum + (c.classroom_members?.length ?? 0),
    0,
  );
}
