import type { SupabaseClient } from "@supabase/supabase-js";
import { createLiveChannel, type LiveChannel } from "@/lib/ai/chat-live";
import { after, NextResponse } from "next/server";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import { isReasoningModel, samplingParams } from "@/lib/ai/model-params";
import { z } from "zod";
import OpenAI from "openai";
import { openaiClient } from "@/lib/ai/openai-client";
import { loadActivePrompt, PROMPT_KEYS } from "@/lib/ai/prompts";
import { EducationalVerificationError, verifyEducationalContent } from "@/lib/ai/quality-gate";
import { chatFallbackMessage } from "@/lib/ai/chat-fallback";
import {
  chatSolveNeedsGuard,
  independentSolvePrompt,
  mergeIndependentSolve,
  parseIndependentSolve,
  prepareChatSolution,
} from "@/lib/ai/chat-solve-check";
import { errorResponse, withUser } from "@/lib/api/guards";
import { selectModel, contentModel } from "@/lib/ai/model-router";
import { claimHardUpgrade } from "@/lib/ai/model-upgrade";
import { assessQuestionDifficulty } from "@/lib/ai/question-difficulty";
import { SYSTEM_GUARDRAIL } from "@/lib/ai/generate";
import { visionImage } from "@/lib/ai/vision";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { moderate } from "@/lib/ai/moderation";
import { recordAbuse } from "@/lib/abuse/record";
import { parseTutorStyle } from "@/lib/learning/tutor-style";
import { moodPrompt, parseMood } from "@/lib/learning/session-signals";
import { loadTodayMood } from "@/lib/companion/today-mood";
import { env, type ActionCode } from "@/lib/env";
import { recordUsage, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { titleConversation } from "@/lib/ai/conversation-title";
import { searchDocumentChunks, searchDocumentChunksAcross } from "@/lib/rag/pipeline";
import { resolveChatMaterial, type ChatMaterialLink } from "@/lib/ai/chat-material-load";
import {
  actionMarker,
  buildChatActions,
  detectChatIntent,
  materialTurnLines,
  readTeacherTone,
  stripModelActionMarkers,
  type ChatAction,
} from "@/lib/ai/chat-material-link";
import { studentOptionCount } from "@/lib/learning/student-pedagogy";
import { NO_SOURCE_CREDIT_NOTE, NO_SOURCE_MESSAGE, saidNoSource, stripNoSourceMarker } from "@/lib/ai/grounding";
import { chatSourceBlock } from "@/lib/learning/chat-source-block";
import { loadTeacherBrief } from "@/lib/documents/teacher-analysis-run";
import {
  SOURCE_PAGE_FORMULA_RULE,
  teacherNoteGroundedInSource,
  teacherTurnGuidance,
} from "@/lib/learning/teacher-brain";
import { extractText } from "@/lib/documents/extract-text";
import { extractOfficePackage, isOfficeDocument } from "@/lib/documents/extract-office-text";
import { attachOfficeFigures } from "@/lib/documents/office-figures";
import { isOwnedDocumentPath } from "@/lib/documents/storage-path";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { awardChatStars } from "@/lib/stars/chat";
import { loadExamChatContext } from "@/lib/learning/exam-chat-context";
import { loadPrepChatGrounding, recordChatMisconception } from "@/lib/learning/prep-chat-grounding";
import {
  auditQuantitative,
  dropUnverifiedExample,
  gradeStudentClaim,
  needsQuantModelCheck,
  parseQuantSelfCheck,
  quantSelfCheckPrompt,
  repairQuantitative,
  settleQuantReply,
  type GradedClaim,
} from "@/lib/learning/tutor-quant";
import {
  chipMarker,
  citationMarker,
  examTutorAddendum,
  finalizeTutorReply,
  followUpChips,
  parseTutorStructured,
  requestsAnswerOnly,
  serializeStructuredReply,
} from "@/lib/learning/tutor-reply";
import { topWeightedTopic } from "@/lib/learning/prep-corpus";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import { answerFirstLine, bestSourcePage } from "@/lib/learning/tutor-answer";
import { CHAT_NATURAL_VOICE, CHAT_TEACHING_MARKUP, teacherStyleLine, tutorHistoryLine, tutorHistoryText } from "@/lib/ai/teacher-tutor";
import { simplifyLine } from "@/lib/ai/simplify-request";
import { chatTurnBlock, chatTurnLines, readChatTurn } from "@/lib/ai/chat-turn-lines";
import { recentSupportVerdict, SUPPORT_NOTE_DEDUPE_SECONDS, SUPPORT_SCOPE } from "@/lib/ai/chat-safety-context";
import { verifyAndFixTurkishMathExpressions } from "@/lib/learning/turkish-math-fix";
import { loadStudentMemory, studentMemoryLines } from "@/lib/learning/student-memory";
import { parseCheckExpected, gradeAgainstExpected } from "@/lib/learning/check-question";
import { citationHref, type ChatCitation, type ChatEvidence } from "@/lib/ai/chat-citations";
import {
  isAcceptableOutsideAnswer,
  chatAnswerNeedsReview,
  isClearlyOffDocument,
  isOverviewQuestion,
  localDocumentCheck,
  outsideMaterialReviewNote,
  paidChatAttempts,
  presentOutsideMaterialAnswer,
  splitOutsideMaterial,
  verifyDocumentAnswer,
} from "@/lib/ai/document-answer-verification";
import { CHAT_AUDIT_FLAG, claimChatAuditSlot, shouldSampleChatAudit } from "@/lib/ai/chat-audit-sample";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { ONE_MOVE_MARKUP, TEACHER_V2_FLAG, oneMoveMetrics, settleOneMove } from "@/lib/ai/teacher-v2";
import {
  GUIDED_STYLE,
  answerTurnPlan,
  readTutorSession,
  repeatsAskedQuestion,
  resolveTeachStyle,
  teacherV2SessionLines,
  v2AnswerFirstLine,
  v2StyleLine,
  type TutorSession,
} from "@/lib/ai/teacher-v2-session";
import { settleVoice } from "@/lib/ai/teacher-voice";
import { settlePedagogicalLabels, stripOrphanCitations } from "@/lib/ai/chat-answer-settle";
import { createChatDraft } from "@/lib/ai/chat-draft";
import { logOpsEvent } from "@/lib/observability/ops-log";
import { pickStudyTopics } from "@/lib/learning/diagnostic";
import { recordLessonTiming } from "@/lib/admin/beta-metrics";
import { chatRequestHash, chatResultResponse, prepareChatOperation, streamedChatResultResponse, type SavedChatResult } from "@/lib/ai/chat-operation";

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
  /**
   * Ana ekranda seçili hazırlık (15 Kasım 2026): sohbeti hazırlık yoluna (öğretmen JSON yolu) geçirmez; ana sohbet o
   * hazırlığın bağlamında başlar ve öğrenci kendi notundan söz edince o hazırlığın belgelerinde aranır. Sunucu yalnız
   * öğrencinin kendi hazırlıklarından biriyse kullanır.
   */
  contextPrepId: z.string().uuid().optional(),
  /** "Bugünkü ruh hali" (kıyas ürünü gibi yazı kutusunun ayar düğmesinden). */
  mood: z.string().max(20).optional(),
  /**
   * Canlı anlatım anahtarı; yoksa profildeki `tutor_style` okunur. "guided" (Rehberli, Faz 13 PR-1) yalnız teacher.v2
   * açıkken tanınır; bayrak kapalıyken profilin stili geçerli (`resolveTeachStyle`).
   */
  tutorStyle: z.enum(["step_by_step", "hints_first", "direct_solve", GUIDED_STYLE]).optional(),
});

export async function POST(request: Request) {
  // Canlı akış (3 Kasım 2026): ilk token gelince yanıt açılır, iş arkada tamamlanır.
  const live = createLiveChannel(Date.now());
  const work = handleChat(request, live);
  return Promise.race([work, live.response]);
}

async function handleChat(request: Request, live: LiveChannel): Promise<Response> {
  const routeStartedAt = Date.now();
  const timings: [string, number][] = [];
  const guard = await withUser(request, { scope: "chat", limit: 40, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { message, useDocuments, documentsOnly, operationId: providedId, ...rest } = parsed.data;
  const operationId = providedId ?? crypto.randomUUID();
  // Denetim en erken anda başlar (3 Kasım 2026): yalnız metinli mesajda kimlik ve işlem kaydı beklenmez.
  // Görselli mesajın denetimi görsel adresiyle aşağıda ayrıca yapılır. Karar ve kapı değişmez.
  const textVerdictEarly = rest.imageDocumentId ? null : moderate({ text: message });
  textVerdictEarly?.catch(() => undefined);
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

  let blockedMessage: string | null = null;
  try {
    let imageUrl: string | null = null;
    let evidence: ChatEvidence[] = [];
    let documentPages = 0;
    let documentAttached = false;
    if (rest.imageDocumentId) {
      const { data: doc, error } = await service.from("documents")
        .select("storage_path,mime_type,file_name,status").eq("id", rest.imageDocumentId)
        .eq("user_id", userId).is("deleted_at", null).maybeSingle();
      if (error) return errorResponse(503, "Belgene şu an erişilemiyor.");
      if (!doc || !isOwnedDocumentPath(doc.storage_path, userId, rest.imageDocumentId)) return errorResponse(404, "document_not_found");
      if (doc.mime_type?.startsWith("image/")) {
        const { data, error: signedError } = await service.storage.from("documents").createSignedUrl(doc.storage_path, 300);
        if (signedError || !data) return errorResponse(503, "Görsel açılamadı. Yeniden dene.");
        imageUrl = data.signedUrl;
      } else if (doc.mime_type === "application/pdf" || doc.mime_type === "text/plain" || isOfficeDocument(doc.mime_type)) {
        // Word ve PowerPoint de belgeli sohbete girer (20 Ekim 2026); önceden "desteklenmiyor" diyordu.
        documentAttached = true;
        // Prefer the canonical parsed pages, including OCR, over reparsing every question.
        // İşlenmesi süren belgede sayfa tablosu yarım olabilir (19 Ekim 2026: sohbetten yüklenen belge
        // arka planda işlenirken ilk soru geliyor); o zaman dosya doğrudan okunur.
        const processed = doc.status === "completed";
        const { data: pages, error: pagesError } = processed
          ? await service.from("document_pages")
            .select("id,page_number,text_content").eq("document_id", rest.imageDocumentId).order("page_number")
          : { data: [], error: null };
        if (pagesError) throw new Error("source_unavailable");
        let sourcePages = (pages ?? []).map((p) => ({ page: p.page_number as number, text: p.text_content as string }));
        if (!sourcePages.length) {
          const { data, error: downloadError } = await service.storage.from("documents").download(doc.storage_path);
          if (downloadError || !data) throw new Error("source_unavailable");
          const buffer = Buffer.from(await data.arrayBuffer());
          if (isOfficeDocument(doc.mime_type)) {
            const packaged = extractOfficePackage(buffer, doc.mime_type);
            if (!packaged.ok) return errorResponse(422, "Belge henüz okunamıyor. Belgeler ekranından işlem durumunu kontrol et.");
            // İşleme bitmeden gelen sohbet, resimleri de görsün. Kota ve tarama
            // ücreti belge işlenirken düşer; burada ikinci kez düşmez.
            const attached = packaged.images.length
              ? await attachOfficeFigures(packaged.pages, packaged.images)
              : { pages: packaged.pages, usage: [], readCount: 0, blocked: false };
            for (const entry of attached.usage) {
              if (!entry.tokensIn && !entry.tokensOut) continue;
              await recordUsage(service, {
                userId,
                actionCode: "DOCUMENT_PAGE_PROCESS",
                model: entry.model,
                tokensIn: entry.tokensIn,
                tokensOut: entry.tokensOut,
              });
            }
            sourcePages = attached.pages.map((text, i) => ({ page: i + 1, text }));
          } else {
            const extracted = await extractText(buffer, doc.mime_type);
            if (!extracted.ok) return errorResponse(422, "Belge henüz okunamıyor. Belgeler ekranından işlem durumunu kontrol et.");
            sourcePages = extracted.pages.map((text, i) => ({ page: i + 1, text }));
          }
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

    // Hazırlık sahipliği (6 Kasım 2026, 360° denetim P0): bağlam okumaları servis anahtarıyla koşuyor.
    // Sahiplik denetlenmeden başka öğrencinin hazırlık kimliğiyle onun belgeleri modele gidiyordu
    // (kimlik sınıf davet bağlantısında ve okul akışında görünür). Sahip değilse hiçbir şey okunmaz.
    if (rest.prepId) {
      const { data: ownedPrep, error: prepError } = await service
        .from("exam_preps").select("id").eq("id", rest.prepId).eq("user_id", userId).maybeSingle();
      if (prepError) return errorResponse(503, "Hazırlığına şu an erişilemiyor.");
      if (!ownedPrep) return errorResponse(404, "prep_not_found");
    }

    // Ön okumalar paralel (3 Kasım 2026, t260u): denetim, hak, geçmiş, profil, istem ve hazırlık bağlamı
    // birbirini beklemiyordu ama sırayla koşuyordu. Hepsi yalnız okuma; kredi ayırma sırası değişmez.
    const stage = (name: string) => timings.push([name, Date.now() - routeStartedAt]);
    const quiet = <T,>(promise: Promise<T>): Promise<T> => {
      promise.catch(() => undefined);
      return promise;
    };
    const entitlementsEarly = quiet(getUserEntitlements(service, userId));
    // Faz 13A (15 Kasım 2026): öğretmen hissi `teacher.v2` arkasında; kişi bazlı açılır, 30 sn önbellek. Okuma düşerse kapalı.
    const teacherV2Early = isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
    const priorTurnsEarly = quiet(
      rest.conversationId
        ? Promise.resolve(service.from("messages").select("id", { count: "exact", head: true })
            .eq("conversation_id", rest.conversationId).eq("user_id", userId).eq("role", "user"))
        : Promise.resolve(null),
    );
    const historyEarly = quiet(
      rest.conversationId
        ? Promise.resolve(service.from("messages").select("role,content")
            .eq("conversation_id", rest.conversationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(16))
        : Promise.resolve(null),
    );
    const profileEarly = quiet(Promise.resolve(service.from("profiles").select("tutor_style").eq("id", userId).maybeSingle()));
    const instructionEarly = quiet(loadActivePrompt(service, PROMPT_KEYS.studentChat));
    const examContextEarly = quiet(rest.prepId ? loadExamChatContext(service, userId, rest.prepId) : Promise.resolve(null));
    const groundingEarly = quiet(rest.prepId ? loadPrepChatGrounding(service, userId, rest.prepId, message) : Promise.resolve(null));
    // Öğrenme hafızası (5 Kasım 2026): öğretmen yolunda okunur, öbür okumalara paralel; yoksa null.
    const studentMemoryEarly = quiet(rest.prepId ? loadStudentMemory(service, userId) : Promise.resolve(null));
    // Öğrencinin kendi materyaline bağlanma (15 Kasım 2026): ana sohbette mesaj hazırlık / konu / belge adı, "N gün
    // sonraki sınav" ya da seçili hazırlıkla eşlenir. Yalnız okuma; düşerse bağlantı yok, sohbet bugünkü gibi sürer.
    const materialEarly: Promise<ChatMaterialLink | null> = !rest.prepId && !rest.imageDocumentId
      ? resolveChatMaterial(service, userId, message, rest.contextPrepId ?? null, { conversationId: rest.conversationId }).catch((error) => {
          console.warn("chat_material_link_failed", { operationId, cause: String(error instanceof Error ? error.message : error).slice(0, 120) });
          return null;
        })
      : Promise.resolve(null);
    const optionCountEarly = quiet(!rest.prepId ? studentOptionCount(service, userId) : Promise.resolve(5 as const));
    // Girdi denetimi (3 Kasım 2026): hazırlık sohbetinde model çağrısıyla PARALEL koşar; ilk kelime
    // denetimi beklemez. Kapı açılana kadar token'lar sunucuda tamponlanır (live.gate); ret gelirse
    // model iptal edilir, tampon atılır, kredi iade edilir ve öğrenciye yalnız güvenli mesaj gider.
    // Öbür yollarda denetim eskisi gibi kredi ayırmadan önce beklenir.
    const verdictEarly = quiet(!imageUrl && textVerdictEarly ? textVerdictEarly : moderate({ text: message, imageUrls: imageUrl ? [imageUrl] : [] }));
    type Verdict = Awaited<typeof verdictEarly>;
    const isBlocked = (v: Verdict): v is Extract<Verdict, { message: string }> => v.action === "block" || v.action === "support";
    // teacher.v2 (EK-6): ana sohbette de denetim modelle paralel; ilk metin denetimi beklemez (canlıda 0,6-1,7 sn).
    const teacherV2 = await teacherV2Early;
    const parallelModeration = (Boolean(rest.prepId) || teacherV2) && !imageUrl;
    const modelAbort = new AbortController();
    const abortModel = () => modelAbort.abort();
    if (request.signal.aborted) abortModel(); else request.signal.addEventListener("abort", abortModel, { once: true });
    let moderationNoted = false;
    const noteVerdict = (v: Awaited<typeof verdictEarly>) => {
      if (moderationNoted) return;
      moderationNoted = true;
      stage("moderation");
      if (v.action !== "allow") void recordAbuse({ signal: "moderation", severity: v.action === "flag" ? "low" : "high", scope: "chat", userId, request, metadata: { categories: v.categories, outcome: v.action } });
      // Destek yanıtı sohbete kaydedilmez; sonraki turda "genel duygu ifadesi" hafife alınmasın diye ayrı kapsamla izlenir.
      if (v.action === "support") void recordAbuse({ signal: "moderation", severity: "high", scope: SUPPORT_SCOPE, userId, request, dedupeSeconds: SUPPORT_NOTE_DEDUPE_SECONDS, metadata: { outcome: v.action } });
    };
    const blockedReply = (v: Extract<Verdict, { message: string }>) => new Response(v.message, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Credits-Used": "0" },
    });
    if (parallelModeration) {
      live.gate(verdictEarly.then((v) => {
        noteVerdict(v);
        if (isBlocked(v)) { blockedMessage = v.message; abortModel(); }
        return !isBlocked(v);
      }, (error) => { abortModel(); throw error; }));
      live.timing(() => timings.map(([name, ms]) => `${name};dur=${ms}`).join(", "));
    } else {
      const verdict = await verdictEarly;
      noteVerdict(verdict);
      if (isBlocked(verdict)) return blockedReply(verdict);
    }
    /** Paralel denetim reddettiyse güvenli yanıt (kredi iade); yoksa null. Denetim hatası fırlar. */
    const settleModeration = async (): Promise<Response | null> => {
      if (!parallelModeration) return null;
      const verdict = await verdictEarly;
      noteVerdict(verdict);
      if (!isBlocked(verdict)) return null;
      await undoSpend();
      reservationId = null;
      return blockedReply(verdict);
    };
    const entitlements = await entitlementsEarly;
    const isPremium = entitlements.isPremium;

    let priorUserTurns = 0;
    if (rest.conversationId) {
      const counted = await priorTurnsEarly;
      if (!counted || counted.error) throw new Error("history_unavailable");
      priorUserTurns = counted.count ?? 0;
    }
    const difficulty = assessQuestionDifficulty({ message, turn: priorUserTurns + 1, hasImage: Boolean(imageUrl) });
    // Gelişmiş sohbet Sigma. Plus ve ücretsiz istese de standart modele düşer.
    const advancedChat = requireFeature(entitlements, "advanced_chat");
    const requestedAdvanced = rest.actionCode === "AI_CHAT_ADVANCED";
    const chatAction = (requestedAdvanced && !advancedChat
      ? "AI_CHAT_STANDARD"
      : rest.actionCode) as ActionCode;
    const routerInput = { actionCode: chatAction, isPremium, hasImage: Boolean(imageUrl), userSelectedAdvanced: chatAction === "AI_CHAT_ADVANCED", documentPages, difficulty: difficulty.level };
    const routed = selectModel(routerInput);
    const { model, actionCode } = routed.upgrade === "difficulty" && !(await claimHardUpgrade(service, userId))
      ? selectModel({ ...routerInput, hardUpgradeAllowed: false }) : routed;
    // Sohbet kaydı yalnız sohbet işini kapatır (complete_chat_operation): görselli soru da mesaj olarak
    // ayrılır, ücretsiz hesapta fotoğraf sayacından düşer (24 Ekim 2026).
    const reserveAction: ActionCode = actionCode === "AI_CHAT_ADVANCED" ? "AI_CHAT_ADVANCED" : "AI_CHAT_STANDARD";
    const reserved = await reserveCredits(service, userId, reserveAction, `chat:${operationId}`, 1, { freeMeter: imageUrl ? "photo" : "chat" });
    if (!reserved.ok) return errorResponse(reserved.reason === "insufficient_credits" ? 402 : reserved.reason.startsWith("operation_") ? 409 : 503, refusalCode(reserved));
    reservationId = reserved.reservationId;
    if (!env.OPENAI_API_KEY) { await undoSpend(); return errorResponse(503, "ai_not_configured"); }

    // Öğretmen sohbeti hazırlığın kendi belgelerine bakar (prepGrounding); tüm
    // belgelerde arama ve erken "kaynak yok" dönüşü bu yolda gereksiz.
    const teacherPrepChat = Boolean(rest.prepId) && !imageUrl;
    const material = !teacherPrepChat && !imageUrl ? await materialEarly : null;
    if (useDocuments && !documentAttached && !imageUrl && !teacherPrepChat) {
      const matches = await searchDocumentChunks(service, userId, message, 6, {
        minSimilarity: documentsOnly ? 0.32 : undefined,
      });
      evidence = matches.map((m, i) => ({ reference: i + 1, documentId: m.documentId, documentName: m.documentName, pageNumber: m.pageNumber, chunkId: m.chunkId, content: m.content }));
    } else if (material && !documentAttached && !imageUrl && !teacherPrepChat && (material.documentIds.length || material.searchAll)) {
      // Öğrenci "Genel" moddayken de kendi notundan söz ediyorsa o notta aranır; "yeniden yükle" denmez.
      const matches = material.documentIds.length
        ? await searchDocumentChunksAcross(service, userId, message, material.documentIds, { limit: 6, perDocument: 3 })
        : await searchDocumentChunks(service, userId, message, 6);
      evidence = matches.map((m, i) => ({ reference: i + 1, documentId: m.documentId, documentName: m.documentName, pageNumber: m.pageNumber, chunkId: m.chunkId, content: m.content }));
    }
    const linkedEvidence = !useDocuments && Boolean(material) && evidence.length > 0;
    const grounded = useDocuments || documentAttached || linkedEvidence;
    // "Yalnızca belgem" ancak belge modu açıkken geçerli. 19 Ekim 2026: öğrenci "Genel sohbet"teyken
    // PDF ekleyince istemci documentsOnly=true gönderiyordu; sohbet katı moda düşüp belgede açıkça
    // yazan cevapları "belgede yok" diye reddediyordu.
    const strict = grounded && documentsOnly && useDocuments;
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (rest.conversationId) {
      const rows = await historyEarly;
      if (!rows || rows.error) throw new Error("history_unavailable");
      const data = rows.data;
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
    let gradedForStore: GradedClaim | null = null;
    /** Cevabın altındaki gerçek stüdyo düğmeleri (sunucu ekler; model yazamaz). */
    let chatActions: ChatAction[] = [];
    /** Tur bir stüdyo yönlendirmesi mi (test, kart, deneme isteği; özet değil). */
    let studioRedirect = false;
    /**
     * Arka plan örnek denetimi (15 Kasım 2026, ürün sahibi): kod kontrolünden şüphesiz geçen belge cevabının %5'i
     * yanıttan SONRA model denetiminden geçer; sonuç yalnız günlüğe (uyuşmazlık oranı), öğrenciye gösterilmez.
     */
    let auditCandidate: { answer: string; localCitations: number } | null = null;
    let prepGrounding: Awaited<ReturnType<typeof loadPrepChatGrounding>> | null = null;
    if (strict && !evidence.length && !imageUrl && !teacherPrepChat) {
      content = NO_SOURCE_MESSAGE + NO_SOURCE_CREDIT_NOTE;
      charge = false;
    } else {
      const { data: profile } = await profileEarly;
      // Faz 13 PR-1: Rehberli ve seans durumu yalnız ana sohbette ve yalnız bayrak açıkken. Bayrak kapalıyken bugünkü yol.
      const v2Chat = teacherV2 && !rest.prepId;
      const teach = v2Chat
        ? resolveTeachStyle({ requested: rest.tutorStyle, profile: profile?.tutor_style, teacherV2: true })
        : null;
      const tutorStyle = teach
        ? teach.base
        : parseTutorStyle(rest.tutorStyle === GUIDED_STYLE ? profile?.tutor_style : rest.tutorStyle ?? profile?.tutor_style);
      const teachStyle = teach?.style ?? tutorStyle;
      const studentInstruction = await instructionEarly;
      const examContext = await examContextEarly;
      if (rest.prepId) {
        try {
          prepGrounding = await groundingEarly;
        } catch (error) {
          const cause = error instanceof Error ? error.message : String(error);
          console.error("prep_grounding_failed", { operationId, cause: cause.slice(0, 200) });
        }
      }
      const lastAssistant = [...history].reverse().find((item) => item.role === "assistant");
      const historyText = history.map((item) => (typeof item.content === "string" ? item.content : "")).join("\n");
      const pendingExpected = typeof lastAssistant?.content === "string"
        ? parseCheckExpected(lastAssistant.content)
        : null;
      let studentGrade = prepGrounding
        ? gradeStudentClaim({ student: message, context: `${historyText}\n${prepGrounding.corpus}` })
        : gradeStudentClaim({ student: message, context: historyText });
      if (pendingExpected && pendingExpected.kind !== "open") {
        const against = gradeAgainstExpected(message, pendingExpected);
        if (!studentGrade || studentGrade.verdict !== against) {
          studentGrade = {
            verdict: against,
            verdictLine: against === "dogru"
              ? `Doğru: ${pendingExpected.answer}`
              : against === "kismen"
                ? `Kısmen doğru; beklenen: ${pendingExpected.answer}`
                : `Yanlış; doğrusu: ${pendingExpected.answer}`,
            rightParts: against === "dogru" ? [pendingExpected.answer] : [],
            wrongParts: against === "dogru" ? [] : [`Beklenen: ${pendingExpected.answer}`],
            conclusion: pendingExpected.detail || pendingExpected.answer,
            wrongType: against === "dogru" ? "" : "check_answer",
            topicLabel: "Kontrol sorusu",
          };
        }
      }
      // Full page context is used for an attachment; RAG supplies selected chunks.
      const contextBlock = grounded ? chatSourceBlock(evidence, { documentsOnly: strict, maxCharsPerChunk: documentAttached ? 80000 : 3000 }) : "";
      const attachedRaw = !rest.prepId && rest.imageDocumentId
        ? await loadTeacherBrief(service, rest.imageDocumentId, message.slice(0, 120))
        : "";
      const attachedBrief = teacherNoteGroundedInSource(attachedRaw, contextBlock);
      const teacherTurn = teacherTurnGuidance({
        message,
        lastAssistant: typeof lastAssistant?.content === "string" ? lastAssistant.content : "",
        language: examContext?.language,
        hasSource: grounded || Boolean(attachedBrief) || Boolean(examContext?.hasSource),
        allowOutsideMaterial: !strict,
      });
      const client = openaiClient({ apiKey: env.OPENAI_API_KEY });
      const tutorAddendum = prepGrounding
        ? examTutorAddendum({
            message,
            grade: studentGrade,
            decision: prepGrounding.decision,
            scope: prepGrounding.scope,
            excerpts: prepGrounding.excerpts,
            personalization: examContext?.personalizationPrompt,
          })
        : "";
      // Nötr varsayılan: istem uzamasın diye ayrıca yazılmaz.
      // Tarayıcı ruh hali göndermediyse günün kaydı (dersten ya da sohbetten işaretlenmiş olabilir; 8 Kasım 2026).
      const chatMood = rest.mood ? parseMood(rest.mood) : ((await loadTodayMood(service, userId).catch(() => null)) ?? "neutral");
      // Tur okuması (10 Kasım 2026, güven paketi): mesajdaki duygu o turun ruh halidir (hap işaretlenmese de), takip
      // mesajı konuşmadaki soruya kilitlenir, Adım Adım modu yalnız sıradaki adımı yazar. Satırlar istemin en sonunda.
      const turn = readChatTurn({ message, style: tutorStyle, history, baseMood: chatMood });
      // Seans durumu (B): öğretmenin bu konuşmada sorduğu sorular, öğrencinin cevap denemesi ve deneme sırası.
      const v2Session: TutorSession | null = v2Chat ? readTutorSession(history, message) : null;
      if (v2Session?.answering) turn.plan = answerTurnPlan(turn.plan);
      const priorSupport = turn.feelingOnly && !turn.crisis ? await recentSupportVerdict(service, userId) : false;
      const turnLines = chatTurnLines(turn, tutorStyle, { priorSupport });
      // Ana sohbetin materyal, özet, araç, usta hoca ve şık satırları (15 Kasım 2026). Kriz ve yalnız duygu turunda yok.
      if (!rest.prepId && !imageUrl && !turn.crisis && !turn.feelingOnly) {
        const intent = material?.intent ?? detectChatIntent(message);
        turnLines.push(
          ...materialTurnLines({
            match: material?.match ?? null,
            intent,
            hasEvidence: linkedEvidence,
            optionCount: await optionCountEarly.catch(() => 5 as const),
            tone: readTeacherTone(message),
            linkLine: Boolean(material && (material.documentIds.length || material.searchAll || material.match.reason !== "context")),
          }),
        );
        chatActions = material?.actions ?? buildChatActions({ intent, match: { preps: [], documents: [], reason: "none", materialCue: false }, nodesByPrep: new Map() });
        studioRedirect = Boolean(intent.tool) && !intent.summary;
      }
      // Faz 13 PR-1 (B, C, D): süreklilik, ipucu merdiveni, Rehberli ilk tur, Adım Adım kavram turu. Son söz olsun diye en
      // sonda; kriz ve yalnız duygu turunda yok (güvenlik akışı aynen).
      if (v2Session && !turn.crisis && !turn.feelingOnly) {
        turnLines.push(...teacherV2SessionLines({ session: v2Session, style: teachStyle, plan: turn.plan, message }));
      }
      const moodLine = turn.mood === "neutral" ? "" : ` ${moodPrompt(turn.mood)}`;
      const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: `${SYSTEM_GUARDRAIL} ${studentInstruction} ${teacherTurn} ${(v2Session && v2StyleLine(teachStyle)) || teacherStyleLine(tutorStyle)} ${CHAT_NATURAL_VOICE}${rest.prepId && prepGrounding ? "" : `\n\n${teacherV2 ? ONE_MOVE_MARKUP : CHAT_TEACHING_MARKUP}\n\n`} ${v2Session ? v2AnswerFirstLine({ message, style: teachStyle, base: tutorStyle, session: v2Session, plan: turn.plan }) : answerFirstLine(message, tutorStyle)}${moodLine}${examContext?.block ?? ""}${attachedBrief ? `\n${SOURCE_PAGE_FORMULA_RULE}\n${attachedBrief}` : ""}${contextBlock}${tutorAddendum ? `\n\n${tutorAddendum}` : ""}${simplifyLine(message) ? `\n\n${simplifyLine(message)}` : ""}${chatTurnBlock(turnLines)}` },
        ...history,
        { role: "user", content: imageUrl ? [{ type: "text", text: message }, { type: "image_url", image_url: visionImage(imageUrl) }] : message },
      ];
      const sourceText = [contextBlock, examContext?.block ?? "", attachedBrief, prepGrounding?.corpus ?? ""].join("\n");
      const offDocument = prepGrounding
        ? prepGrounding.decision === "out"
        : isClearlyOffDocument(message, sourceText);
      const prepJsonMode = Boolean(rest.prepId && prepGrounding);
      async function polishPrep(text: string): Promise<string> {
        if (!rest.prepId || !prepGrounding) return text;
        const grounding = prepGrounding;
        let next = text;
        // JSON taslağı erken serileştir; doğrulama öğrenciye giden metin üzerinde kalsın.
        const structured = parseTutorStructured(next);
        if (structured) {
          next = serializeStructuredReply(structured, {
            context: `${historyText}\n${grounding.corpus}`,
          }).content;
        }
        let settledGrade = studentGrade;
        const applySettle = (draft: string) => {
          const settled = settleQuantReply({
            student: message,
            context: `${historyText}\n${grounding.corpus}`,
            draft,
          });
          settledGrade = settled.grade ?? settledGrade;
          return settled;
        };
        const settled = applySettle(next);
        if (settled.replaced) {
          next = settled.text;
        } else {
          // Sohbet denetimi binlik noktayı Türkçe okur (10 Kasım 2026): doğru eşitlik "onarılıp" bozulmasın.
          const audit = auditQuantitative(next, grounding.corpus, { thousandsDots: true });
          if (!audit.ok) next = repairQuantitative(next, audit);
          else if (needsQuantModelCheck(next, audit)) {
            try {
              const prompt = quantSelfCheckPrompt(next);
              const review = await client.chat.completions.create({
                model: env.OPENAI_STANDARD_MODEL,
                ...samplingParams(env.OPENAI_STANDARD_MODEL, { temperature: 0, maxTokens: 180 }),
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: prompt.system },
                  { role: "user", content: prompt.user },
                ],
              }, { signal: request.signal, timeout: 20_000, maxRetries: 0 });
              tokensIn += review.usage?.prompt_tokens ?? 0;
              tokensOut += review.usage?.completion_tokens ?? 0;
              await recordUsage(service, {
                userId,
                actionCode,
                model: env.OPENAI_STANDARD_MODEL,
                tokensIn: review.usage?.prompt_tokens ?? 0,
                tokensOut: review.usage?.completion_tokens ?? 0,
                reservationId,
              });
              const verdict = parseQuantSelfCheck(review.choices[0]?.message?.content ?? "");
              if (verdict && !verdict.ok) next = dropUnverifiedExample(next);
            } catch {
              // Küçük denetim düşerse deterministik sonuç durur.
            }
          }
          const again = applySettle(next);
          if (again.replaced) next = again.text;
        }
        const finalized = finalizeTutorReply({
          message,
          draft: next,
          decision: grounding.decision,
          scope: grounding.scope,
          grade: settledGrade,
          language: examContext?.language,
          context: `${historyText}\n${grounding.corpus}`,
        });
        gradedForStore = finalized.misconception;
        return finalized.content;
      }
      let accepted = false;
      // Öğretmen sohbeti (2 Ekim 2026): serbest metin + belgeye karşı denetim.
      // JSON şablon, yeniden yazan denetçiler ve polishPrep bu yolda yok.
      const teacherTutor = teacherPrepChat && Boolean(prepGrounding);
      // Öğrencinin seçtiği mod: Yalnızca belgem / Belgem + genel bilgi / Genel sohbet.
      const tutorMode = prepGrounding?.pool ? "curriculum" : !grounded ? "general" : strict ? "document" : "mixed";
      // 24 Ekim 2026 (ürün sahibi): denetim çağrısı yalnız belgeye dayanan cevapta.
      const documentGrounded = grounded && evidence.length > 0;
      // Denetçi: luna (24 Ekim 2026). Görselli soruda gören model gerekir; gpt-4.1 kalır.
      const reviewModel = imageUrl ? env.OPENAI_ADVANCED_MODEL : contentModel();
      // Fotoğraf veya şıklı/sayısal çözüm: cevap yazılmadan aritmetik kural ve bağımsız sağlama (25 Ekim 2026). İpucu
      // modu ve red cevapları dışarıda. Takipte tam çözüm istendiyse ("cevabı ve tüm adımları göster") sağlama
      // konuşmadaki soruya göre yapılır. Bağımsız çözüm cevaba değil soruya bakar: 15 Kasım 2026'dan beri ana yazımla
      // AYNI ANDA başlar (eskiden yazım ve iki denetim bittikten sonra başlıyordu).
      const solveMessage = turn.plan.followUp === "full_solution" && turn.plan.active?.source === "student" ? turn.plan.active.text : message;
      // Adım Adım turunda yalnız tek adım yazılır: nihai cevap yokken bağımsız çözümle karşılaştırılacak bir şey de yok
      // (karşılaştırma, adımın yerine tam çözümü koyabiliyordu). Aritmetik kural yine çalışır.
      const pacedTurn = tutorStyle === "step_by_step" && turn.plan.pacedStep != null;
      const solveGuard = !turn.crisis && chatSolveNeedsGuard({ tutorStyle, hasImage: Boolean(imageUrl), message: solveMessage });
      const independentEarly = solveGuard && !pacedTurn
        ? (async () => {
            try {
              const checkModel = imageUrl ? env.OPENAI_ADVANCED_MODEL : contentModel();
              const prompt = independentSolvePrompt(solveMessage);
              const checkUser = imageUrl
                ? [
                    { type: "text" as const, text: prompt.user },
                    { type: "image_url" as const, image_url: visionImage(imageUrl) },
                  ]
                : prompt.user;
              const check = await client.chat.completions.create({
                model: checkModel,
                ...samplingParams(checkModel, { temperature: 0, maxTokens: 700 }),
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: prompt.system },
                  { role: "user", content: checkUser },
                ],
              }, { signal: request.signal, timeout: 25_000, maxRetries: 0 });
              tokensIn += check.usage?.prompt_tokens ?? 0;
              tokensOut += check.usage?.completion_tokens ?? 0;
              await recordUsage(service, {
                userId,
                actionCode,
                model: checkModel,
                tokensIn: check.usage?.prompt_tokens ?? 0,
                tokensOut: check.usage?.completion_tokens ?? 0,
                reservationId,
              });
              return parseIndependentSolve(check.choices[0]?.message?.content ?? "");
            } catch {
              // Bağımsız çağrı düşerse aritmetiği tutmayan satır zaten çıkarılmış cevap durur.
              return null;
            }
          })()
        : null;
      if (teacherTutor && prepGrounding) {
        const grounding = prepGrounding;
        const lastLesson = examContext?.lastLesson ?? null;
        // Hafıza satırları sabit blokların ARKASINDA (önbellek bozulmasın); en çok üç satır, konuya bağlı olan önde.
        const memoryLines = studentMemoryLines(await studentMemoryEarly, { topicLabel: lastLesson?.title ?? null });
        stage("context");
        const outcome = await runTeacherTutor({
          client,
          model,
          // Öğrenci cevabı bekliyor (t260u): düşünme düzeyi düşük; denetim adımı aynen sürer.
          reasoningEffort: "low",
          signal: modelAbort.signal,
          context: {
            examTitle: examContext?.prepTitle ?? null,
            daysLeft: examContext?.daysLeft ?? null,
            topic: lastLesson?.title ?? null,
            learnerLines: [
              teacherStyleLine(tutorStyle),
              moodLine.trim(),
              tutorHistoryLine(examContext?.history ?? []),
              ...memoryLines,
            ],
            passages: [
              ...grounding.passages.map((item) => ({
                label: `${item.documentName}${item.pageNumber != null ? ` ${item.slide ? "slayt" : "s."}${item.pageNumber}` : ""}`,
                text: item.content,
              })),
              ...(lastLesson ? [{ label: `Öğrencinin belgesinden hazırlanan ders: ${lastLesson.title}`, text: lastLesson.text }] : []),
            ],
            pendingAnswer: pendingExpected?.answer ?? null,
            sourceRules: grounding.sourceRules ?? [],
            mode: tutorMode,
          },
          history: history.map((item) =>
            item.role === "assistant" && typeof item.content === "string"
              ? { ...item, content: tutorHistoryText(item.content) }
              : item,
          ),
          message,
          style: tutorStyle,
          turnLines,
          verify: tutorMode !== "general" && grounding.decision === "in",
          // "Yalnızca belgem" modunda denetlenmemiş taslak ekrana düşmez; öbür modlarda canlı akar.
          onDelta: rest.prepId && tutorMode !== "document" ? (text) => {
            if (!live.enabled) live.enable(strict);
            live.write(text);
          } : undefined,
          onUsage: async (usedIn, usedOut) => {
            tokensIn += usedIn;
            tokensOut += usedOut;
            await recordUsage(service, { userId, actionCode, model, tokensIn: usedIn, tokensOut: usedOut, reservationId });
          },
        });
        if (outcome.ok) {
          const chips = followUpChips({
            answerOnly: requestsAnswerOnly(message),
            graded: Boolean(studentGrade),
            scopeTopic: null,
            weightedTopic: topWeightedTopic(grounding.scope)?.topic ?? null,
          });
          content = `${outcome.content}\n\n${chips.map(chipMarker).join("\n")}`.trim();
          gradedForStore = studentGrade && studentGrade.verdict !== "dogru" ? studentGrade : null;
          // Kaynak satırı ("Kaynak: KPSS.pdf · s.8") ve kaynak işaretleri bu
          // listeden gelir; boş kalırsa ekran belge modunda "belgede yok" yazıyordu.
          if (tutorMode !== "general" && grounding.decision === "in") {
            // Kaynak işareti cevabın en çok dayandığı pasajla başlar (sunucu basar; model sayfa yazmaz).
            const best = bestSourcePage(
              outcome.content,
              grounding.passages.map((item, index) => ({ page: index, text: item.content })),
            );
            const ranked = best
              ? [grounding.passages[best.page]!, ...grounding.passages.filter((_, index) => index !== best.page)]
              : grounding.passages;
            citations = ranked.slice(0, 2).map((item, index) => ({
              reference: index + 1,
              documentId: item.documentId,
              documentName: item.documentName,
              pageNumber: item.pageNumber,
              chunkId: null,
            }));
          }
          accepted = true;
        } else {
          logOpsEvent("document_answer_rejected", { operationId, strict, stage: "teacher_tutor", reasons: outcome.reasons.slice(0, 3) });
        }
      }
      const attemptLimit = teacherTutor ? 0 : paidChatAttempts(offDocument);
      for (let attempt = 0; attempt < attemptLimit; attempt++) {
        // İkinci deneme de asıl modelde: eskiden aboneye gpt-4.1'e çıkıyordu.
        const generationModel = model;
        // Öğrenci bekliyor (15 Kasım 2026, ürün sahibi: "60-80 sn kabul edilemez"): düşünme düşük, ilk denemede taslak
        // ekrana akar. "Yalnızca belgem" modunda denetlenmemiş taslak ekrana düşmez (öğretmen sohbetindeki kural).
        const effort = isReasoningModel(generationModel) ? { reasoning_effort: "low" as const } : {};
        const streamThis = attempt === 0 && !strict && !prepJsonMode;
        const drafted = await createChatDraft(client, {
          model: generationModel,
          messages: requestMessages,
          ...effort,
          ...(prepJsonMode
            ? { response_format: { type: "json_object" as const }, ...samplingParams(generationModel, { temperature: 0.4 }) }
            : {}),
        }, {
          signal: modelAbort.signal,
          timeout: 90_000,
          onDelta: streamThis
            ? (text) => {
                if (!live.enabled) live.enable(strict);
                live.write(text);
              }
            : undefined,
        });
        tokensIn += drafted.tokensIn;
        tokensOut += drafted.tokensOut;
        await recordUsage(service, { userId, actionCode, model: generationModel, tokensIn: drafted.tokensIn, tokensOut: drafted.tokensOut, reservationId });
        const rawDraft = drafted.text;
        // JSON çıktıyı öğrenci metnine çevir; doğrulayıcı serbest metin bekler.
        const structuredEarly = parseTutorStructured(rawDraft);
        const studentFacingRaw = structuredEarly
          ? serializeStructuredReply(structuredEarly, {
              context: `${historyText}\n${prepGrounding?.corpus ?? ""}`,
            }).content
          : rawDraft;
        // Sohbet cevabı da öğrenci metninin tek süzgecinden geçer (29 Ekim 2026).
        const studentFacing = studentOutputText(studentFacingRaw);
        // Sistemin bulduğu not (linkedEvidence) ve stüdyo yönlendirmesi turu (chatActions) "Materyal dışı" damgası
        // almaz (15 Kasım 2026, canlı): soru sözcükleri ("hazırla", "karıştı") notta geçmiyor diye sıcak açılış ve
        // yönlendirme cümlesi "Bu, belgede yok" damgasıyla çıkıyordu. Etiketi model yazar; yalnız bilgi bölümüne.
        const stampOutside = !strict && !linkedEvidence && !chatActions.length && (!prepGrounding || prepGrounding.decision === "out");
        const draft = stampOutside
          ? presentOutsideMaterialAnswer({
              question: message,
              answer: studentFacing,
              sourceText,
              language: examContext?.language,
            })
          : studentFacing;
        let checkedContent = "";
        const reviewAnswer = chatAnswerNeedsReview({ documentGrounded, hasImage: Boolean(imageUrl), strict, draft });
        if (!reviewAnswer) checkedContent = draft;
        else try {
          const verified = await verifyEducationalContent({ client,
            context: JSON.stringify({ history, message, contextBlock, sourceExcerpt: sourceText.slice(0, 8000) }),
            draft,
            format: "Öğrenciye gösterilecek sohbet yanıtı. Metin ve matematik biçimlendirmesini koru.",
            reviewerAddendum: outsideMaterialReviewNote(),
            // 24 Ekim 2026 (ürün sahibinin kararı): sohbet denetimi luna ile, hazırlık sohbetindeki gibi.
            model: reviewModel,
            // 15 Kasım 2026: tek hızlı geçiş (öğrenci bekliyor).
            reasoningEffort: "low",
            imageUrls: imageUrl ? [imageUrl] : [], failClosedOnUnavailable: true, signal: request.signal,
          });
          await recordUsage(service, { userId, actionCode, model: reviewModel, tokensIn: verified.tokensIn, tokensOut: verified.tokensOut, reservationId });
          checkedContent = verified.content;
        } catch (error) {
          if (!(error instanceof EducationalVerificationError)) throw error;
          if (!strict && offDocument && isAcceptableOutsideAnswer(draft)) {
            logOpsEvent("document_answer_rejected", { operationId, attempt, strict, stage: "educational_outside_kept", reasons: error.failureMessages.slice(0, 3) });
            checkedContent = draft;
          } else {
            logOpsEvent("document_answer_rejected", { operationId, attempt, strict, stage: "educational", reasons: [error.message.slice(0, 200)] });
            continue;
          }
        }
        const noSource = strict && saidNoSource(checkedContent);
        if (noSource) {
          content = stripNoSourceMarker(checkedContent) + NO_SOURCE_CREDIT_NOTE;
          charge = false;
        } else {
          content = checkedContent;
          if (reviewAnswer && documentGrounded && !imageUrl) {
            // Kaynak denetimi (15 Kasım 2026): "Yalnızca belgem" modunda model denetimi aynen (öğrencinin seçtiği güvence).
            // Öbür modlarda önce kod: sayılar kaynakta mı, atıf gerçek bir kaynağı mı gösteriyor, genel bilgi belgeye mal
            // edilmiş mi. Model denetimi yalnız kaynakta olmayan bir sayı görülünce ve düşük düşünmeyle. Canlıda bu
            // çağrı her cevapta 16-27 sn sürüyordu.
            const runModelCheck = async (strictCheck: boolean) => {
              const verdict = await verifyDocumentAnswer({ client, question: message, answer: content, evidence, strict: strictCheck, signal: request.signal, model: reviewModel, reasoningEffort: "low" });
              await recordUsage(service, { userId, actionCode, model: reviewModel, tokensIn: verdict.tokensIn, tokensOut: verdict.tokensOut, reservationId });
              return verdict;
            };
            let checked: { ok: boolean; citations: ChatCitation[]; reasons: string[] };
            if (strict) checked = await runModelCheck(true);
            else {
              const local = localDocumentCheck({ question: message, answer: content, evidence });
              if (local.ok && !local.suspicious) auditCandidate = { answer: content, localCitations: local.citations.length };
              if (!local.ok || !local.suspicious) checked = local;
              else {
                const verdict = await runModelCheck(false);
                checked = verdict.ok ? verdict : { ok: false, citations: [], reasons: ["number_not_in_source", ...verdict.reasons] };
              }
            }
            if (!checked.ok) {
              logOpsEvent("document_answer_rejected", { operationId, attempt, strict, evidence: evidence.length, reasons: checked.reasons, linked: linkedEvidence });
              if (!strict && offDocument && isAcceptableOutsideAnswer(content)) {
                citations = [];
                content = await polishPrep(content);
                accepted = true;
                break;
              }
              // Sistemin kendisinin bağladığı not (15 Kasım 2026, canlı): öğrenci "Yalnızca belgem" seçmedi. Cevap eğitim
              // denetiminden geçtiyse kalır, yalnız sayfa atfı çıkmaz. Canlıda özet isteği iki kez kaynak denetiminden
              // (schema_mismatch) düşüp "emin olamadım"a dönüyordu; yeniden yazmak aynı yerde takılıyordu.
              if (linkedEvidence && !strict) {
                citations = [];
                accepted = true;
                break;
              }
              continue;
            }
            citations = checked.citations;
          }
        }
        if (!noSource) content = await polishPrep(content);
        accepted = true;
        break;
      }
      if (!accepted) {
        // "Bu notta neler var?" denetimden geçmezse öğrenci "emin olamadım" görmesin: belgenin
        // doğrulanmış konu haritasından cevap kurulur (19 Ekim 2026; konu başlıkları belgeyle
        // temellendirilmiş veri, yeni bilgi yazılmaz).
        const outline = documentAttached && rest.imageDocumentId && isOverviewQuestion(message)
          ? await documentOutlineAnswer(service, rest.imageDocumentId)
          : null;
        content = outline ?? (strict
          ? "Belgedeki bilgilerle bu soruya güvenilir bir yanıt oluşturamadım. Soruyu daraltabilir veya başka bir belge ekleyebilirsin.\n\n_Kredin harcanmadı._"
          : chatFallbackMessage({ isPremium, difficulty: difficulty.level }));
        charge = false;
        citations = [];
      }
      if (charge && solveGuard) {
        content = prepareChatSolution(content);
        const parsed = independentEarly ? await independentEarly : null;
        // Adım Adım modunda cevap bilerek yazılmamış olabilir; "cevap yoksa bağımsız çözümü yaz" yalnız tam çözümde.
        if (parsed) content = mergeIndependentSolve(content, parsed, { preferWhenUnclaimed: Boolean(imageUrl) && (tutorStyle !== "step_by_step" || turn.plan.fullSolution) });
      }
      // "Materyal dışı" etiketi yalnız bilgi bölümünde (15 Kasım 2026): benzetme, soru ve yönlendirmeden ibaret bölümün
      // etiketi kalkar; stüdyo yönlendirmesi turunda "kaynakta yok" satırı da. "Yalnızca belgem" modunda dokunulmaz.
      if (!strict && charge) content = settlePedagogicalLabels(content, { redirect: studioRedirect });
      // Faz 13A (teacher.v2): tek hamle kuralının kod katmanı, yalnız siler (soru soran mesajda "Akılda kalsın", fazla
      // destek kutusu, iç sistem dili). Ölçü anonim (PROMPT §9).
      if (teacherV2 && charge && !(rest.prepId && prepGrounding)) {
        const settled = settleOneMove(content);
        // PR-1 ses kılavuzu (§7) ve G-1: yasak kalıp, doğrulanamayan istatistik, fazla emoji, başlık/madde işareti,
        // formül dışı ham üs/alt simge. Yalnız siler ya da simgeye çevirir; cümle yazmaz, model çağrısı yok.
        const voice = settleVoice(settled.text);
        content = voice.text;
        console.info("teacher_v2_turn", {
          ...oneMoveMetrics(content),
          style: teachStyle,
          removedRemember: settled.removedRemember,
          removedBoxes: settled.removedBoxes,
          internalStripped: settled.internalStripped,
          voice: { banned: voice.banned, stats: voice.stats, emoji: voice.emoji, structure: voice.structure, rawFixed: voice.rawFixed, rawLeft: voice.rawLeft },
          ...(v2Session
            ? {
                session: {
                  asked: v2Session.asked.length,
                  answering: v2Session.answering,
                  attempt: v2Session.attempt,
                  repeated: repeatsAskedQuestion(content, v2Session.asked),
                },
              }
            : {}),
        });
      }
    }
    // Türkçe aritmetik sağlama (10 Kasım 2026, güven paketi): "A × B = C" eşitliğinde sonuç yalnız ayırıcı karışıklığının
    // imzasıyla (bin katı) sapıyorsa düzeltilir. Kayıttan ÖNCE ve kaynak işaretlerinden önce: akan taslak bitişte kayıtlı
    // metinle değiştiği için öğrencinin gördüğü ve saklanan metin aynıdır. Günlüğe yalnız sayı yazılır.
    // Düğme işaretini yalnız sunucu basar: modelin yazdığı taklit işaretler silinir.
    content = stripModelActionMarkers(content);
    const mathFix = verifyAndFixTurkishMathExpressions(content);
    if (mathFix.fixes) {
      content = mathFix.text;
      console.warn("chat_math_separator_fixed", { operationId, fixes: mathFix.fixes });
    }
    // Sahipsiz atıf (15 Kasım 2026, canlı): metindeki `[n]` ancak n numaralı kaynak aşağıda listelenirse kalır. Kaynak
    // denetimi bir kaynağı düşürünce öğrenci karşılığı olmayan `[2]` görüyordu. Kod bloğuna dokunulmaz.
    content = stripOrphanCitations(content, citations.map((item) => item.reference));
    // Only server-verified metadata becomes a navigable source, never model URLs.
    if (rest.prepId && prepGrounding && charge) {
      const markers = citations.length
        ? citations.map((item) => citationMarker({
          documentName: item.documentName,
          pageNumber: item.pageNumber,
          slide: false,
          href: citationHref(item),
        }))
        : prepGrounding.decision === "in"
          ? prepGrounding.passages.slice(0, 2).map((item) => citationMarker({
            documentName: item.documentName,
            pageNumber: item.pageNumber,
            slide: item.slide,
            href: item.href,
          }))
          : [];
      if (markers.length) content += `\n${markers.join("\n")}`;
    } else if (citations.length) content += "\n\nKaynaklar:\n" + citations.map((c) =>
      // Numara metindeki `[n]` atfıyla aynı: öğrenci hangi atfın hangi sayfa olduğunu görür.
      `- [${c.reference}] [${c.documentName.replace(/[\\[\]()*<>]/g, "")} ${c.pageNumber ? `· s.${c.pageNumber}` : ""}](${citationHref(c)})`).join("\n");
    if (charge && chatActions.length) content += `\n\n${chatActions.map(actionMarker).join("\n")}`;
    const refused = await settleModeration();
    if (refused) return refused;
    if (request.signal.aborted) throw new Error("request_cancelled");
    const { data: saved, error: saveError } = await service.rpc("complete_chat_operation", {
      p_user_id: userId, p_operation_id: operationId, p_reservation_id: reservationId,
      p_user_message: message, p_content: content, p_citations: citations, p_model: model,
      p_charge: charge, p_tokens_in: tokensIn, p_tokens_out: tokensOut,
    });
    if (saveError || !saved) throw new Error("chat_settlement_failed");
    // The RPC is atomic: on an ambiguous network failure, retry reads its result.
    reservationId = null;
    if (rest.prepId && gradedForStore) {
      await recordChatMisconception(service, {
        userId,
        prepId: rest.prepId,
        grade: gradedForStore,
        question: message,
      }).catch(() => undefined);
    }
    await recordUserActivity(service, userId, "chat").catch(() => undefined);
    // Yıldızlar (17 Ekim 2026, kıyas ürünü: "Öğretmenle sohbet — günde bir kez, 3 mesajdan sonra").
    after(() => awardChatStars(service, userId));
    // Yeni sohbet: kıyas ürünü gibi kısa başlık + emoji, cevap gittikten sonra.
    const savedConversationId = (saved as SavedChatResult).conversationId;
    if (!rest.conversationId && savedConversationId) {
      after(() =>
        titleConversation(service, { userId, conversationId: savedConversationId, message, answer: content }),
      );
    }
    stage("saved");
    if (auditCandidate && charge && shouldSampleChatAudit()) {
      const sample = auditCandidate;
      const auditEvidence = evidence;
      const auditModel = contentModel();
      after(async () => {
        try {
          // Kapatma anahtarı ve günlük tavan (Burhan karar 3): ikisi de yanıttan sonra, öğrenciyi bekletmez.
          if (!(await isFeatureEnabled(service, CHAT_AUDIT_FLAG))) return;
          if (!(await claimChatAuditSlot())) {
            console.info("chat_audit_sample_capped");
            return;
          }
          const client = openaiClient({ apiKey: env.OPENAI_API_KEY });
          const verdict = await verifyDocumentAnswer({
            client,
            question: message,
            // Yalnız belge bölümü: genel bilgi bölümü belgeye karşı ölçülmez.
            answer: splitOutsideMaterial(sample.answer).documentPart || sample.answer,
            evidence: auditEvidence,
            strict: true,
            model: auditModel,
            reasoningEffort: "low",
          });
          await recordUsage(service, { userId, actionCode, model: auditModel, tokensIn: verdict.tokensIn, tokensOut: verdict.tokensOut });
          console.info("chat_audit_sample", {
            agree: verdict.ok,
            reasons: verdict.reasons.slice(0, 4),
            linked: linkedEvidence,
            evidence: auditEvidence.length,
            localCitations: sample.localCitations,
          });
        } catch (error) {
          console.warn("chat_audit_sample_failed", { cause: error instanceof Error ? error.name : "unknown" });
        }
      });
    }
    if (live.started) {
      const result = saved as SavedChatResult;
      live.finish({
        content: result.content,
        conversationId: result.conversationId,
        messageId: result.messageId,
        // Belgesiz hazırlıkta kaynak, havuzdaki müfredat dersidir (sayfa yok).
        sources: result.citations.length || (prepGrounding?.pool ? 1 : 0),
        sourceDoc: result.citations[0]?.documentName ?? (prepGrounding?.pool ? `Müfredat dersi: ${prepGrounding.pool.label}` : ""),
        sourcePage: result.citations[0]?.pageNumber != null ? String(result.citations[0].pageNumber) : "",
      });
      const totalMs = Date.now() - routeStartedAt;
      after(() =>
        recordLessonTiming(service, {
          userId,
          kind: "chat",
          path: "stream_first",
          openMs: totalMs,
          firstScreenMs: live.firstTokenMs ?? totalMs,
          meta: { source: "server", prep: Boolean(rest.prepId), live: true, stages: Object.fromEntries(timings) },
        }),
      );
      return new Response(null, { status: 204 });
    }
    const response = rest.prepId
      ? streamedChatResultResponse(saved as SavedChatResult, strict)
      : chatResultResponse(saved as SavedChatResult, strict);
    // Ölçüm (t260u): Server-Timing + lesson_timings kind='chat' (ilk kelime = kayıt anı; yanıt kayıttan sonra akar).
    const serverTiming = timings.map(([name, ms]) => `${name};dur=${ms}`).join(", ");
    try { response.headers.set("Server-Timing", serverTiming); } catch { /* değişmez başlık */ }
    const openMs = Date.now() - routeStartedAt;
    after(() =>
      recordLessonTiming(service, {
        userId,
        kind: "chat",
        path: "stream_first",
        openMs,
        firstScreenMs: openMs,
        meta: { source: "server", prep: Boolean(rest.prepId), stages: Object.fromEntries(timings) },
      }),
    );
    return response;
  } catch (err) {
    // Model, denetim reddi yüzünden iptal edildiyse öğrenci güvenli mesajı görür.
    if (live.blocked && blockedMessage && !live.started) {
      try { await undoSpend(); } catch { console.error("chat_credit_recovery_required", { operationId }); }
      return new Response(blockedMessage, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Credits-Used": "0" } });
    }
    try { await undoSpend(); } catch { console.error("chat_credit_recovery_required", { operationId }); }
    // Sebep olmadan bu satır işe yaramaz: 23 Eylül 2026'da canlıda yalnızca
    // "generation_failed" görünüyor, hata ne diye üç kez sunucu açıldı.
    // Sağlayıcı gövdesi yok, yalnızca hata adı ve mesajı.
    const cause = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("generation_failed", { feature: "chat", operationId, cancelled: request.signal.aborted, cause: cause.slice(0, 300) });
    if (live.started) {
      // Akış başladıysa taslak geri çekilir; kredi yukarıda iade edildi.
      live.finish({ content: "Yanıt bu sefer tamamlanamadı. Aynı soruyu yeniden deneyebilirsin; kredin harcanmadı.", error: true });
      return new Response(null, { status: 204 });
    }
    return NextResponse.json({ error: "Yanıt bu sefer gelmedi. Aynı soruyu yeniden deneyebilirsin; tamamlanmış işlem tekrar ücretlenmez." }, { status: request.signal.aborted ? 499 : 503 });
  }
}

/** Belgenin konu haritasından "bu notta neler var" cevabı; harita yoksa null. */
async function documentOutlineAnswer(
  service: SupabaseClient,
  documentId: string,
): Promise<string | null> {
  const { data } = await service.from("document_topic_nodes")
    .select("id, title, parent_id, sort_order")
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });
  const nodes = ((data ?? []) as { id: string; title: string; parent_id: string | null }[])
    .map((row) => ({ id: row.id, title: row.title, parentId: row.parent_id ?? null }));
  const titles = [...new Set(pickStudyTopics(nodes).map((row) => row.title.trim()).filter(Boolean))];
  if (!titles.length) return null;
  return [
    "Belgeden: Bu notta şu konular var:",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
    "",
    "Hangisinden başlayalım? Bir konuyu yazarsan onu belgendeki bilgilerle anlatırım.",
  ].join("\n");
}
