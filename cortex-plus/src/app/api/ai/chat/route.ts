import { NextResponse } from "next/server";
import { loadActivePrompt, PROMPT_KEYS } from "@/lib/ai/prompts";
import { z } from "zod";
import OpenAI from "openai";
import {
  EducationalVerificationError,
  verifyEducationalContent,
} from "@/lib/ai/quality-gate";
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
import {
  commitCredits,
  newIdempotencyKey,
  recordUsage,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { searchDocumentChunks, type DocumentMatch } from "@/lib/rag/pipeline";
import { chatSourceBlock } from "@/lib/learning/source-context";
import {
  documentInstruction,
  NO_SOURCE_CREDIT_NOTE,
  saidNoSource,
  stripNoSourceMarker,
} from "@/lib/ai/grounding";
import { extractText } from "@/lib/documents/extract-text";
import { documentPageContext } from "@/lib/documents/page-context";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { loadExamChatContext } from "@/lib/learning/exam-chat-context";

const bodySchema = z.object({
  message: z.string().min(1).max(12000),
  actionCode: z
    .enum(["AI_CHAT_STANDARD", "AI_CHAT_ADVANCED"])
    .default("AI_CHAT_STANDARD"),
  conversationId: z.string().uuid().optional(),
  useDocuments: z.boolean().default(false),
  /** true = Yalnızca Belgem; false = Belgem + Genel Bilgi. useDocuments false ise yok sayılır. */
  documentsOnly: z.boolean().default(true),
  audience: z.enum(["student"]).default("student"),
  imageDocumentId: z.string().uuid().optional(),
  /** Sohbet bir sınav hazırlığının içinden açıldıysa o hazırlığın kimliği. */
  prepId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "chat", limit: 40, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { message, useDocuments, documentsOnly } = parsed.data;

  let imageUrl: string | null = null;
  let attachmentContext = "";
  let documentPages = 0;
  if (parsed.data.imageDocumentId) {
    const { data: doc } = await service
      .from("documents")
      .select("storage_path, mime_type, file_name")
      .eq("id", parsed.data.imageDocumentId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) return errorResponse(404, "document_not_found");
    if (doc?.mime_type?.startsWith("image/")) {
      const { data: signed } = await service.storage
        .from("documents")
        .createSignedUrl(doc.storage_path as string, 600);
      imageUrl = signed?.signedUrl ?? null;
    } else if (doc.mime_type === "application/pdf" || doc.mime_type === "text/plain") {
      try {
        const { data, error } = await service.storage.from("documents").download(doc.storage_path);
        if (error || !data) throw new Error("download_failed");
        const extracted = await extractText(Buffer.from(await data.arrayBuffer()), doc.mime_type);
        if (!extracted.ok) throw new Error("unreadable_document");
        documentPages = extracted.pages.length;
        const text = documentPageContext(extracted.pages);
        if (text.length > 80000) return errorResponse(413, "Belge çok uzun. Daha kısa bir bölüm yükleyin.");
        attachmentContext = documentInstruction({
          // Katı kip: belgede karşılığı yoksa cevap yok. Gerekçesi
          // `lib/ai/grounding.ts` içinde; öğrenci bu notla sınava çalışıyor.
          mode: "strict",
          fileName: doc.file_name as string,
          pageCount: extracted.pages.length,
          documentText: text,
        });
      } catch {
        return errorResponse(422, "PDF okunamadı. Metin katmanı olan bir PDF deneyin.");
      }
    }
  }

  /*
    İçerik denetimi krediden önce.

    Sırası önemli: engellenen bir istek için öğrencinin hakkı yanmamalı.
    Denetim ücretsiz bir uçta çalışıyor, yani bu kontrol faturaya bir şey
    eklemiyor.

    Yanıt, hata değil normal bir cevap olarak dönüyor (200, düz metin).
    Kendine zarar sinyalinde ekrana kırmızı bir hata kutusu çıkarmak, yardım
    isteyen bir gence "sistem seni reddetti" demek olurdu.
  */
  const verdict = await moderate({
    text: message,
    imageUrls: imageUrl ? [imageUrl] : [],
  });
  if (verdict.action !== "allow") {
    void recordAbuse({
      signal: "moderation",
      severity: verdict.action === "flag" ? "low" : "high",
      scope: "chat",
      userId,
      request,
      // Metnin kendisi kaydedilmiyor; hangi kategoriye düştüğü yeterli.
      metadata: { categories: verdict.categories, outcome: verdict.action },
    });
  }
  if (verdict.action === "block" || verdict.action === "support") {
    return new Response(verdict.message, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Conversation-Id": parsed.data.conversationId ?? "",
        // Bu yanıt modelden gelmedi; oylanacak bir satır yok.
        "X-Message-Id": "",
        "X-Credits-Used": "0",
      },
    });
  }

  const isPremium = await isPremiumUser(service, userId);

  /*
    Ücretsiz hesapta fotoğrafın günlük tavanı.

    Denetimden SONRA: engellenen bir istek öğrencinin hakkını yakmamalı —
    aynı gerekçe krediyi de denetimden sonra ayırıyor.

    Tavanın neden gerektiği `image-quota.ts` içinde: kredi freni davet
    çarpanında kayboluyor ve ödeme yapmamış bir hesap günde yüzlerce gpt-4o
    fotoğrafına çıkabiliyordu.
  */
  if (imageUrl && !(await freeImageAllowed(userId, isPremium))) {
    return errorResponse(429, "free_image_limit");
  }

  const { data: profile } = await service
    .from("profiles")
    .select("tutor_style")
    .eq("id", userId)
    .maybeSingle();
  const styleBlock = ` ${tutorStylePrompt(parseTutorStyle(profile?.tutor_style))}`;

  /*
    Kaçıncı tur olduğunu SUNUCU sayıyor.

    Zorluk ölçümünün en güçlü sinyali "öğrenci üçüncü turda hâlâ anlamadım
    diyor" — bu tahmin değil ölçüm: ucuz modelin anlatımı bir kez denendi ve
    tutmadı. Ama tur sayısını istemciden almak, model seçimini yeniden
    istemcinin eline vermek olurdu; `difficulty` alanı tam bu yüzden bir kez
    devre dışı bırakılmıştı.

    Sayım `user_id` ile sınırlı: başkasının sohbet kimliği gönderilse bile
    sıfır dönüyor.
  */
  let priorUserTurns = 0;
  if (parsed.data.conversationId) {
    const { count } = await service
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", parsed.data.conversationId)
      .eq("user_id", userId)
      .eq("role", "user");
    priorUserTurns = count ?? 0;
  }

  const difficulty = assessQuestionDifficulty({
    message,
    turn: priorUserTurns + 1,
    hasImage: Boolean(imageUrl),
  });

  const routerInput = {
    actionCode: parsed.data.actionCode as ActionCode,
    isPremium,
    hasImage: Boolean(imageUrl),
    userSelectedAdvanced: parsed.data.actionCode === "AI_CHAT_ADVANCED",
    documentPages,
    difficulty: difficulty.level,
  };

  /*
    Zor soru yükseltmesinin aylık tavanı burada işliyor.

    Yönlendirici saf: hangi dala düştüğünü `upgrade` ile söylüyor, hakkı
    sormuyor. Tavan yalnızca gerçekten yükseltilen istekte sorgulanıyor —
    görsel, ücretli gelişmiş sohbet ve ücretsiz hesap bu turu hiç ödemiyor.

    Hak verilmezse istek REDDEDİLMİYOR: aynı girdi, yükseltme kapalıyken bir
    daha yönlendiriliyor ve öğrenci cevabını standart modelden alıyor. Kredi
    zaten iki durumda da aynı (`AI_CHAT_STANDARD`), yani öğrencinin ödediği
    değişmiyor; biten şey onun ödemediği ikram.
  */
  const routed = selectModel(routerInput);
  const { model, actionCode } =
    routed.upgrade === "difficulty" &&
    !(await claimHardUpgrade(service, userId))
      ? selectModel({ ...routerInput, hardUpgradeAllowed: false })
      : routed;

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
      sources = await searchDocumentChunks(service, userId, message, 4, {
        minSimilarity: documentsOnly ? 0.32 : undefined,
      });
    } catch {
      sources = [];
    }
  }

  // Yalnızca Belgem + retrieval boş → modele gitmeden sabit cevap (kredi iade).
  if (useDocuments && documentsOnly && sources.length === 0 && !attachmentContext) {
    await undoSpend();
    const noSource =
      "Bu bilgi yüklediğin belgede yer almıyor. Başka bir belge ekleyebilir veya Belgem + Genel Bilgi moduna geçebilirsin.";
    if (conversationId) {
      await service.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: noSource,
      });
    }
    return new Response(noSource, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Conversation-Id": conversationId ?? "",
        "X-Message-Id": "",
        "X-Credits-Used": "0",
        "X-Sources": "0",
        "X-Documents-Only": "1",
      },
    });
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
  const contextBlock =
    attachmentContext ||
    chatSourceBlock(sources, {
      documentsOnly: useDocuments && documentsOnly,
    });

  // Sınavın içinden açılan sohbet nerede olduğunu bilsin: hangi hazırlık,
  // kaç gün kaldı, en son hangi ders okundu. Bu olmadan öğrenci derste
  // takıldığında konuyu sohbete baştan anlatmak zorunda kalıyordu.
  const examContext = parsed.data.prepId
    ? await loadExamChatContext(service, userId, parsed.data.prepId)
    : null;

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

    const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${SYSTEM_GUARDRAIL} ${studentInstruction}${styleBlock}${examContext?.block ?? ""}${contextBlock}`,
      },
      ...history.slice(0, -1),
      { role: "user", content: userContent },
    ];

    /*
      İlk çağrı akışın DIŞINDA kalıyor.

      Sağlayıcı kaynaklı hatalar (anahtar geçersiz, kota, 5xx) burada
      yakalanıp 502 JSON'a dönüyor. Çağrı akışın içine taşınsa aynı hata
      kırık bir akış hâline gelir ve istemci "yanıt üretilemedi" yerine yarım
      bir metin görür. İkinci deneme zorunlu olarak içeride, çünkü
      gerekliliği ancak ilk cevap denetlendikten sonra biliniyor.
    */
    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: requestMessages,
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
        /** Akışı boşalt; metni ve jeton sayımını topla. */
        async function drain(
          source: Awaited<ReturnType<typeof openai.chat.completions.create>>,
        ) {
          let text = "";
          for await (const chunk of source as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) text += delta;
            if (chunk.usage) {
              tokensIn = chunk.usage.prompt_tokens ?? 0;
              tokensOut = chunk.usage.completion_tokens ?? 0;
            }
          }
          return text;
        }

        function review(draft: string) {
          return verifyEducationalContent({
            client: openai,
            context: JSON.stringify({ history: history.slice(0, -1), message, contextBlock }),
            draft,
            format: "Öğrenciye gösterilecek sohbet yanıtı. Metin ve matematik biçimlendirmesini koru.",
            imageUrls: imageUrl ? [imageUrl] : [],
          });
        }

        try {
          fullText = await drain(stream);

          /*
            Kalite kapısı ikinci katman: zorluk tahmini yanılırsa bedeli bir
            tur gecikme oluyor, yanlış cevap değil.

            İkinci deneme premium hesapta GÜÇLÜ modelle yapılıyor — tahmin
            "kolay" dediği hâlde denetimden geçmeyen cevap, tam olarak
            tahminin yanıldığı durumdur. Ücretsiz hesapta aynı modelle bir kez
            daha deniyoruz: standart modelin kendi varyansı bile çoğu zaman
            ikinci turda düzgün cevap veriyor.

            Kredi ikinci denemede de artmıyor: öğrenci bir soru sordu.
          */
          let verified;
          try {
            verified = await review(fullText);
          } catch (firstError) {
            if (!(firstError instanceof EducationalVerificationError)) throw firstError;

            const retryModel = isPremium ? env.OPENAI_ADVANCED_MODEL : model;
            const retryStream = await openai.chat.completions.create({
              model: retryModel,
              stream: true,
              stream_options: { include_usage: true },
              messages: requestMessages,
            });
            fullText = await drain(retryStream);

            try {
              verified = await review(fullText);
            } catch (secondError) {
              if (!(secondError instanceof EducationalVerificationError)) throw secondError;

              /*
                İki kez geçemedi. Eskiden akış burada hata veriyordu: kredi
                iade ediliyor ama öğrenci ekranda boş bir yanıt görüyordu ve
                gördüğü şey "bu sistem çalışmıyor"du. Artık ne olduğunu
                söylüyoruz.
              */
              await undoSpend();
              controller.enqueue(
                encoder.encode(
                  chatFallbackMessage({ isPremium, difficulty: difficulty.level }),
                ),
              );
              controller.close();
              return;
            }
          }
          /*
            Katı kipte model "belgede yok" cevabını `[KAYNAKTA_YOK]` ile
            işaretliyor. İşaret bize lazım (ölçüm ve kayıt için), öğrenciye
            değil: ekranda köşeli parantezli bir etiket görmek, cevabın
            kendisinden daha çok soru işareti doğurur.
          */
          /*
            "Notunda yok" cevabı KREDİ ALMIYOR.

            Bunun gerekçesi ürünün kendi mantığında: katı çiti koyarken
            "belgede olmayan doğru bir bilgi bile öğrenci için yanlış
            yönlendirmedir" dedik. O kural gereği model bazen cevap vermeyi
            reddediyor — ve reddettiği her soruda öğrenciden kredi almak,
            dürüst davranışı öğrenciye ceza olarak yaşatmak olur.

            Sonucu da öngörülebilir: krediyi yiyen reddi gören öğrenci
            reddetmeyen bir ürüne geçer. Yani çitin bedelini biz ödemezsek
            öğrenci ödüyor ve çit kendi kendini sabote ediyor.

            Ölçüm tarafı bozulmuyor: `recordUsage` yine yazılıyor, yani
            sağlayıcıya gerçekten ödediğimiz jeton kaydı duruyor. Düşen şey
            öğrencinin kredisi.
          */
          const noSource = saidNoSource(verified.content);
          fullText = stripNoSourceMarker(verified.content);
          if (noSource) fullText += NO_SOURCE_CREDIT_NOTE;
          await recordUsage(service, {
            userId, actionCode, model: env.OPENAI_ADVANCED_MODEL,
            tokensIn: verified.tokensIn, tokensOut: verified.tokensOut,
            reservationId: reservation.reservationId,
          });
          controller.enqueue(encoder.encode(fullText));

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

          if (noSource) {
            await undoSpend();
          } else {
            await commitCredits(service, reservation.reservationId);
          }
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
        "X-Source-Page":
          sources[0]?.pageNumber != null ? String(sources[0].pageNumber) : "",
        "X-Documents-Only": useDocuments && documentsOnly ? "1" : "0",
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
