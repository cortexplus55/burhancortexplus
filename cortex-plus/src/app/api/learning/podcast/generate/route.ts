import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
});

// Satır bazlı iki sesli biçim; ayrıntı için lib/learning/podcast-script.ts.
const resultSchema = z.object({
  title: z.string().min(1),
  tagline: z.string().min(1),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1),
        lines: z
          .array(
            z.object({
              speaker: z.enum(["ada", "kerem"]),
              text: z.string().min(4),
            }),
          )
          .min(2)
          .max(14),
      }),
    )
    .min(3)
    .max(6),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast", limit: 6, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  /*
    Podcast Plus'a özel (18 Eylül 2026).

    Önceki hâli ücretsiz kullanıcıya 1 kredi karşılığı senaryo üretiyor, sonra
    onu TARAYICININ ROBOT SESİYLE okutuyordu. Ses zaten premium'a kapalıydı,
    yani ücretsiz kullanıcı "podcast" diye telefonunun sesini dinliyordu. Bu
    ürünü tanıtmıyor, kötü gösteriyordu: iki sesli stüdyo anlatımını hiç
    duymamış bir öğrenci, duyduğu şeyi ürünün kendisi sanıyordu.

    Şimdi kapı burada: ücretsiz kullanıcı senaryoyu da üretemiyor, yerine
    "Plus'a özel" diyen bir kart görüyor. Ürünü gerçekten duymak isteyen için
    `/ornek` sayfası duruyor — orada hazır bir bölüm, gerçek sesiyle,
    girişsiz ve bize maliyetsiz çalıyor.
  */
  const isPremium = await isPremiumUser(service, userId);
  if (!isPremium) return errorResponse(402, "premium_required");

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium,
    schemaHint:
      'Yalnızca şu JSON: {"title":string,"tagline":string,"chapters":[{"title":string,"lines":[{"speaker":"ada"|"kerem","text":string}]}]}. ' +
      "4-5 bölüm. Ada ve Kerem iki sunucu; sırayla konuşur, birbirine soru sorar. " +
      "Her text TEK cümle olsun ve 25 kelimeyi geçmesin. Konuşma dilinde Türkçe.",
    userPrompt: `Konu: ${parsedBody.data.topic}. Ada ve Kerem'in sohbet ettiği 5 dakikalık podcast senaryosu yaz.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json(outcome.data);
}
