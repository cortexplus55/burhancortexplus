import { PodcastStudio } from "@/components/learning/studio/podcast-studio";
import { getCreditCost } from "@/lib/credits/rules";
import { requireStudentArea } from "@/lib/auth/session";
import { loadCompletedDocumentOptions } from "@/lib/documents/document-options";
import { normalizeChapters } from "@/lib/learning/podcast-script";

export const metadata = { title: "Podcast stüdyosu" };
export const dynamic = "force-dynamic";

export default async function PodcastStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; documentId?: string; podcastId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const params = await searchParams;

  const [creditCost, documents, { data: library }, saved] = await Promise.all([
    getCreditCost("AI_CHAT_STANDARD"),
    loadCompletedDocumentOptions(supabase, user.id),
    supabase
      .from("podcasts")
      .select("id, title, topic, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    params.podcastId
      ? supabase
          .from("podcasts")
          .select("id, title, tagline, topic, chapters")
          .eq("user_id", user.id)
          .eq("id", params.podcastId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const sourceDocument = documents.find((d) => d.id === params.documentId) ?? null;
  const savedEpisode = saved
    ? {
        id: saved.id as string,
        title: saved.title as string,
        tagline: (saved.tagline as string | null) ?? "",
        topic: saved.topic as string,
        chapters: normalizeChapters(saved.chapters),
      }
    : null;

  return (
    <PodcastStudio
      creditCost={creditCost}
      initialTopic={params.topic ?? ""}
      sourceDocument={sourceDocument}
      library={(library ?? []).map((p) => ({
        id: p.id as string,
        title: p.title as string,
        topic: p.topic as string,
        createdAt: p.created_at as string,
      }))}
      savedEpisode={savedEpisode?.chapters.length ? savedEpisode : null}
    />
  );
}
