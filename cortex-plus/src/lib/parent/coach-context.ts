import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getChildSummary } from "@/lib/parent/child-summary";

/** Destek AI için onaylı çocukların sohbetsiz özeti. */
export async function getParentCoachContext(parentId: string): Promise<string> {
  const service = createServiceClient();
  const { data: links } = await service
    .from("parent_student_links")
    .select(
      "student_id, profiles!parent_student_links_student_id_fkey(full_name, grade_level)",
    )
    .eq("parent_id", parentId)
    .eq("status", "active");

  if (!links?.length) {
    return "Velinin onaylı bağlı çocuğu yok. Genel ebeveyn tavsiyesi ver; özel ilerleme uydurma.";
  }

  const lines: string[] = [
    "Aşağıdaki ilerleme özetleri onaylı çocuklara aittir. Sohbet içeriğin yok; mesaj metni isteme veya uydurma.",
  ];

  for (const row of links) {
    const studentId = row.student_id as string | null;
    if (!studentId) continue;
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    const name =
      (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
      "Öğrenci";
    const grade =
      (profile as { grade_level?: string | null } | null)?.grade_level ?? "";
    const summary = await getChildSummary(parentId, studentId);
    if (!summary) continue;
    const topics = summary.topics.map((t) => t.label).join(", ") || "yok";
    lines.push(
      `- ${name}${grade ? ` (${grade})` : ""}: son 30 günde ${summary.activeDays} aktif gün, ${summary.examAttempts} deneme (ort ${summary.averageScore ?? "—"}), ${summary.quizAttempts} quiz, ${summary.openTasks} açık görev, zayıf konular: ${topics}, paket: ${summary.planBadge ?? "ücretsiz"}.`,
    );
  }

  return lines.join("\n");
}
