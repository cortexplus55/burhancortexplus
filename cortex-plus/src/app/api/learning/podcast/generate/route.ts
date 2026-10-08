import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { DEFAULT_PODCAST_LENGTH } from "@/lib/learning/podcast-formats";
import { runTeacherPodcast } from "@/lib/learning/teacher-podcast-run";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  /** "Belgem" kaynağı: senaryo yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

/*
  Araçlar > Podcast (3 Ekim 2026): sınav hazırlığındaki öğretmen podcast
  motoru — temiz çekirdek sayfalar (belge seçildiyse), belgeyle eşleme,
  modelin düzeltmesi. Eski tek-anlatıcı şablonu ve kalıp denetimi kalktı.
*/
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast", limit: 6, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  /*
    Podcast kayıtlı ücretsizde açık (24 Eylül 2026). Kapı özellik değil kota:
    senaryo öğretmen motorunda kredi yer, ses ayrı uçta karakter başına
    ücretlenir. Misafir `withUser` ile 401 AUTH_REQUIRED alır ve modele
    ulaşmaz. `/ornek` hazır bölümü hâlâ girişsiz ve maliyetsiz duruyor.
  */
  const entitlements = await getUserEntitlements(service, userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, documentId } = parsedBody.data;

  // Kredi ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const source = await studioTeacherSource(service, { userId, topic, documentId });
  if (!source) return errorResponse(409, "document_not_ready");

  const outcome = await runTeacherPodcast(service, {
    userId,
    actionCode: "PODCAST_GENERATE",
    idempotencyKey: `studio-podcast:${userId}:${crypto.randomUUID()}`,
    topicLabel: topic,
    prepTitle: source.fileName ?? topic,
    pages: source.pages,
    mode: source.mode,
    length: DEFAULT_PODCAST_LENGTH,
    runningHeaders: source.edges,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
  const episode = {
    title: outcome.episode.title,
    tagline: outcome.episode.chapters[0]?.title ?? topic,
    chapters: outcome.episode.chapters,
  };

  // Senaryo kütüphaneye yazılıyor: ses satırları içerik adresli önbellekte
  // durduğu için aynı bölümü yeniden dinlemek bedava; saklanan tek şey metin.
  // Yazma başarısız olsa bile bölüm bu istekte çalınır — best-effort.
  let podcastId: string | null = null;
  try {
    const { data: saved } = await service
      .from("podcasts")
      .insert({
        user_id: userId,
        document_id: documentId ?? null,
        topic,
        title: episode.title,
        tagline: episode.tagline,
        chapters: episode.chapters,
      })
      .select("id")
      .single();
    podcastId = (saved?.id as string | undefined) ?? null;
  } catch {
    podcastId = null;
  }

  return NextResponse.json({
    ...episode,
    podcastId,
    source: documentId
      ? { kind: "document", documentId, fileName: source.fileName }
      : { kind: "topic" },
  });
}
