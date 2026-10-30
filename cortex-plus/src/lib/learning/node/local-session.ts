/**
 * Kayıtlardan kurulan etkinlikler (model çağırmadan): odaklı pratik, son kontrol, hazır olma, zayıf nokta
 * (boşluk) ve kilitli tekrar. Hazırsa kayıt açılır ve yanıt döner; değilse seçilen konular üretime gider.
 */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { weakPracticeTitle } from "@/lib/learning/exam-prep-plan";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { buildLocalSessionPayload, gapsNothingOpenPayload, isPathTurn, spacedReviewGate } from "@/lib/learning/exam-local-session";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import { findAttemptByClientRequest } from "@/lib/learning/attempt-lifecycle-persist";
import { readWalletBalance } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function openLocalSession(context: NodeContext, state: Pick<StartLocals, "topic" | "clientRequestId" | "title" | "topicLabel">) {
  const { userId, service, prepId, nodeId, lessonFormat, prep, node, kind, requestedTopic, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, clientRequestId } = state;
  let { title, topicLabel } = state;
  let practiceTopics: string[] | undefined;
  let finalFill: { seed: QuizQuestion[]; topics: string[]; perTopic: number; previousStems?: string[] } | null = null;
  // Bilgi boşlukları ve Tekrar kilitliyse (Astra, 1 Ekim 2026) ücretsiz
  // "kilitli" cevabı döner. Bitmiş düğüm yeniden açılırken kilit sorulmaz.
  const lockable = (kind === "gaps" || kind === "spaced") && node.status !== "done";
  if (kind === "focused" || kind === "final_check" || kind === "readiness" || lockable) {
    let local: Awaited<ReturnType<typeof buildLocalSessionPayload>>;
    try {
      local =
        kind === "spaced"
          ? await spacedReviewGate(service, prepId)
          : await buildLocalSessionPayload(service, {
              userId,
              prepId,
              kind: kind as "focused" | "final_check" | "readiness" | "gaps",
              prepTitle: prep.title ?? "Hazırlık",
              targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
              learningPreferences: prep.learning_preferences,
              // `?konu=` (22 Ekim 2026 inceleme): seçilen konu önce hazır sorulardan; yoksa üretim ve yeniden
              // hedefleme. Seçim yoksa uyarlamalı odaklı pratiğin konusu.
              focusTopic: (kind === "focused" && requestedTopic) || adaptiveFocusTopic(kind, node.session_meta, topicLabel),
            });
    } catch {
      return errorResponse(503, "generation_failed");
    }
    // Yolda sırası gelen "Bilgi boşlukları" kilitli dönerse yol orada durur (20 Ekim 2026): adımı
    // tamamlayacak düğme yok. Sırası gelmişse kapatılacak boşluk olmadığı söylenir, adım biter.
    if (local.action === "serve" && local.payload.locked === true && kind === "gaps" && (await isPathTurn(service, prepId, node))) {
      local = gapsNothingOpenPayload();
    }
    if ((kind === "gaps" || kind === "focused") && local.topics?.length) {
      // Tek konu (30 Ekim 2026, Paket I #8, `rankFinalStepTopics`): etiket, oturum başlığı, sorular ve kanıt
      // aynı konu. Hazır sorular yalnız bu konudan seçildi; içerik konuyu taşır.
      const chosen = local.topics[0]!;
      title = weakPracticeTitle(kind, [chosen]);
      topicLabel = chosen;
      if (local.action === "serve" && local.payload.type === "quiz" && typeof local.payload.testedTopic !== "string") {
        local = { ...local, payload: { ...local.payload, testedTopic: chosen } };
      }
    }
    if (local.action === "serve" && local.payload.locked === true) {
      // Kayıt açılmaz: kilit kalkınca düğüm temiz başlasın.
      return NextResponse.json({ ok: true, kind, title, topicLabel, voiceMode: false, payload: local.payload });
    }
    if (local.action === "serve") {
      const questions = (local.payload.questions as unknown[] | undefined) ?? [];
      const total = local.payload.type === "quiz" ? Math.max(1, questions.length) : 1;
      const row = {
        node_id: nodeId,
        exam_prep_id: prepId,
        user_id: userId,
        topic_id: topic?.id ?? null,
        difficulty,
        voice_mode: false,
        payload: local.payload,
        total,
        status: "active" as const,
        familiarity,
        mood,
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
      };
      let { data: created, error: insertError } = await service
        .from("exam_prep_node_attempts")
        .insert(row)
        .select("id")
        .single();
      if (insertError && clientRequestId) {
        const raced = await findAttemptByClientRequest(service, {
          userId,
          nodeId,
          clientRequestId,
        });
        if (raced?.id) {
          created = { id: raced.id };
          insertError = null;
        }
      }
      if (insertError || !created) return errorResponse(500, "generation_failed");
      if (node.status !== "done") {
        const meta =
          node.session_meta && typeof node.session_meta === "object" && !Array.isArray(node.session_meta)
            ? { ...(node.session_meta as Record<string, unknown>) }
            : {};
        await service
          .from("exam_prep_nodes")
          .update({
            status: "ready",
            ...((kind === "gaps" || kind === "focused") && local.topics?.length
              ? { title, session_meta: { ...meta, topicTitle: local.topics[0] } }
              : {}),
          })
          .eq("id", nodeId);
      }
      return NextResponse.json({
        ok: true,
        attemptId: created.id,
        kind,
        title,
        topicLabel,
        voiceMode: false,
        payload: await publicPayloadForUser(service, userId, local.payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
        ...(await readWalletBalance(service, userId)),
      });
    }
    practiceTopics = local.topics;
    if (local.fill) {
      finalFill = {
        seed: local.fill.seed,
        topics: local.topics,
        perTopic: local.fill.perTopic,
        previousStems: local.fill.previousStems,
      };
    }
  }
  return { practiceTopics, finalFill, title, topicLabel };
}
