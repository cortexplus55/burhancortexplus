"use client";

import type { WrittenExamReview } from "@/lib/learning/written-exam-review";

export function ExamWrittenReview({
  review,
  nextHref,
  onRetry,
}: {
  review: WrittenExamReview;
  nextHref: string;
  onRetry?: () => void;
}) {
  const pct = Math.round((review.score / Math.max(1, review.total)) * 100);
  return (
    <section className="cp-written-review">
      <p className="cp-lesson-kicker">Yazılı deneme sonucu</p>
      <h1>
        {review.score}/{review.total}
      </h1>
      <p>Doğruluk %{pct}. Açıklamalar sorunun yanında kayıtlı olan metindir.</p>
      {review.byTopic.length ? (
        <div>
          <h2>Yanlışlar, konuya göre</h2>
          <ul>
            {review.byTopic.map((group) => (
              <li key={group.topic}>
                <strong>
                  {group.topic} · {group.wrong} yanlış / {group.total} soru
                </strong>
                <ul>
                  {group.missedPrompts.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Bu denemede yanlış yok.</p>
      )}
      <ol>
        {review.items.map((item) => (
          <li key={item.index}>
            <p>
              <strong>
                Soru {item.index + 1}
                {item.ok ? " · doğru" : " · yanlış"}
              </strong>
            </p>
            <p>{item.prompt}</p>
            <p>Senin yanıtın: {item.selected.length ? item.selected.join(", ") : "Boş"}</p>
            <p>Doğru yanıt: {item.correct.join(", ")}</p>
            <p>{item.explanation ?? "Bu sorunun kayıtlı açıklaması yok."}</p>
          </li>
        ))}
      </ol>
      <div className="cp-written-review-actions">
        {onRetry ? (
          <button type="button" className="cp-exam-continue" onClick={onRetry}>
            Yeniden çöz
          </button>
        ) : null}
        <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
          Devam et
        </a>
      </div>
    </section>
  );
}
