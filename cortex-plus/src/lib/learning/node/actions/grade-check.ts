/** `action: "grade-check"`: ders içi tek sorunun sunucuda notlanması ve tekrar varyantı. */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { buildLessonRetryCheck, gradeSectionCheck, resolveCheckForGrade, sealSectionCheck, type CheckGradeVariant, type LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import type { NodeContext } from "@/lib/learning/node/context";

// Ders kontrolü: cevap verilmeden önce istemcide cevap yok; not sunucuda.
// Design B: variant=retry iken aynı deterministik tekrar varyantı yeniden kurulur.
export async function gradeCheckAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, parsed, prepId, nodeId, prep, kind } = context;
  if (kind !== "lesson") return errorResponse(400, "invalid_input");
  const attemptId = parsed.data.attemptId;
  const sectionIndex = parsed.data.sectionIndex;
  const checkAnswer = parsed.data.checkAnswer as LessonCheckAnswer | undefined;
  const variant = (parsed.data.variant ?? "primary") as CheckGradeVariant;
  if (!attemptId || sectionIndex == null || !checkAnswer) {
    return errorResponse(400, "invalid_input");
  }
  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, payload, status")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!attempt?.payload) return errorResponse(404, "not_found");
  // V2 ya da V3 kayıt: ekran i = bölüm i, ekranın sorusu bölümün sorusu.
  const lesson = readLessonV2((attempt.payload as { lesson?: unknown }).lesson);
  const section = lesson?.sections?.[sectionIndex];
  const primary = section?.check;
  if (!primary) return errorResponse(400, "invalid_input");
  const check = resolveCheckForGrade(
    primary,
    variant,
    prepLanguage(prep.learning_preferences),
    section?.body ?? "",
  );
  const result = gradeSectionCheck(check, checkAnswer);
  // Primary notlandırmadan sonra sealed retry gönderilir (cevap zaten açık).
  if (variant === "primary") {
    const retry = buildLessonRetryCheck(
      primary,
      prepLanguage(prep.learning_preferences),
      section?.body ?? "",
    );
    return NextResponse.json({
      ok: true,
      ...result,
      retryCheck: sealSectionCheck(retry),
    });
  }
  // Tekrarın "doğrusu" (22 Ekim 2026 inceleme): yazarın tam öğesi kendi doğrusunu taşır; kodun kurduğu tekrar
  // aynı olgunun başka ifadesidir (`sameFactOnly`), ana sorunun doğrusu ona da aittir; başka olgu kuran yedekler
  // ders yolunda çalışmaz. Eski "kök farklı, doğrusu aynıysa gizle" kuralı aynı doğruyu taşıyan tam öğenin kendi
  // doğrusunu da siliyordu.
  return NextResponse.json({ ok: true, ...result });
}
