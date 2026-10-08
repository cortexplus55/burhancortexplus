import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { contentModel } from "@/lib/ai/model-router";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { loadPrepDocumentIds } from "@/lib/documents/teacher-analysis-run";
import { env } from "@/lib/env";
import { corePageRun } from "@/lib/learning/core-pages";
import { oralTeacherStyleLine } from "@/lib/learning/oral-exam-chrome";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  kind: z.enum(["qa", "oral"]),
  topicLabel: z.string().min(1).max(120),
  difficulty: z.enum(["kolay", "orta", "ileri"]).default("orta"),
  /** Sözlü kabuktaki öğretmen havası. Yoksa eski sohbet davranışı durur. */
  teacherStyle: z.enum(["strict", "helpful", "harsh"]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(20),
});

/** Konuşma dilinde kısa tur; ekran okuyucu ve ses için düz metin. */
const VOICE_REPLY_MAX = 700;
/** Sözlü sınav bu kadar öğretmen turundan sonra kapanır. */
const ORAL_TURNS = 5;

/**
 * Sesli çalışma (3 Ekim 2026): hazırlık sohbetinin öğretmen motoru —
 * konunun temiz çekirdek sayfaları, cevabı belgeye karşı denetleyen ikinci
 * çağrı, sorunluysa bir kez daha yazma. Eski JSON şablon zinciri kalktı.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-voice", limit: 24 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!env.OPENAI_API_KEY) return errorResponse(503, "generation_failed");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, document_id, learning_preferences")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("session_meta")
    .eq("id", parsed.data.nodeId)
    .eq("exam_prep_id", prep.id)
    .maybeSingle();

  // Kaynak: düğümün kendi sayfaları; yoksa konunun belgedeki sayfaları; belge
  // yoksa genel öğretmen (belgesiz hazırlık).
  const prepDocs = await loadPrepDocumentIds(service, prep.id as string);
  const documentId = (prep.document_id as string | null) ?? prepDocs[0] ?? null;
  const sourcePages = parseSessionMeta(node?.session_meta)?.sourcePages ?? [];
  let pages: { page: number; text: string }[] = [];
  if (documentId && sourcePages.length) {
    const edges = await documentRunningHeaders(service, documentId);
    pages = (await ensureCleanPages(service, { userId, documentId, pages: corePageRun(sourcePages), edges })).map(
      (item) => ({ page: item.page, text: item.text }),
    );
  } else if (documentId) {
    pages = (await studioTeacherSource(service, { userId, topic: parsed.data.topicLabel, documentId }))?.pages ?? [];
  }
  if (documentId && !pages.length) return errorResponse(503, "source_unavailable");

  const language = prepLanguage(prep.learning_preferences);
  const oral = parsed.data.kind === "oral";
  const voiceLine =
    language === "en"
      ? oral
        ? "VOICE ORAL EXAM: ask one short question, listen, give a hint if needed, then move on. Spoken English, 2-4 sentences, no markdown, no lists."
        : "VOICE LESSON: explain one step, ask a question and wait. Spoken English, 2-4 sentences, no markdown, no lists."
      : oral
        ? "SESLİ SÖZLÜ SINAV: kısa bir soru sor, cevabı dinle, gerekirse ipucu ver, sonra sonraki soruya geç. Konuşma dili, 2-4 cümle; başlık, madde, tablo, emoji yok."
        : "SESLİ DERS: bir adımı anlat, bir soru sor ve cevabı bekle. Konuşma dili, 2-4 cümle; başlık, madde, tablo, emoji yok.";
  const style = parsed.data.teacherStyle ? oralTeacherStyleLine(parsed.data.teacherStyle) : "";

  const history = parsed.data.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const last = parsed.data.messages[parsed.data.messages.length - 1];
  const message =
    last?.role === "user"
      ? last.content
      : language === "en"
        ? "The student has not spoken yet. Say hello and begin."
        : "Öğrenci henüz konuşmadı; merhaba de ve başla.";

  const reservation = await reserveCredits(
    service,
    userId,
    "VOICE_TURN",
    `voice:${userId}:${parsed.data.nodeId}:${parsed.data.messages.length}:${crypto.randomUUID()}`,
  );
  if (!reservation.ok) {
    return errorResponse(reservation.reason === "insufficient_credits" ? 402 : 409, reservation.reason);
  }

  const model = contentModel();
  try {
    const outcome = await runTeacherTutor({
      client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
      model,
      context: {
        examTitle: (prep.title as string | null) ?? (prep.exam_type as string | null),
        topic: parsed.data.topicLabel,
        learnerLines: [voiceLine, style, `Zorluk: ${parsed.data.difficulty}.`].filter(Boolean),
        passages: pages.map((item) => ({ label: `s.${item.page}`, text: item.text })),
        mode: pages.length ? "document" : "general",
      },
      history,
      message,
      onUsage: (tokensIn, tokensOut) =>
        recordUsage(service, {
          userId,
          actionCode: "VOICE_TURN",
          model,
          tokensIn,
          tokensOut,
          reservationId: reservation.reservationId,
        }).then(() => undefined, () => undefined),
    });
    if (!outcome.ok) {
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      console.error("voice_tutor_rejected", { reasons: outcome.reasons.slice(0, 4) });
      return errorResponse(503, "generation_failed", { refunded: true });
    }
    await commitCredits(service, reservation.reservationId);
    const teacherTurns = parsed.data.messages.filter((m) => m.role === "assistant").length + 1;
    return NextResponse.json({
      ok: true,
      reply: outcome.content.replace(/\s+/g, " ").trim().slice(0, VOICE_REPLY_MAX),
      done: oral && teacherTurns >= ORAL_TURNS,
    });
  } catch (error) {
    await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error("voice_tutor_failed", { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    return errorResponse(502, "generation_failed", { refunded: true });
  }
}
