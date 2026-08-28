import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  childAvatarLabel,
  firstLinkedProfile,
} from "@/lib/parent/child-profile";
import { planBadgeFromName } from "@/lib/parent/study-days";

export type PlusChildOption = {
  studentId: string;
  name: string;
  avatar: string;
  hasPlus: boolean;
  planBadge: "Plus" | "Sigma" | null;
  periodEnd: string | null;
};

export async function listParentPlusChildren(
  parentId: string,
): Promise<PlusChildOption[]> {
  const service = createServiceClient();
  const { data: links } = await service
    .from("parent_student_links")
    .select(
      "student_id, created_at, profiles!parent_student_links_student_id_fkey(full_name, avatar_url)",
    )
    .eq("parent_id", parentId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const rows = links ?? [];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.student_id as string);
  const { data: subs } = await service
    .from("subscriptions")
    .select("user_id, current_period_end, plans(name, is_premium)")
    .in("user_id", ids)
    .eq("status", "active");

  const byStudent = new Map(
    (subs ?? []).map((row) => [row.user_id as string, row]),
  );

  return rows.map((row) => {
    const studentId = row.student_id as string;
    const child = firstLinkedProfile(row.profiles);
    const sub = byStudent.get(studentId);
    const plan = sub?.plans as
      | { name?: string; is_premium?: boolean }
      | { name?: string; is_premium?: boolean }[]
      | null
      | undefined;
    const planRow = Array.isArray(plan) ? plan[0] : plan;
    const hasPlus = Boolean(sub);
    return {
      studentId,
      name: child?.full_name?.trim() || "Öğrenci",
      avatar: childAvatarLabel(child),
      hasPlus,
      planBadge: hasPlus
        ? planBadgeFromName(planRow?.name) ??
          (planRow?.is_premium ? "Sigma" : "Plus")
        : null,
      periodEnd: (sub?.current_period_end as string | null) ?? null,
    };
  });
}
