import { QuizStudio } from "@/components/learning/studio/quiz-studio";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Quiz stüdyosu" };

export default async function QuizStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const creditCost = await getCreditCost("QUIZ_GENERATE");
  const { topic } = await searchParams;
  return <QuizStudio creditCost={creditCost} initialTopic={topic ?? ""} />;
}
