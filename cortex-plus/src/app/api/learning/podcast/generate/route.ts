import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { generateJson } from "@/lib/ai/generate";
import {
  podcastDialogueIssues,
  podcastNarrationBrief,
  SINGLE_NARRATOR_SCHEMA,
} from "@/lib/learning/teacher-brain";

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
    Podcast kayıtlı ücretsizde açık (24 Eylül 2026). Kapı özellik değil kota:
    senaryo `generateJson` içinde kredi yer, ses ayrı uçta karakter başına
    ücretlenir. Misafir `withUser` ile 401 AUTH_REQUIRED alır ve modele
    ulaşmaz. `/ornek` hazır bölümü hâlâ girişsiz ve maliyetsiz duruyor.
  */
  const entitlements = await getUserEntitlements(service, userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }
  const isPremium = entitlements.isPremium;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium,
    schemaHint:
      'Yalnızca şu JSON: {"title":string,"tagline":string,"chapters":[{"title":string,"lines":[{"speaker":"ada","text":string}]}]}. ' +
      `4-5 bölüm. ${SINGLE_NARRATOR_SCHEMA} Konuşma dilinde Türkçe.`,
    userPrompt: `${podcastNarrationBrief()} Konu: ${parsedBody.data.topic}. Tek öğretmenin anlattığı 5 dakikalık ders senaryosu yaz.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      if (!result.success) return null;
      if (podcastDialogueIssues(result.data.chapters).length) return null;
      return result.data;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json(outcome.data);
}
