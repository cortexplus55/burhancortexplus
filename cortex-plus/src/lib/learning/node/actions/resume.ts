/** `action: "resume"`: açık kaydı sürdürme ve bitirme yoklaması (salt okuma). */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { kindListFilter, pathSkipKinds } from "@/lib/billing/node-free-meter";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { attemptStartResponse, findResumableAttempt } from "@/lib/learning/attempt-lifecycle-persist";
import { readWalletBalance } from "@/lib/learning/node/shared";
import { completedAttemptBody, completionClaimFresh } from "@/lib/learning/node/completion";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "@/lib/learning/node/context";

// --- Stage 8: resume in-progress attempt (flag ON) ---
export async function resumeAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, parsed, prepId, nodeId, lessonFormat, teachingV2, prep, node, kind, topicLabel, title, lessonReviewCards } = context;
  if (!teachingV2) return errorResponse(400, "invalid_input");
  // Yoklama (30 Ekim 2026, Paket I): istemci bitirmenin yanıtını alamadıysa ya da sunucu sözlüyü
  // arka planda notluyorsa bu kaydı sorar. Salt okuma: notlandırma başlatmaz, kredi düşmez.
  if (parsed.data.attemptId) {
    const { data: polled, error: pollError } = await service
      .from("exam_prep_node_attempts")
      .select("id, status, payload, answers, score, total, generation_id, complete_request_id, content_version, updated_at")
      .eq("id", parsed.data.attemptId)
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .maybeSingle();
    if (pollError) return errorResponse(503, "attempt_lookup_failed");
    if (!polled) return NextResponse.json({ ok: true, resumed: false, found: false });
    if (polled.status === "completed") {
      const nextAfter = async () => {
        const skip = await pathSkipKinds(service, userId);
        let query = service
          .from("exam_prep_nodes")
          .select("id")
          .eq("exam_prep_id", prepId)
          .gt("sort_order", node.sort_order);
        if (skip.size) query = query.not("kind", "in", kindListFilter(skip));
        return query.order("sort_order").limit(1).maybeSingle();
      };
      return NextResponse.json({
        ...(await completedAttemptBody(service, { userId, prepId, nodeId, attempt: polled, topicLabel, nextAfter })),
        resumed: false,
        completed: true,
        grading: false,
        attemptId: polled.id,
      });
    }
    return NextResponse.json({
      ok: true,
      resumed: false,
      completed: false,
      grading: completionClaimFresh(polled),
      // Açık kayıt: bitirme sunucuya ulaşmadı (ya da düştü). İstemci kaydı bu sürümle sürdürür.
      active: polled.status === "active",
      attemptId: polled.id,
      generationId: polled.generation_id,
      contentVersion: polled.content_version ?? 1,
      updatedAt: polled.updated_at ?? null,
    });
  }
  const attempt = await findResumableAttempt(service, {
    userId,
    prepId,
    nodeId,
  });
  if (!attempt?.payload) {
    return NextResponse.json({ ok: true, resumed: false });
  }
  // Bitirme gönderilmiş, notlandırma sürüyor: sorulara dönülmez, ekran sonucu bekler.
  if (completionClaimFresh(attempt)) {
    return NextResponse.json({ ok: true, resumed: false, grading: true, state: "grading", attemptId: attempt.id });
  }
  return NextResponse.json({
    ...attemptStartResponse(attempt, {
      kind,
      title,
      topicLabel,
      publicPayload: await publicPayloadForUser(service, userId, attempt.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
      resumed: true,
    }),
    // Tarayıcı taslağı bu zamandan yeniyse istemcide taslak üstün gelir (Paket I).
    updatedAt: attempt.updated_at ?? null,
    ...(await readWalletBalance(service, userId)),
  });
}
