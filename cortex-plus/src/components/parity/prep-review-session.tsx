"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import type { ReviewAnswerOutcome, ServedReviewItem } from "@/lib/learning/review-items";
import "@/styles/prep-review.css";

/** Ekran metinleri tek yerde; bekçi test bunları okur. */
export const PREP_REVIEW_COPY = {
  title: "Bugünkü tekrar",
  empty: "Bugün tekrar yok. Yanlış yaptığın sorular ve dersin sınav noktaları ertesi gün burada.",
  done: "Bugünkü tekrar bitti",
  back: "Yoluna dön",
  check: "Kontrol et",
  next: "Sıradaki",
  finish: "Bitir",
  reveal: "Cevabı göster",
  ask: "Hatırladın mı?",
  saveFailed: "Cevabın kaydedilemedi; yeniden dene.",
  retry: "Yeniden dene",
  gone: "Bu soru artık bugünkü listede değil.",
  multiHint: "Birden fazla yanıt seçebilirsin",
} as const;

type Feedback = ReviewAnswerOutcome & { picks: string[] };

/**
 * Günü gelen tekrarın oynatıcısı (20 Ekim 2026). Her seferde bir soru; not sunucuda (doğru cevap ve
 * açıklama cevaptan önce sayfada yok). Seçmeli soruda şık(lar) seçilip kontrol edilir; kart ve sözlü
 * cevapta önce hatırlanır, cevap açılır, "Hatırladın mı?" ile öğrenci kendini değerlendirir.
 * Ağ düşerse soru geçilmez: "yeniden dene". Tek çıkış ×.
 */
export function PrepReviewSession({
  prepId,
  prepTitle,
  items,
  total,
}: {
  prepId: string;
  prepTitle: string;
  items: ServedReviewItem[];
  total: number;
}) {
  const router = useRouter();
  const home = examPrepHomeHref(prepId);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [gone, setGone] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [right, setRight] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);

  const close = (
    <Link href={home} className="cp-review-close" aria-label="Kapat">
      <X className="h-5 w-5" aria-hidden />
    </Link>
  );

  if (!items.length || finished) {
    const left = remaining ?? Math.max(0, total - items.length);
    return (
      <main className="cp-review">
        {close}
        <section className="cp-review-done" aria-live="polite">
          <h1>{items.length ? PREP_REVIEW_COPY.done : PREP_REVIEW_COPY.title}</h1>
          <p>{items.length ? `${answered} sorudan ${right} doğru · ${prepTitle}` : PREP_REVIEW_COPY.empty}</p>
          <div className="cp-review-actions">
            {items.length && left > 0 ? (
              <button type="button" className="cp-review-btn cp-review-btn--primary" onClick={() => router.refresh()}>
                Kalan {left} tekrar · Devam et
              </button>
            ) : null}
            <Link href={home} className={items.length && left > 0 ? "cp-review-btn" : "cp-review-btn cp-review-btn--primary"}>
              {PREP_REVIEW_COPY.back}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const item = items[index];
  const last = index + 1 >= items.length;
  const settled = Boolean(feedback) || gone;

  async function send(body: { pick?: string | string[]; recalled?: boolean }) {
    if (sending || settled) return;
    setSending(true);
    setFailed(false);
    try {
      const res = await fetch("/api/learning/exam-prep/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, itemId: item.id, ...body }),
      });
      // Başka bir sekmede bitmiş ya da günü değişmiş: soru geçilir, hata ekranı yok.
      if (res.status === 404 || res.status === 409) {
        setGone(true);
        return;
      }
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as ReviewAnswerOutcome;
      setFeedback({ ...data, picks: Array.isArray(body.pick) ? body.pick : body.pick ? [body.pick] : [] });
      setAnswered((value) => value + 1);
      if (data.correct) setRight((value) => value + 1);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  function advance() {
    if (last) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPicks([]);
    setRevealed(false);
    setFeedback(null);
    setGone(false);
    setFailed(false);
  }

  function toggle(option: string) {
    if (settled || item.mode !== "choice") return;
    if (!item.multi) {
      setPicks([option]);
      return;
    }
    setPicks((current) => (current.includes(option) ? current.filter((value) => value !== option) : [...current, option]));
  }

  const pct = Math.round(((index + (settled ? 1 : 0)) / items.length) * 100);

  return (
    <main className="cp-review">
      {close}
      <header className="cp-review-head">
        <h1 className="cp-review-kicker">{PREP_REVIEW_COPY.title}</h1>
        <p className="cp-review-count">
          {index + 1} / {items.length}
        </p>
      </header>
      <div className="cp-review-progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="cp-review-chips">
        <span className="cp-review-chip">{item.sourceLabel}</span>
        {item.reasonLabel ? <span className="cp-review-chip cp-review-chip--exam">{item.reasonLabel}</span> : null}
        {item.topicLabel ? <span className="cp-review-chip">{item.topicLabel}</span> : null}
      </div>

      {item.mode === "choice" ? (
        <>
          <h2 className="cp-review-prompt">
            <RichBody text={item.prompt} topicHint={item.topicLabel ?? ""} />
          </h2>
          {item.multi ? <p className="cp-review-hint">{PREP_REVIEW_COPY.multiHint}</p> : null}
          <div className="cp-review-options" role={item.multi ? "group" : "radiogroup"} aria-label="Şıklar">
            {item.options.map((option, optionIndex) => {
              const picked = picks.includes(option);
              const isAnswer = Boolean(feedback?.correctAnswers?.includes(option));
              const tone = feedback
                ? isAnswer
                  ? " is-right"
                  : picked
                    ? " is-wrong"
                    : ""
                : picked
                  ? " is-picked"
                  : "";
              const why = feedback?.optionWhy?.[option];
              return (
                <div key={option}>
                  <button
                    type="button"
                    role={item.multi ? "checkbox" : "radio"}
                    aria-checked={picked}
                    className={`cp-review-option${tone}`}
                    disabled={settled || sending}
                    onClick={() => toggle(option)}
                  >
                    <span className="cp-review-option-mark" aria-hidden>
                      {feedback && isAnswer ? (
                        <Check className="h-4 w-4" />
                      ) : feedback && picked ? (
                        <X className="h-4 w-4" />
                      ) : (
                        String.fromCharCode(65 + optionIndex)
                      )}
                    </span>
                    <span className="cp-review-option-text">
                      <RichBody text={option} topicHint={item.topicLabel ?? ""} />
                    </span>
                  </button>
                  {why && (isAnswer || picked) ? <p className="cp-review-why">{why}</p> : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="cp-review-card">
          <p className="cp-review-card-label">Soru</p>
          <div className="cp-review-card-front">
            <RichBody text={item.front} topicHint={item.topicLabel ?? ""} />
          </div>
          {revealed ? (
            <div className="cp-review-card-back">
              <RichBody text={item.back} topicHint={item.topicLabel ?? ""} />
            </div>
          ) : null}
        </div>
      )}

      {feedback ? (
        <div className="cp-review-feedback">
          <p className={`cp-review-line ${feedback.correct ? "is-right" : "is-wrong"}`} role="status">
            {feedback.correct ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            {feedback.line}
          </p>
          {feedback.corrected ? (
            <div className="cp-review-corrected">
              <strong>Doğrusu:</strong> <RichBody text={feedback.corrected} />
            </div>
          ) : null}
          {feedback.explanation ? (
            <div className="cp-review-explain">
              <RichBody text={feedback.explanation} topicHint={item.topicLabel ?? ""} />
            </div>
          ) : null}
        </div>
      ) : null}

      {gone ? (
        <p className="cp-review-corrected" role="status">
          {PREP_REVIEW_COPY.gone}
        </p>
      ) : null}

      {failed ? (
        <p className="cp-review-error" role="alert">
          {PREP_REVIEW_COPY.saveFailed}
        </p>
      ) : null}

      {item.mode === "recall" && revealed && !settled ? <p className="cp-review-ask">{PREP_REVIEW_COPY.ask}</p> : null}

      <div className="cp-review-actions">
        {settled ? (
          <button type="button" className="cp-review-btn cp-review-btn--primary" onClick={advance}>
            {last ? PREP_REVIEW_COPY.finish : PREP_REVIEW_COPY.next}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : item.mode === "choice" ? (
          <button
            type="button"
            className="cp-review-btn cp-review-btn--primary"
            disabled={!picks.length || sending}
            onClick={() => void send({ pick: item.multi ? picks : picks[0] })}
          >
            {failed ? PREP_REVIEW_COPY.retry : sending ? "Kontrol ediliyor…" : PREP_REVIEW_COPY.check}
          </button>
        ) : !revealed ? (
          <button type="button" className="cp-review-btn cp-review-btn--primary" onClick={() => setRevealed(true)}>
            {PREP_REVIEW_COPY.reveal}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="cp-review-btn cp-review-btn--primary"
              disabled={sending}
              onClick={() => void send({ recalled: true })}
            >
              Evet
            </button>
            <button type="button" className="cp-review-btn" disabled={sending} onClick={() => void send({ recalled: false })}>
              Hayır
            </button>
          </>
        )}
      </div>
    </main>
  );
}
