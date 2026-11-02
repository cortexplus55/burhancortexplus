import { notFound } from "next/navigation";
import { QuizLockFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default function E2eQuizLockPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return <QuizLockFixture />;
}
