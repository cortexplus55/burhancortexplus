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
          <span className="cp-exam-due-text">
            <HeadlineParts headline={headline} arrow />
          </span>
        </Link>
        {countdown.officialExam ? (
          <span className="cp-exam-due-official"> · Resmî sınav günü: {countdown.officialExam}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="cp-exam-due-bar" role="status">
      <span className="cp-exam-due-text">
        <HeadlineParts headline={headline} />
      </span>
      {countdown.officialExam ? (
        <span className="cp-exam-due-official"> · Resmî sınav günü: {countdown.officialExam}</span>
      ) : null}
    </div>
  );
}

/**
 * Başlık metni aynı kalır; yalnız " — " iki parçaya bölünür (9 Kasım 2026, C tasarımı): telefonda kartta
 * iki satır, masaüstünde tek satır ve ayraç görünür.
 */
function HeadlineParts({ headline, arrow = false }: { headline: string; arrow?: boolean }) {
  const [main, ...rest] = headline.split(" — ");
  const sub = rest.join(" — ");
  return (
    <>
      <span className="cp-exam-due-main">{main}</span>
      {sub ? (
        <>
          <span className="cp-exam-due-sep"> — </span>
          <span className="cp-exam-due-sub">
            {sub}
            {arrow ? " →" : null}
          </span>
        </>
      ) : arrow ? (
        " →"
      ) : null}
    </>
  );
}
