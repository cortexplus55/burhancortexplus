import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { VideoLessonPlayer, VideoLessonSetup } from "@/components/parity/video-lesson";
import { requireStudentArea } from "@/lib/auth/session";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { AUDIO_BUCKET } from "@/lib/learning/audio-cache";
import { isSketchStored, readSketchDiagram, videoStyleLabel } from "@/lib/learning/video-lesson";
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
  searchParams: Promise<{ v?: string; topicId?: string; mode?: string }>;
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
    // Depo özel; yol sahibin videosundan geliyor, imza sunucuda. Çizimli sahnede resim yolu boştur.
    const service = createServiceClient();
    const paths = scenes.flatMap((scene) => [scene.imagePath, scene.audioPath].filter((path) => path.length > 0));
    const { data: signed } = paths.length
      ? await service.storage.from(AUDIO_BUCKET).createSignedUrls(paths, SIGNED_SECONDS)
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const url = new Map((signed ?? []).flatMap((row) => (row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : [])));
    return (
      <ParitySorShell {...shell} chrome="session">
        <VideoLessonPlayer
          prepId={prepId}
          videoId={video.id as string}
          title={String(video.title)}
          topicLabel={String(video.topic_label)}
          styleLabel={isSketchStored(String(video.style), scenes) ? "1 Dk Çizimli Video" : videoStyleLabel(String(video.style))}
          completed={Boolean(video.completed_at)}
          scenes={scenes.map((scene) => {
            const diagram = readSketchDiagram(scene.diagram ?? scene.visualSchema);
            return {
              narration: scene.narration,
              durationMs: scene.durationMs,
              imageUrl: scene.imagePath ? (url.get(scene.imagePath) ?? "") : "",
              audioUrl: scene.audioPath ? (url.get(scene.audioPath) ?? "") : "",
              ...(scene.keyFact ? { keyFact: scene.keyFact } : {}),
              ...(scene.sceneTitle ? { sceneTitle: scene.sceneTitle } : {}),
              ...(scene.formula ? { formula: scene.formula } : {}),
              ...(diagram ? { diagram } : {}),
            };
          })}
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
      .select("id, title, topic_label, style, scenes, created_at")
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
        initialMode={query.mode === "sketch_reel" ? "sketch_reel" : "image"}
        topics={(topics ?? []).filter((topic) => topic.id && topic.label).map((topic) => ({ id: topic.id as string, label: topic.label as string }))}
        previous={(previous ?? []).map((row) => ({
          id: row.id as string,
          title: String(row.title),
          topicLabel: String(row.topic_label),
          styleLabel: isSketchStored(String(row.style), Array.isArray(row.scenes) ? (row.scenes as StoredVideoScene[]) : [])
            ? "1 Dk Çizimli Video"
            : videoStyleLabel(String(row.style)),
        }))}
      />
    </ParitySorShell>
  );
}
