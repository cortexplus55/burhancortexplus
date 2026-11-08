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
  // "Bugünkü hedefin hazır" diyen şerit tıklanmıyordu (8 Kasım 2026, zor kullanıcı turu): hazırlığa gider.
  if (countdown.href) {
    return (
      <div className="cp-exam-due-bar" role="status">
        <Link href={countdown.href} className="cp-exam-due-link">
          {headline} →
        </Link>
        {countdown.officialExam ? (
          <span className="cp-exam-due-official"> · Resmî sınav günü: {countdown.officialExam}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="cp-exam-due-bar" role="status">
      <span>{headline}</span>
      {countdown.officialExam ? (
        <span className="cp-exam-due-official"> · Resmî sınav günü: {countdown.officialExam}</span>
      ) : null}
    </div>
  );
}
