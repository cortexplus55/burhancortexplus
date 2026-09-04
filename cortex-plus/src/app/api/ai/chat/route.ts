import { NextResponse } from "next/server";
import { loadActivePrompt, PROMPT_KEYS } from "@/lib/ai/prompts";
import { z } from "zod";
import OpenAI from "openai";
import { errorResponse, withUser } from "@/lib/api/guards";
import { selectModel } from "@/lib/ai/model-router";
import { SYSTEM_GUARDRAIL, isPremiumUser } from "@/lib/ai/generate";
import { parseTutorStyle, tutorStylePrompt } from "@/lib/learning/tutor-style";
import { env, type ActionCode } from "@/lib/env";
import {
  commitCredits,
  newIdempotencyKey,
  recordUsage,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { searchDocumentChunks, type DocumentMatch } from "@/lib/rag/pipeline";
import { chatSourceBlock } from "@/lib/learning/source-context";
import { recordUserActivity } from "@/lib/streak/record-activity";

const bodySchema = z.object({
  message: z.string().min(1).max(12000),
  actionCode: z
    .enum(["AI_CHAT_STANDARD", "AI_CHAT_ADVANCED"])
    .default("AI_CHAT_STANDARD"),
  conversationId: z.string().uuid().optional(),
  useDocuments: z.boolean().default(false),
  audience: z.enum(["student"]).default("student"),
  imageDocumentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "chat", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { message, useDocuments } = parsed.data;

  let imageUrl: string | null = null;
  if (parsed.data.imageDocumentId) {
    const { data: doc } = await service
      .from("documents")
      .select("storage_path, mime_type")
      .eq("id", parsed.data.imageDocumentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (doc?.mime_type?.startsWith("image/")) {
      const { data: signed } = await service.storage
        .from("documents")
        .createSignedUrl(doc.storage_path as string, 600);
      imageUrl = signed?.signedUrl ?? null;
    }
  }

  const isPremium = await isPremiumUser(service, userId);
  const { data: profile } = await service
    .from("profiles")
    .select("tutor_style")
    .eq("id", userId)
    .maybeSingle();
  const styleBlock = ` ${tutorStylePrompt(parseTutorStyle(profile?.tutor_style))}`;

  const { model, actionCode } = selectModel({
    actionCode: parsed.data.actionCode as ActionCode,
    isPremium,
    hasImage: Boolean(imageUrl),
    userSelectedAdvanced: parsed.data.actionCode === "AI_CHAT_ADVANCED",
  });

  const reserved = await reserveCredits(
    service,
    userId,
    actionCode,
    newIdempotencyKey("chat"),
  );
  if (!reserved.ok) {
    return errorResponse(
      reserved.reason === "insufficient_credits" ? 402 : 400,
      reserved.reason,
    );
  }
  const reservation = reserved;

  async function undoSpend() {
    await refundCredits(service, reservation.reservationId);
  }

  if (!env.OPENAI_API_KEY) {
    await undoSpend();
    return errorResponse(503, "ai_not_configured");
  }

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data: owned } = await service
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) conversationId = null;
  }

  if (!conversationId) {
    const { data: created } = await service
      .from("conversations")
      .insert({ user_id: userId, title: message.slice(0, 60) })
      .select("id")
      .single();
    conversationId = created?.id ?? null;
  }

  if (conversationId) {
    await service.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: message,
    });
  }

  let sources: DocumentMatch[] = [];
  if (useDocuments) {
    try {
      sources = await searchDocumentChunks(service, userId, message, 4);
    } catch {
      sources = [];
    }
  }

  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (conversationId) {
    const { data: previous } = await service
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    for (const row of (previous ?? []).reverse()) {
      if (row.role === "user" || row.role === "assistant") {
        history.push({
          role: row.role,
          content: row.content as string,
        });
      }
    }
  }

  // Eski blok yalnızca "kullandığın alıntıları belirt" diyordu; kaynak
  // kapsamayan bir soruda model hiçbir uyarı vermeden genel bilgiyle
  // cevaplıyor ve öğrenci cevabın nereden geldiğini anlayamıyordu.
  const contextBlock = chatSourceBlock(sources);

  try {
    // Yönetim panelinden yayına alınan talimat; yoksa koddaki varsayılan.
    const studentInstruction = await loadActivePrompt(service, PROMPT_KEYS.studentChat);

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      imageUrl
        ? [
            { type: "text", text: message },
            { type: "image_url", image_url: { url: imageUrl } },
          ]
        : [{ type: "text", text: message }];

    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: "system",
          content: `${SYSTEM_GUARDRAIL} ${studentInstruction}${styleBlock}${contextBlock}`,
        },
        ...history.slice(0, -1),
        { role: "user", content: userContent },
      ],
    });

    const encoder = new TextEncoder();
    /*
      Yanıtın kimliğini akış başlamadan üretiyoruz.

      Satır ancak akış bittiğinde yazılıyor, ama başlıklar gövdeden önce
      gidiyor — yani "yazdıktan sonra kimliği başlığa koy" mümkün değil.
      Kimliği önce üretip sonra o kimlikle yazınca, tarayıcı ilk harften
      itibaren hangi satırı oylayacağını biliyor. Akış hata alırsa satır hiç
      yazılmıyor ve kimlik boşa gidiyor; oylama denemesi de "bulunamadı"
      döndürüyor, ki doğrusu bu.
    */
    const assistantMessageId = crypto.randomUUID();
    let fullText = "";
    let tokensIn = 0;
    let tokensOut = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              fullText += delta;
              controller.enqueue(encoder.encode(delta));
            }
            if (chunk.usage) {
              tokensIn = chunk.usage.prompt_tokens ?? 0;
              tokensOut = chunk.usage.completion_tokens ?? 0;
            }
          }

          if (conversationId) {
            await service.from("messages").insert({
              id: assistantMessageId,
              conversation_id: conversationId,
              role: "assistant",
              content: fullText,
              model,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
            });
            await service
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          }

          await commitCredits(service, reservation.reservationId);
          await recordUsage(service, {
            userId,
            actionCode,
            model,
            tokensIn,
            tokensOut,
            reservationId: reservation.reservationId,
          });
          try {
            await recordUserActivity(service, userId, "chat");
          } catch {
            /* streak optional */
          }
          controller.close();
        } catch (streamError) {
          await undoSpend();
          controller.error(streamError);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Conversation-Id": conversationId ?? "",
        // Sohbet kaydedilmiyorsa oylanacak satır da yok.
        "X-Message-Id": conversationId ? assistantMessageId : "",
        "X-Model": model,
        "X-Credits-Used": String(reservation.cost),
        "X-Sources": String(sources.length),
        // Hangi not kullanıldığı "3 kaynak"tan daha anlamlı. Başlıklar ASCII
        // olmak zorunda; Türkçe dosya adları için yüzde kodlaması.
        "X-Source-Doc": encodeURIComponent(sources[0]?.documentName ?? ""),
      },
    });
  } catch {
    await undoSpend();
    return NextResponse.json(
      { error: "Yanıt üretilemedi. Lütfen tekrar deneyin." },
      { status: 502 },
    );
  }
}
