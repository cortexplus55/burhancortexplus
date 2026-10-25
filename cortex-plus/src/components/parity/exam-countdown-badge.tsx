import Link from "next/link";
import type { ExamCountdown } from "@/lib/learning/exam-countdown";
import { examCountdownHeadline } from "@/lib/learning/exam-countdown";

export function ExamCountdownBadge({
  countdown,
}: {
  countdown: ExamCountdown | null | undefined;
}) {
  if (!countdown || countdown.state === "missing") return null;
  const headline = examCountdownHeadline(countdown);
  if (countdown.state === "past") {
    return (
      <div className="cp-exam-due-bar cp-exam-due-bar--past" role="status">
        <Link href={countdown.addHref}>{countdown.label}</Link>
      </div>
    );
  }
  if (!headline) return null;
  return (
    <div className="cp-exam-due-bar" role="status">
      <span>{headline}</span>
    </div>
  );
}
