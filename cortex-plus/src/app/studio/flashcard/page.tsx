import { FlashcardStudio } from "@/components/learning/studio/flashcard-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Flashcard stüdyosu" };

export default async function FlashcardStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("FLASHCARD_GENERATE");
  const { topic } = await searchParams;
  return <FlashcardStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
