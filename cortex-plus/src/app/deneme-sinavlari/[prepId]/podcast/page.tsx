import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepPodcastSession } from "@/components/parity/prep-podcast-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Podcast" };
export const dynamic = "force-dynamic";

function podcastLength(value: string | undefined): "ozet" | "standart" | "derin" {
  return value === "ozet" || value === "derin" ? value : "standart";
}

export default async function PrepPodcastPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ topicId?: string; length?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep || !query.topicId) notFound();

  const { data: topic } = await supabase
    .from("exam_prep_topics")
    .select("id, label")
    .eq("id", query.topicId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!topic) notFound();

  return (
    <ParitySorShell {...shell}>
      <PrepPodcastSession
        prepId={prepId}
        topicId={topic.id}
        topicLabel={topic.label}
        length={podcastLength(query.length)}
      />
    </ParitySorShell>
  );
}
