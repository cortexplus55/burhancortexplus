import { WrittenStudio } from "@/components/learning/studio/written-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Yazılı deneme" };

export default async function WrittenStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("PRACTICE_EXAM_GENERATE");
  const { topic } = await searchParams;
  return <WrittenStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
