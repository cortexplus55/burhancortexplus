import type { SupabaseClient } from "@supabase/supabase-js";

type Service = SupabaseClient;

export async function getClassroomAccess(
  service: Service,
  classroomId: string,
  userId: string,
) {
  const { data: room } = await service
    .from("classrooms")
    .select("id, name, join_code, teacher_id, created_at")
    .eq("id", classroomId)
    .maybeSingle();

  if (!room) return { room: null, allowed: false, isOwner: false };

  if (room.teacher_id === userId) {
    return { room, allowed: true, isOwner: true };
  }

  const { data: membership } = await service
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", classroomId)
    .eq("student_id", userId)
    .maybeSingle();

  return { room, allowed: Boolean(membership), isOwner: false };
}

export function displayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  const name = fullName?.trim();
  if (name) return name;
  const local = email?.split("@")[0]?.trim();
  return local || "Üye";
}

export function initialFromName(name: string) {
  return name.slice(0, 1).toUpperCase();
}
