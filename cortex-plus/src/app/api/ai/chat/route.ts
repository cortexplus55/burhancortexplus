import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { loadActivePrompt, PROMPT_KEYS } from "@/lib/ai/prompts";
import { EducationalVerificationError, verifyEducationalContent } from "@/lib/ai/quality-gate";
import { chatFallbackMessage } from "@/lib/ai/chat-fallback";
import { errorResponse, withUser } from "@/lib/api/guards";
import { selectModel } from "@/lib/ai/model-router";
import { claimHardUpgrade } from "@/lib/ai/model-upgrade";
import { freeImageAllowed } from "@/lib/ai/image-quota";
import { assessQuestionDifficulty } from "@/lib/ai/question-difficulty";
import { SYSTEM_GUARDRAIL, isPremiumUser } from "@/lib/ai/generate";
import { moderate } from "@/lib/ai/moderation";
import { recordAbuse } from "@/lib/abuse/record";
import { parseTutorStyle, tutorStylePrompt } from "@/lib/learning/tutor-style";
import { env, type ActionCode } from "@/lib/env";
import { recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import { searchDocumentChunks } from "@/lib/rag/pipeline";
import { NO_SOURCE_CREDIT_NOTE, NO_SOURCE_MESSAGE, saidNoSource, stripNoSourceMarker } from "@/lib/ai/grounding";
import { chatSourceBlock } from "@/lib/learning/chat-source-block";
import { extractText } from "@/lib/documents/extract-text";
import { isOwnedDocumentPath } from "@/lib/documents/storage-path";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { loadExamChatContext } from "@/lib/learning/exam-chat-context";
import { citationHref, type ChatCitation, type ChatEvidence } from "@/lib/ai/chat-citations";
import { verifyDocumentAnswer } from "@/lib/ai/document-answer-verification";
import { chatRequestHash, chatResultResponse, prepareChatOperation, type SavedChatResult } from "@/lib/ai/chat-operation";

export const maxDuration = 300;
const bodySchema = z.object({
  message: z.string().trim().min(1).max(12000),
  operationId: z.string().uuid().optional(),
  actionCode: z.enum(["AI_CHAT_STANDARD", "AI_CHAT_ADVANCED"]).default("AI_CHAT_STANDARD"),
  conversationId: z.string().uuid().optional(),
  useDocuments: z.boolean().default(false),
  documentsOnly: z.boolean().default(true),
  audience: z.enum(["student"]).default("student"),
  imageDocumentId: z.string().uuid().optional(),
  prepId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "chat", limit: 40, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { message, useDocuments, documentsOnly, operationId: providedId, ...rest } = parsed.data;
  const operationId = providedId ?? crypto.randomUUID();
  const operation = await prepareChatOperation(service, {
    userId, operationId, conversationId: rest.conversationId,
    requestHash: chatRequestHash({ message, useDocuments, documentsOnly, ...rest }),
  });
  if (!operation.ok) return NextResponse.json({ error: operation.error }, { status: operation.status });
  if (operation.result) return chatResultResponse(operation.result, documentsOnly);

  let reservationId: string | null = null;
  // Settlement and transcript persistence happen together in complete_chat_operation.
  // No response is labelled successful until that transaction has committed.
  async function undoSpend() {
    if (reservationId) await refundCredits(service, reservationId);
  }

  try {
    let imageUrl: string | null = null;
    let evidence: ChatEvidence[] = [];
    let documentPages = 0;
    let documentAttached = false;
    if (rest.imageDocumentId) {
      const { data: doc, error } = await service.from("documents")
        .select("storage_path,mime_type,file_name").eq("id", rest.imageDocumentId)
        .eq("user_id", userId).is("deleted_at", null).maybeSingle();
      if (error) return errorResponse(503, "Belgene şu an erişilemiyor.");
      if (!doc || !isOwnedDocumentPath(doc.storage_path, userId, rest.imageDocumentId)) return errorResponse(404, "document_not_found");
      if (doc.mime_type?.startsWith("image/")) {
        const { data, error: signedError } = await service.storage.from("documents").createSignedUrl(doc.storage_path, 300);
        if (signedError || !data) return errorResponse(503, "Görsel açılamadı. Yeniden dene.");
        imageUrl = data.signedUrl;
      } else if (doc.mime_type === "application/pdf" || doc.mime_type === "text/plain") {
        documentAttached = true;
        // Prefer the canonical parsed pages, including OCR, over reparsing every question.
        const { data: pages, error: pagesError } = await service.from("document_pages")
          .select("id,page_number,text_content").eq("document_id", rest.imageDocumentId).order("page_number");
        if (pagesError) throw new Error("source_unavailable");
        let sourcePages = (pages ?? []).map((p) => ({ page: p.page_number as number, text: p.text_content as string }));
        if (!sourcePages.length) {
          const { data, error: downloadError } = await service.storage.from("documents").download(doc.storage_path);
          if (downloadError || !data) throw new Error("source_unavailable");
          const extracted = await extractText(Buffer.from(await data.arrayBuffer()), doc.mime_type);
          if (!extracted.ok) return errorResponse(422, "Belge henüz okunamıyor. Belgeler ekranından işlem durumunu kontrol et.");
          sourcePages = extracted.pages.map((text, i) => ({ page: i + 1, text }));
        }
        documentPages = sourcePages.length;
        if (sourcePages.reduce((n, p) => n + p.text.length, 0) > 80000) {
          return errorResponse(413, "Bu sohbet için belge çok uzun. Daha kısa bir bölüm seçebilirsin.");
        }
        evidence = sourcePages.filter((p) => p.text.trim()).map((p, i) => ({
          reference: i + 1, documentId: rest.imageDocumentId!, documentName: doc.file_name,
          pageNumber: p.page, chunkId: null, content: p.text,
        }));
      } else return errorResponse(422, "Bu dosya türü sohbet içinde desteklenmiyor.");
    }

    // Moderation and the free-image allowance precede any credit reservation.
    const verdict = await moderate({ text: message, imageUrls: imageUrl ? [imageUrl] : [] });
    if (verdict.action !== "allow") void recordAbuse({ signal: "moderation", severity: verdict.action === "flag" ? "low" : "high", scope: "chat", userId, request, metadata: { categories: verdict.categories, outcome: verdict.action } });
    if (verdict.action === "block" || verdict.action === "support") return new Response(verdict.message, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Credits-Used": "0" },
    });
    const isPremium = await isPremiumUser(service, userId);
    if (imageUrl && !(await freeImageAllowed(userId, isPremium))) return errorResponse(429, "free_image_limit");

    let priorUserTurns = 0;
    if (rest.conversationId) {
      const { count, error } = await service.from("messages").select("id", { count: "exact", head: true })
        .eq("conversation_id", rest.conversationId).eq("user_id", userId).eq("role", "user");
      if (error) throw new Error("history_unavailable");
      priorUserTurns = count ?? 0;
    }
    const difficulty = assessQuestionDifficulty({ message, turn: priorUserTurns + 1, hasImage: Boolean(imageUrl) });
    const routerInput = { actionCode: rest.actionCode as ActionCode, isPremium, hasImage: Boolean(imageUrl), userSelectedAdvanced: rest.actionCode === "AI_CHAT_ADVANCED", documentPages, difficulty: difficulty.level };
    const routed = selectModel(routerInput);
    const { model, actionCode } = routed.upgrade === "difficulty" && !(await claimHardUpgrade(service, userId))
      ? selectModel({ ...routerInput, hardUpgradeAllowed: false }) : routed;
    const reserved = await reserveCredits(service, userId, actionCode, `chat:${operationId}`);
    if (!reserved.ok) return errorResponse(reserved.reason === "insufficient_credits" ? 402 : reserved.reason.startsWith("operation_") ? 409 : 503, reserved.reason);
    reservationId = reserved.reservationId;
    if (!env.OPENAI_API_KEY) { await undoSpend(); return errorResponse(503, "ai_not_configured"); }

    if (useDocuments && !documentAttached && !imageUrl) {
      const matches = await searchDocumentChunks(service, userId, message, 6, {
        minSimilarity: documentsOnly ? 0.32 : undefined,
      });
      evidence = matches.map((m, i) => ({ reference: i + 1, documentId: m.documentId, documentName: m.documentName, pageNumber: m.pageNumber, chunkId: m.chunkId, content: m.content }));
    }
    const grounded = useDocuments || documentAttached;
    const strict = grounded && documentsOnly;
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (rest.conversationId) {
      const { data, error } = await service.from("messages").select("role,content")
        .eq("conversation_id", rest.conversationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(16);
      if (error) throw new Error("history_unavailable");
      let chars = 0;
      for (const row of data ?? []) {
        if (row.role !== "assistant" && row.role !== "user") continue;
        if (chars + row.content.length > 24000) break;
        chars += row.content.length;
        history.unshift({ role: row.role, content: row.content });
      }
    }
    let content = "";
    let charge = true;
    let citations: ChatCitation[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    if (strict && !evidence.length && !imageUrl) {
      content = NO_SOURCE_MESSAGE + NO_SOURCE_CREDIT_NOTE;
      charge = false;
    } else {
      const { data: profile } = await service.from("profiles").select("tutor_style").eq("id", userId).maybeSingle();
      const studentInstruction = await loadActivePrompt(service, PROMPT_KEYS.studentChat);
      const examContext = rest.prepId ? await loadExamChatContext(service, userId, rest.prepId) : null;
      // Full page context is used for an attachment; RAG supplies selected chunks.
      const contextBlock = grounded ? chatSourceBlock(evidence, { documentsOnly: strict, maxCharsPerChunk: documentAttached ? 80000 : 3000 }) : "";
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: `${SYSTEM_GUARDRAIL} ${studentInstruction} ${tutorStylePrompt(parseTutorStyle(profile?.tutor_style))}${examContext?.block ?? ""}${contextBlock}` },
        ...history,
        { role: "user", content: imageUrl ? [{ type: "text", text: message }, { type: "image_url", image_url: { url: imageUrl } }] : message },
      ];
      let accepted = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const generationModel = attempt && isPremium ? env.OPENAI_ADVANCED_MODEL : model;
        const response = await client.chat.completions.create({ model: generationModel, messages: requestMessages }, { signal: request.signal, timeout: 60_000, maxRetries: 0 });
        tokensIn += response.usage?.prompt_tokens ?? 0;
        tokensOut += response.usage?.completion_tokens ?? 0;
        await recordUsage(service, { userId, actionCode, model: generationModel, tokensIn: response.usage?.prompt_tokens ?? 0, tokensOut: response.usage?.completion_tokens ?? 0, reservationId });
        try {
          const verified = await verifyEducationalContent({ client,
            context: JSON.stringify({ history, message, contextBlock }), draft: response.choices[0]?.message?.content ?? "",
            format: "Öğrenciye gösterilecek sohbet yanıtı. Metin ve matematik biçimlendirmesini koru.",
            imageUrls: imageUrl ? [imageUrl] : [], failClosedOnUnavailable: true, signal: request.signal,
          });
          await recordUsage(service, { userId, actionCode, model: env.OPENAI_ADVANCED_MODEL, tokensIn: verified.tokensIn, tokensOut: verified.tokensOut, reservationId });
          const noSource = strict && saidNoSource(verified.content);
          if (noSource) {
            content = stripNoSourceMarker(verified.content) + NO_SOURCE_CREDIT_NOTE;
            charge = false;
          } else {
            content = verified.content;
            if (grounded && !imageUrl) {
              const checked = await verifyDocumentAnswer({ client, question: message, answer: content, evidence, strict, signal: request.signal });
              await recordUsage(service, { userId, actionCode, model: env.OPENAI_ADVANCED_MODEL, tokensIn: checked.tokensIn, tokensOut: checked.tokensOut, reservationId });
              if (!checked.ok) continue;
              citations = checked.citations;
            }
          }
          accepted = true;
          break;
        } catch (error) {
          if (!(error instanceof EducationalVerificationError)) throw error;
        }
      }
      if (!accepted) {
        content = strict ? "Belgedeki bilgilerle bu soruya güvenilir bir yanıt oluşturamadım. Soruyu daraltabilir veya başka bir belge ekleyebilirsin.\n\n_Kredin harcanmadı._" : chatFallbackMessage({ isPremium, difficulty: difficulty.level });
        charge = false;
        citations = [];
      }
    }
    // Only server-verified metadata becomes a navigable source, never model URLs.
    if (citations.length) content += "\n\nKaynaklar:\n" + citations.map((c) =>
      `- [${c.documentName.replace(/[\\[\]()*<>]/g, "")} ${c.pageNumber ? `· s.${c.pageNumber}` : ""}](${citationHref(c)})`).join("\n");
    if (request.signal.aborted) throw new Error("request_cancelled");
    const { data: saved, error: saveError } = await service.rpc("complete_chat_operation", {
      p_user_id: userId, p_operation_id: operationId, p_reservation_id: reservationId,
      p_user_message: message, p_content: content, p_citations: citations, p_model: model,
      p_charge: charge, p_tokens_in: tokensIn, p_tokens_out: tokensOut,
    });
    if (saveError || !saved) throw new Error("chat_settlement_failed");
    // The RPC is atomic: on an ambiguous network failure, retry reads its result.
    reservationId = null;
    await recordUserActivity(service, userId, "chat").catch(() => undefined);
    return chatResultResponse(saved as SavedChatResult, strict);
  } catch (err) {
    try { await undoSpend(); } catch { console.error("chat_credit_recovery_required", { operationId }); }
    // Sebep olmadan bu satır işe yaramaz: 23 Eylül 2026'da canlıda yalnızca
    // "generation_failed" görünüyor, hata ne diye üç kez sunucu açıldı.
    // Sağlayıcı gövdesi yok, yalnızca hata adı ve mesajı.
    const cause = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("generation_failed", { feature: "chat", operationId, cancelled: request.signal.aborted, cause: cause.slice(0, 300) });
    return NextResponse.json({ error: "Yanıt tamamlanamadı. Aynı soruyu yeniden deneyebilirsin; tamamlanmış işlem tekrar ücretlenmez." }, { status: request.signal.aborted ? 499 : 503 });
  }
}
