import { ExplainStudio } from "@/components/learning/studio/explain-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Anlatarak öğren" };

export default async function ExplainStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  // Sohbetle aynı bütçeden harcıyor: tek model çağrısı, sohbetteki bir
  // soruyla aynı büyüklükte.
  const creditCost = await getCreditCost("AI_CHAT_STANDARD");
  const { topic } = await searchParams;
  return <ExplainStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
