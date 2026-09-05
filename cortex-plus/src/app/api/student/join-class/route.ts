import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { peekCount, rateLimit, userKey } from "@/lib/rate-limit";
import { recordAbuse } from "@/lib/abuse/record";
import {
  countTeacherStudents,
  getTeacherEntitlements,
} from "@/lib/teacher/entitlements";

const schema = z.object({
  code: z.string().min(4).max(12),
});

/**
 * Yanlış kod denemesi için ayrı ve dar bir sayaç.
 *
 * Katılma kodu altı haneli onaltılık; deneyerek bulmak makinelerin sevdiği
 * türden bir iş. Genel istek sınırı bunu görmüyor, çünkü saatte on istek
 * normal bir sayı. Görülmesi gereken şey isteğin sayısı değil, kaçının boşa
 * çıktığı: doğru kodu bilen bir öğrenci ikinci denemede içeride olur.
 */
const MISS_LIMIT = 8;
const MISS_WINDOW = 3600;

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "join-class",
    limit: 10,
    dailyLimit: 40,
  });
  if (!guard.ok) return guard.response;
  const { supabase, service, userId } = guard.ctx;
  const user = { id: userId };
  const missKey = userKey(userId, "join-class-miss");

  // Sayaç yalnızca yanlış denemede artıyor, o yüzden burada artırmadan
  // bakılıyor: doğru kodu giren öğrenci kotasından yemesin.
  if ((await peekCount(missKey)) >= MISS_LIMIT) {
    void recordAbuse({
      signal: "token_bruteforce",
      severity: "high",
      scope: "join-class",
      userId,
      request,
      metadata: { missLimit: MISS_LIMIT, windowSeconds: MISS_WINDOW },
    });
    return NextResponse.json(
      {
        error: "too_many_attempts",
        message:
          "Çok fazla yanlış kod denendi. Bir süre sonra tekrar deneyebilirsin.",
      },
      { status: 429, headers: { "Retry-After": String(MISS_WINDOW) } },
    );
  }

  const roles = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const roleList = (roles.data ?? []).map((r) => r.role as string);
  if (
    !roleList.includes("student") &&
    !roleList.includes("admin")
  ) {
    return NextResponse.json({ error: "student_only" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const code = parsed.data.code.trim().toUpperCase();

  const { data: classroom } = await service
    .from("classrooms")
    .select("id, teacher_id, name")
    .eq("join_code", code)
    .maybeSingle();

  if (!classroom) {
    // Boşa çıkan deneme sayılıyor. Yanıt her hâlükârda aynı 404: hangi
    // kodun var olduğunu sızdırmamak, kod aramayı zorlaştırmanın diğer yarısı.
    await rateLimit(missKey, MISS_LIMIT, MISS_WINDOW);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: existing } = await service
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", classroom.id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, classroomId: classroom.id, already: true });
  }

  const entitlements = await getTeacherEntitlements(
    service,
    classroom.teacher_id,
  );
  const studentCount = await countTeacherStudents(service, classroom.teacher_id);

  if (entitlements && !entitlements.canAddStudent(studentCount)) {
    return NextResponse.json(
      { error: "teacher_student_limit", message: "Öğretmenin öğrenci limiti doldu." },
      { status: 403 },
    );
  }

  const { error } = await supabase.from("classroom_members").insert({
    classroom_id: classroom.id,
    student_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: "join_failed" }, { status: 500 });
  }

  revalidatePath("/siniflar");
  revalidatePath(`/siniflar/${classroom.id}`);
  return NextResponse.json({
    ok: true,
    classroomId: classroom.id,
    classroomName: classroom.name,
  });
}
