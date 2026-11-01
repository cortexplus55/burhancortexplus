"use client";

/** Sonuç: yıldız, yazılı deneme sonucu, "+%X kazandın" ve etkinliğin sonuç ekranı. */
import { dedupePathLabels } from "@/lib/learning/path-labels";
import { Star, Swords } from "lucide-react";
import { ExamFinishButton } from "@/components/parity/exam-finish-button";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { TopicGainCard } from "@/components/parity/topic-gain-card";
import { pathChangeLine } from "@/lib/learning/path-change";
import { reviewScheduledLine } from "@/lib/learning/review-copy";
import { ExamWrittenReview } from "@/components/parity/exam-written-review";
import { cn } from "@/lib/utils";
import { resultMood } from "@/lib/learning/result-mood";
import { LessonRatingCard } from "@/components/parity/lesson-rating-card";
import { LevelSuggestCard } from "@/components/parity/level-suggest-card";
import { repeatedCardsLine } from "@/lib/learning/flashcard-round";
import { replayLabel } from "@/lib/learning/feedback-copy";
import Link from "next/link";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function StarsEarned({ life }: { life: NodeLifecycle }) {
  const { stage, starsEarned } = life;
  return (
    <>
      {stage === "result" && starsEarned > 0 ? (
        <p className="cp-stars-earned" role="status">
          <Star className="h-4 w-4" aria-hidden />+{starsEarned} yıldız
        </p>
      ) : null}
    </>
  );
}

export function WrittenExamResult({ life }: { life: NodeLifecycle }) {
  const { signalStage, stage, setStage, setPayload, setIndex, setAnswers, setScore, writtenReview, setWrittenReview, nextHref, answersRef, isTimedExam } = life;
  return (
    <>
      {stage === "result" && isTimedExam && writtenReview ? (
        <ExamWrittenReview
          review={writtenReview}
          nextHref={nextHref}
          onRetry={() => {
            setWrittenReview(null);
            setIndex(0);
            setAnswers({});
            answersRef.current = {};
            setPayload({});
            setScore({ score: 0, total: 1, retried: 0 });
            setStage(signalStage);
          }}
        />
      ) : null}
    </>
  );
}

export function ResultScreen({ life }: { life: NodeLifecycle }) {
  const { prepId, kind, topicId, reviewSaved, rewriteHref, resumeEnabled, router, isOral, stage, setStage, payload, attemptId, setIndex, setAnswers, setCardOffer, setCardRepeat, cardSummary, setCardSummary, score, spentMinutes, oralGrade, nextHref, levelHint, topicGain, pathChange, reviewScheduled, gainOpen, setGainOpen, feedback, setFeedback, feedbackLoading, podcastLoading, setPodcastCheckOpen, lessonPodcast, setLessonPodcast, isTimedExam, start, loadLessonPodcast, loadFeedback, structuredLesson, unscored, heroScore, heroTotal } = life;
  return (
    <>
      {stage === "result" && gainOpen && topicGain ? <TopicGainCard gain={topicGain} nextHref={nextHref} /> : null}

      {stage === "result" && !gainOpen && !isOral && !isTimedExam && payload.type !== "readiness" && payload.type !== "practice_empty" ? (
        <section
          className={cn(
            "cp-exam-node-result",
            `cp-exam-node-result--${resultMood(heroScore, heroTotal).tone}`,
          )}
        >
          {payload.type === "lesson" ? (
            <h1 className="cp-exam-result-title">Dersin tamamı bu kadar</h1>
          ) : null}
          {/* Astra düzeni (30 Eylül 2026): büyük skor, emoji ve tek cümle,
              altında doğruluk ve süre satırları. */}
          {unscored ? (
            <>
              <p className="cp-lesson-kicker">Podcast</p>
              <p className="cp-result-mood">
                <span aria-hidden>🎧</span> Dinledin, konu kulağında.
              </p>
            </>
          ) : (
            <>
              <p className="cp-lesson-kicker">
                {payload.type === "cards" && cardSummary
                  ? "Bildiğin kartlar"
                  : payload.type === "podcast"
                    ? "Dinleme kontrolü"
                    : "Doğru cevaplar"}
              </p>
              <p
                className="cp-result-hero"
                aria-label={
                  payload.type === "cards" && cardSummary
                    ? `${heroTotal} karttan ${heroScore} biliniyor`
                    : `${heroTotal} sorudan ${heroScore} doğru`
                }
              >
                <strong>{heroScore}</strong>
                <span>/{heroTotal}</span>
              </p>
              <p className="cp-result-mood">
                <span aria-hidden>{resultMood(heroScore, heroTotal).emoji}</span>{" "}
                {resultMood(heroScore, heroTotal).text}
              </p>
            </>
          )}
          <dl className="cp-result-lines" aria-label="Oturum özeti">
            {unscored ? null : (
              <div>
                <dt>Doğruluk</dt>
                <dd>%{Math.round((heroScore / Math.max(1, heroTotal)) * 100)}</dd>
              </div>
            )}
            <div>
              <dt>Harcanan zaman</dt>
              <dd>
                {spentMinutes()} dk
              </dd>
            </div>
          </dl>
          {payload.type === "cards" && cardSummary && cardSummary.partial > 0 ? (
            <p className="text-sm text-[var(--cp-muted)]">
              {cardSummary.partial} kartta zorlandın; bunlar bilinen kart sayısına girmez.
            </p>
          ) : null}
          {payload.type === "cards" && cardSummary && repeatedCardsLine(cardSummary.repeated) ? (
            <p className="text-sm text-[var(--cp-muted)]">{repeatedCardsLine(cardSummary.repeated)}</p>
          ) : null}
          {score.retried > 0 ? (
            <p className="text-sm text-[var(--cp-muted)]">
              {score.retried === 1
                ? "1 soru ilk denemede yanlıştı. Tekrar ayrı durur ve bu sayıya eklenmez."
                : `${score.retried} soru ilk denemede yanlıştı. Tekrarlar ayrı durur ve bu sayıya eklenmez.`}
            </p>
          ) : null}
          {unscored ? null : (
            <p className="text-sm text-[var(--cp-muted)]">
              Bu oturum skoru tamamlamadan ve hazırlık tahmininden ayrıdır.
            </p>
          )}
          {oralGrade?.items?.some((item) => !item.correct && item.gap) ? (
            <ul className="mt-2 space-y-1 text-sm">
              {oralGrade.items
                .filter((item) => !item.correct && item.gap)
                .map((item) => (
                  <li key={item.index}>
                    <span className="text-[var(--cp-muted)]">Eksik: </span>
                    {item.gap}
                  </li>
                ))}
            </ul>
          ) : null}
          {resumeEnabled && (score.retried > 0 || (score.total > 0 && score.score < score.total)) ? (
            <div className="cp-exam-retry-card">
              <p className="cp-exam-debrief-label">Tekrar edilecekler</p>
              <p className="text-sm">
                <Link
                  href={`/deneme-sinavlari/${prepId}/tekrarlar`}
                  className="underline"
                >
                  Yanlışlar ve tekrarlar
                </Link>
                {" · "}
                <Link
                  href={`/deneme-sinavlari/${prepId}/degerlendirme`}
                  className="underline"
                >
                  Sınav öncesi değerlendirme
                </Link>
              </p>
            </div>
          ) : null}
          {payload.type === "lesson" ? (
            <div className="pm-card cp-exam-self-test">
              <h2>Kendini test et</h2>
              <p>Bu dersi hızlı bir bilgi kontrolüyle tamamla.</p>
              <ExamFinishButton prepId={prepId} topicId={topicId} className="cp-exam-continue cp-exam-continue--primary" />
            </div>
          ) : null}
          <div className="cp-exam-node-actions">
            <button type="button" className="cp-exam-continue" onClick={() => {
              setStage("setup");
              setIndex(0);
              setAnswers({});
              setFeedback(null);
              setCardOffer(null);
              setCardRepeat(null);
              setCardSummary(null);
              setPodcastCheckOpen(false);
              // Ders aynı haliyle yeniden açılır (anında, kredisiz); öbür etkinlikler yeniden kurulur.
              if (kind === "lesson") void start({ replay: true });
            }}>
              {replayLabel(kind)}
            </button>
            {kind === "lesson" ? (
              <button type="button" className="cp-exam-continue" onClick={() => {
                // Kayıtlı ders açıkken kurulum kartı yok (yalnız "Kayıtlı içerik açılıyor" kalırdı): yeni anlatım
                // açık seçimin adresinde yazılır (30 Ekim 2026).
                if (reviewSaved && rewriteHref) {
                  router.push(rewriteHref);
                  return;
                }
                setStage("setup");
                setIndex(0);
                setAnswers({});
                setFeedback(null);
              }}>
                Farklı anlat
              </button>
            ) : null}
            {/* Podcast'te eğitmen notu yok: geri bildirim yalnız test ve doğru/yanlış cevaplarını okuyor
                (dinleme kontrolü cevaplansa da). */}
            {unscored || kind === "podcast" ? null : (
              <button
                type="button"
                className="cp-exam-continue"
                disabled={feedbackLoading}
                onClick={() => void loadFeedback()}
              >
                {feedbackLoading ? "Yazıyor…" : "Eğitmeninden geri bildirim"}
              </button>
            )}
            {/* Sesli tekrar dersin devamı: aynı bölümler, aynı örnek,
                kulakla bir kez daha. Ders bitmeden önerilmiyor. */}
            {kind === "lesson" && topicId && !lessonPodcast ? (
              <button
                type="button"
                className="cp-exam-continue"
                disabled={podcastLoading}
                onClick={() => void loadLessonPodcast()}
              >
                {podcastLoading ? "Hazırlanıyor…" : "Şimdi dinle"}
              </button>
            ) : null}
          </div>
          {/* Uzun üretimde ne olduğunu söyle (30 Ekim 2026, Paket I #9): konunun podcast'i hazırsa anında gelir. */}
          {podcastLoading && !lessonPodcast ? (
            <p className="cp-exam-card-hint" role="status">
              Sesli tekrar konunun sayfalarından yazılıyor ve seslendiriliyor; ilk kez hazırlanıyorsa bir iki dakika sürebilir.
            </p>
          ) : null}
          {lessonPodcast ? (
            <ExamPodcastPlayer
              title={lessonPodcast.title}
              chapters={lessonPodcast.chapters}
              embed
              onClose={() => setLessonPodcast(null)}
              onFinish={() => setLessonPodcast(null)}
            />
          ) : null}
          {feedback ? (
            <article className="cp-exam-debrief">
              <p className="cp-lesson-kicker">Eğitmen notu</p>
              <h2>{feedback.headline}</h2>
              <p>{feedback.note}</p>
              {feedback.gaps.length ? (
                <>
                  <p className="cp-exam-debrief-label">Zayıf noktalar</p>
                  <ul>
                    {feedback.gaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {feedback.nextFocus.length ? (
                <>
                  <p className="cp-exam-debrief-label">Bundan sonra</p>
                  <ul>
                    {feedback.nextFocus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ) : null}
          {payload.type === "lesson" ? (
            structuredLesson?.nextFocus?.length ? (
              <>
                <p className="cp-exam-debrief-label">
                  Sıradaki adım
                  {dedupePathLabels(structuredLesson.nextFocus).prefix ? ` · ${dedupePathLabels(structuredLesson.nextFocus).prefix}` : ""}
                </p>
                <ul>
                  {dedupePathLabels(structuredLesson.nextFocus).items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-[var(--cp-muted)]">Sıradaki adım, hazırlığın bir sonraki çalışmasıdır.</p>
            )
          ) : null}
          {pathChange ? (
            <p className="cp-path-change" role="status">
              {pathChangeLine(pathChange)}
            </p>
          ) : null}
          {reviewScheduledLine(reviewScheduled, kind) ? (
            <p className="cp-path-change" role="status">
              {reviewScheduledLine(reviewScheduled, kind)}
            </p>
          ) : null}
          {levelHint ? <LevelSuggestCard prepId={prepId} hint={levelHint} /> : null}
          {attemptId ? <LessonRatingCard attemptId={attemptId} kind={kind} /> : null}
          {/* Astra her dersin sonunda "arkadaşına meydan oku" diyor (1 Ekim
              2026). Düello sayfasına gider; kurmak öğrencinin kararı. */}
          <Link href={`/deneme-sinavlari/${prepId}/duello`} className="cp-exam-challenge">
            <Swords className="h-5 w-5 shrink-0" aria-hidden />
            <span>
              <strong>Arkadaşına meydan oku</strong>
              <em>Aynı konuda düello kur, bağlantıyı gönder. Arkadaşının hesap açması gerekmiyor.</em>
            </span>
          </Link>
          {topicGain ? (
            // Konu hâkimiyeti arttıysa önce "+%X kazandın" kartı, sonra sıradaki adım (Astra sırası).
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              onClick={() => {
                setGainOpen(true);
                window.scrollTo({ top: 0 });
              }}
            >
              Devam et
            </button>
          ) : (
            <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
              {payload.type === "lesson" ? "Sıradaki adıma geç" : "Devam et"}
            </Link>
          )}
        </section>
      ) : null}
    </>
  );
}
