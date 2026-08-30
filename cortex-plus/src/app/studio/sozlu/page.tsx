import { OralStudio } from "@/components/learning/studio/oral-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Sözlü deneme" };

export default async function OralStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("AI_CHAT_STANDARD");
  const { topic } = await searchParams;
  return <OralStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
