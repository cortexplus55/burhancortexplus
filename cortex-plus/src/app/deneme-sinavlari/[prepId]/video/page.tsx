import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { VideoLessonPlayer, VideoLessonSetup } from "@/components/parity/video-lesson";
import { requireStudentArea } from "@/lib/auth/session";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { AUDIO_BUCKET } from "@/lib/learning/audio-cache";
import { videoStyle } from "@/lib/learning/video-lesson";
import type { StoredVideoScene } from "@/lib/learning/video-run";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Video" };
export const dynamic = "force-dynamic";

const SIGNED_SECONDS = 60 * 60 * 3;

/**
 * Video ders (17 Ekim 2026, Astra'daki gibi; yalnız Plus). `?v=` ile oynatıcı, yoksa
 * kurulum: stil → konu → hazırlanıyor.
 */
export default async function PrepVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ v?: string; topicId?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  if (query.v) {
    const { data: video } = await supabase
      .from("prep_videos")
      .select("id, title, topic_label, style, scenes, duration_ms, completed_at")
      .eq("id", query.v)
      .eq("user_id", user.id)
      .eq("exam_prep_id", prepId)
      .maybeSingle();
    if (!video) notFound();
    const scenes = (Array.isArray(video.scenes) ? video.scenes : []) as StoredVideoScene[];
    // Depo özel; yol sahibin videosundan geliyor, imza sunucuda.
    const service = createServiceClient();
    const { data: signed } = await service.storage
      .from(AUDIO_BUCKET)
      .createSignedUrls(scenes.flatMap((scene) => [scene.imagePath, scene.audioPath]), SIGNED_SECONDS);
    const url = new Map((signed ?? []).map((row) => [row.path, row.signedUrl]));
    return (
      <ParitySorShell {...shell} chrome="session">
        <VideoLessonPlayer
          prepId={prepId}
          videoId={video.id as string}
          title={String(video.title)}
          topicLabel={String(video.topic_label)}
          styleLabel={videoStyle(String(video.style)).label}
          completed={Boolean(video.completed_at)}
          scenes={scenes.map((scene) => ({
            narration: scene.narration,
            durationMs: scene.durationMs,
            imageUrl: url.get(scene.imagePath) ?? "",
            audioUrl: url.get(scene.audioPath) ?? "",
          }))}
        />
      </ParitySorShell>
    );
  }

  const service = createServiceClient();
  const entitled =
    requireFeature(await getUserEntitlements(service, user.id), "video") || (await billingExempt(service, user.id));
  const [{ data: topics }, { data: previous }] = await Promise.all([
    supabase.from("exam_prep_topics").select("id, label").eq("exam_prep_id", prepId).order("sort_order"),
    supabase
      .from("prep_videos")
      .select("id, title, topic_label, style, created_at")
      .eq("exam_prep_id", prepId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  return (
    <ParitySorShell {...shell} chrome="focus" backHref={`/deneme-sinavlari/${prepId}`}>
      <VideoLessonSetup
        prepId={prepId}
        entitled={entitled}
        initialTopicId={query.topicId ?? null}
        topics={(topics ?? []).filter((topic) => topic.id && topic.label).map((topic) => ({ id: topic.id as string, label: topic.label as string }))}
        previous={(previous ?? []).map((row) => ({
          id: row.id as string,
          title: String(row.title),
          topicLabel: String(row.topic_label),
          styleLabel: videoStyle(String(row.style)).label,
        }))}
      />
    </ParitySorShell>
  );
}
