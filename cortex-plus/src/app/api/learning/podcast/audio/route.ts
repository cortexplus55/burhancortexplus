import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { synthesizeCharged, type AudioTrack } from "@/lib/learning/audio-cache";
import { speakVerified } from "@/lib/learning/speech-normalizer";
import { flattenLines, normalizeChapters } from "@/lib/learning/podcast-script";
import { MAX_PODCAST_AUDIO_CHARS, MAX_PODCAST_AUDIO_LINES, MAX_SPEECH_LINE_CHARS } from "@/lib/learning/podcast-audio-contract";
import { durationVerdict, stampChapterDurations, sumDurationMs } from "@/lib/learning/podcast-duration";
import { PODCAST_LENGTHS, type PodcastLength } from "@/lib/learning/podcast-formats";

export const maxDuration = 300;

/**
 * Podcast seslendirme.
 *
 * Kayıtlı her kademe bu ucu çağırabilir. Harcama özellik kilidi değil:
 * yalnızca gerçekten üretilen karakter faturalanıyor (900 karakter = 15 kredi, 19 Ekim 2026);
 * önbellekten gelen cümle bedava, çünkü bize de bir maliyeti yok. Hak bitince
 * 402 `insufficient_credits`; ücretsiz hesapta ses Plus'ta, 402 `premium_required`.
 * Misafir `withUser` ile 401 alır.
 *
 * `stream: true` satırları bittiği anda NDJSON yazar. Tek ayırma tüm
 * senaryoyu kapsar; parçalamak krediyi artırmaz.
 */

const bodySchema = z.object({
  chapters: z.array(z.unknown()).min(1).max(10),
  stream: z.boolean().optional(),
  length: z.enum(PODCAST_LENGTHS).optional(),
});

function logMeasuredDuration(
  chapters: ReturnType<typeof normalizeChapters>,
  durations: readonly number[],
  length?: PodcastLength,
) {
  let cursor = 0;
  const withLineDuration = chapters.map((chapter) => ({
    ...chapter,
    lines: chapter.lines.map((line) => ({ ...line, durationMs: durations[cursor++] ?? 0 })),
  }));
  const stamped = stampChapterDurations(withLineDuration);
  const measuredMs = sumDurationMs(stamped.flatMap((chapter) => chapter.lines));
  console.info("podcast_duration", {
    measuredMs,
    chapters: stamped.map((chapter) => ({ title: chapter.title, durationMs: chapter.durationMs })),
    ...(length ? { length, verdict: durationVerdict(measuredMs, length) } : {}),
  });
  return { stamped, measuredMs };
}

function speechOf(line: { text: string; spoken?: string }): string {
  return line.spoken?.trim() || speakVerified(line.text);
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast-audio", limit: 12 });
  if (!guard.ok) return guard.response;

  const entitlements = await getUserEntitlements(guard.ctx.service, guard.ctx.userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const chapters = normalizeChapters(parsed.data.chapters);
  if (!chapters.length) return errorResponse(400, "invalid_input");

  const lines = flattenLines(chapters);
  if (lines.length > MAX_PODCAST_AUDIO_LINES ||
      lines.some((line) => line.text.length > MAX_SPEECH_LINE_CHARS) ||
      lines.reduce((sum, line) => sum + line.text.length, 0) > MAX_PODCAST_AUDIO_CHARS) {
    return errorResponse(400, "invalid_input");
  }

  const speech = lines.map((line) => ({ text: speechOf(line), speaker: line.speaker }));
  if (speech.some((line) => line.text.length > MAX_SPEECH_LINE_CHARS) ||
      speech.reduce((sum, line) => sum + line.text.length, 0) > MAX_PODCAST_AUDIO_CHARS) {
    return errorResponse(400, "invalid_input");
  }

  if (!parsed.data.stream) {
    const result = await synthesizeCharged(guard.ctx.service, guard.ctx.userId, speech);
    if (!result.ok && (result.reason === "insufficient_credits" || result.reason === "premium_required")) {
      return errorResponse(402, result.reason);
    }
    if (!result.ok) return errorResponse(503, "audio_unavailable");
    const measured = logMeasuredDuration(
      chapters,
      result.tracks.map((track) => track.durationMs),
      parsed.data.length,
    );
    return NextResponse.json({
      creditsSpent: result.creditsSpent,
      measuredMs: measured.measuredMs,
      chapters: measured.stamped,
      lines: lines.map((line, i) => ({
        chapterIndex: line.chapterIndex,
        speaker: line.speaker,
        text: line.text,
        url: result.tracks[i].url,
        durationMs: result.tracks[i].durationMs,
      })),
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      let ready = 0;
      const result = await synthesizeCharged(guard.ctx.service, guard.ctx.userId, speech, {
        onTrack: (index, track: AudioTrack) => {
          ready += 1;
          const line = lines[index];
          if (!line) return;
          send({
            type: "line",
            index,
            ready,
            total: lines.length,
            chapterIndex: line.chapterIndex,
            speaker: line.speaker,
            text: line.text,
            url: track.url,
            durationMs: track.durationMs,
          });
        },
      });
      if (!result.ok && (result.reason === "insufficient_credits" || result.reason === "premium_required")) {
        send({ type: "error", code: result.reason });
      } else if (!result.ok) {
        send({ type: "error", code: "audio_unavailable" });
      } else {
        const measured = logMeasuredDuration(
          chapters,
          result.tracks.map((track) => track.durationMs),
          parsed.data.length,
        );
        send({
          type: "done",
          creditsSpent: result.creditsSpent,
          total: lines.length,
          measuredMs: measured.measuredMs,
          chapters: measured.stamped.map((chapter) => ({ title: chapter.title, durationMs: chapter.durationMs })),
          lines: lines.map((line, i) => ({
            chapterIndex: line.chapterIndex,
            speaker: line.speaker,
            text: line.text,
            url: result.tracks[i].url,
            durationMs: result.tracks[i].durationMs,
          })),
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
