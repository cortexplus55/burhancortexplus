import { TrueFalseStudio } from "@/components/learning/studio/true-false-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Doğru / Yanlış" };

export default async function TrueFalseStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("QUIZ_GENERATE");
  const { topic } = await searchParams;
  return <TrueFalseStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
