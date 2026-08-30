import { PodcastStudio } from "@/components/learning/studio/podcast-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Podcast stüdyosu" };

export default async function PodcastStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("AI_CHAT_STANDARD");
  const { topic } = await searchParams;
  return <PodcastStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
