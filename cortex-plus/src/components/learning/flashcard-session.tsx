"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import {
  KIND_LABEL_TR,
  makeCardKey,
  type FlashcardKind,
  type FlashcardSource,
  type SessionFlashcard,
} from "@/lib/learning/flashcard-model";
import {
  nextCardSchedule,
  scheduleHint,
  type CardRating,
} from "@/lib/learning/spaced-repetition";
import { requeueMissedInSession, type QueuedCard } from "@/lib/learning/flashcard-queue";
import { cn } from "@/lib/utils";

export type FlashcardSessionCard = SessionFlashcard & {
  id?: string;
  bucket?: "due" | "mistake" | "new";
};

type Phase = "start" | "play" | "done" | "empty" | "error";

type RatingCounts = { knew: number; hard: number; missed: number };

function toQueued(cards: FlashcardSessionCard[]): QueuedCard[] {
  return cards.map((card) => ({
    ...card,
    cardKey: card.cardKey || makeCardKey(card.cardSource ?? "studio", card.id ?? card.front),
    cardSource: card.cardSource ?? "studio",
    kind: card.kind ?? "definition",
    bucket: card.bucket ?? (card.fromMistake ? "mistake" : "new"),
  }));
}

async function postReview(body: {
  cardKey: string;
  cardSource: FlashcardSource;
  rating: CardRating;
  examPrepId?: string | null;
  topicLabel?: string | null;
  examDate?: string | null;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch("/api/learning/flashcards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

export function FlashcardSession({
  mode = "standalone",
  title = "Bugünkü tekrar",
  cards: initialCards,
  dueCount,
  mistakeCount,
  newCount,
  estimatedMinutes,
  daysLeft,
  examDate,
  examPrepId,
  topicLabel,
  grounded = true,
  homeHref,
  onFinish,
  finishLabel,
}: {
  mode?: "standalone" | "node";
  title?: string;
  cards: FlashcardSessionCard[];
  dueCount?: number;
  mistakeCount?: number;
  newCount?: number;
  estimatedMinutes?: number;
  daysLeft?: number | null;
  examDate?: string | null;
  examPrepId?: string | null;
  topicLabel?: string | null;
  grounded?: boolean;
  homeHref?: string;
  /** Node: answers map index → rating. */
  onFinish?: (answers: Record<string, CardRating>) => void;
  finishLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>(initialCards.length ? "start" : "empty");
  const [queue, setQueue] = useState<QueuedCard[]>(() => toQueued(initialCards));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [counts, setCounts] = useState<RatingCounts>({ knew: 0, hard: 0, missed: 0 });
  const [answers, setAnswers] = useState<Record<string, CardRating>>({});
  const [failedSaves, setFailedSaves] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const total = queue.length;
  const card = queue[index] ?? null;
  const progress = total ? ((index) / total) * 100 : 0;

  const due = dueCount ?? queue.filter((c) => c.bucket === "due").length;
  const mistakes = mistakeCount ?? queue.filter((c) => c.bucket === "mistake" || c.fromMistake).length;
  const fresh = newCount ?? queue.filter((c) => c.bucket === "new").length;
  const minutes = estimatedMinutes ?? Math.max(1, Math.ceil((total * 20) / 60));

  const previewHints = (rating: CardRating) => {
    const next = nextCardSchedule(
      { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 },
      rating,
      new Date(),
      examDate ?? undefined,
    );
    return scheduleHint(next);
  };

  const rate = useCallback(
    async (rating: CardRating) => {
      if (!card || !flipped) return;
      const answerKey = String(Object.keys(answersRef.current).length);
      const nextAnswers = { ...answersRef.current, [answerKey]: rating };
      setAnswers(nextAnswers);
      setCounts((c) => ({
        ...c,
        knew: c.knew + (rating === "knew" ? 1 : 0),
        hard: c.hard + (rating === "hard" ? 1 : 0),
        missed: c.missed + (rating === "missed" ? 1 : 0),
      }));

      void postReview({
        cardKey: card.cardKey,
        cardSource: card.cardSource,
        rating,
        examPrepId,
        topicLabel: topicLabel ?? card.topicLabel,
        examDate,
      }).then((ok) => {
        if (!ok) setFailedSaves((n) => n + 1);
      });

      const remaining = queue.slice(index + 1);
      let nextQueue = queue;
      if (rating === "missed") {
        const requeued = requeueMissedInSession(remaining, card, 3);
        nextQueue = [...queue.slice(0, index + 1), ...requeued];
        setQueue(nextQueue);
      }

      const nextIndex = index + 1;
      if (nextIndex >= nextQueue.length) {
        setPhase("done");
        if (mode === "node") onFinish?.(nextAnswers);
        return;
      }
      setFlipped(false);
      setIndex(nextIndex);
    },
    [card, flipped, queue, index, examPrepId, topicLabel, examDate, mode, onFinish],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (phase !== "play" || !card) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((v) => !v);
      }
      if (!flipped) return;
      if (event.key === "1") void rate("missed");
      if (event.key === "2") void rate("hard");
      if (event.key === "3") void rate("knew");
      if (event.key === "Escape") setExitOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, card, flipped, rate]);

  if (phase === "empty") {
    return (
      <section className="cp-flash-session">
        <CheckCircle2 className="cp-flash-empty-icon" size={64} aria-hidden />
        <h1>Bugün tekrar edecek kartın yok</h1>
        <p>Bu konu için henüz kart yok.</p>
        {homeHref ? (
          <a href={homeHref} className="cp-exam-continue">
            Çalışma yoluna dön
          </a>
        ) : null}
      </section>
    );
  }

  if (phase === "error") {
    return (
      <section className="cp-flash-session">
        <p>Kartlar yüklenemedi.</p>
        <button type="button" className="cp-exam-continue cp-exam-continue--primary" onClick={() => setPhase("start")}>
          Yeniden dene
        </button>
      </section>
    );
  }

  if (phase === "start") {
    return (
      <section className="cp-flash-session">
        <p className="cp-lesson-kicker" style={{ color: "var(--cp-gold)" }}>
          Hafıza kartları
        </p>
        <h1 className="cp-flash-title">{title}</h1>
        {!grounded ? (
          <p className="cp-flash-ungrounded" role="status">
            Bu kartlar materyaline dayanmıyor
          </p>
        ) : null}
        <div className="pm-card cp-flash-summary">
          <div>
            <strong>{due}</strong>
            <span>Vadesi gelen</span>
          </div>
          <div>
            <strong>{mistakes}</strong>
            <span>Yanlışlarından</span>
          </div>
          <div>
            <strong>{fresh}</strong>
            <span>Yeni</span>
          </div>
          <p className="cp-flash-eta">Yaklaşık {minutes} dk</p>
        </div>
        {daysLeft != null && daysLeft > 0 ? (
          <p className="cp-flash-exam-line">
            <CalendarClock size={16} aria-hidden />
            Sınava {daysLeft} gün var — tekrarlar buna göre planlandı.
          </p>
        ) : null}
        <button
          type="button"
          className="cp-exam-continue cp-exam-continue--primary cp-flash-start"
          onClick={() => {
            setPhase("play");
            setIndex(0);
            setFlipped(false);
          }}
        >
          Tekrara başla
        </button>
        <button type="button" className="cp-flash-ghost" onClick={() => setListOpen((v) => !v)}>
          Kartları listele
        </button>
        {listOpen ? (
          <ul className="cp-flash-list">
            {queue.map((c) => (
              <li key={c.cardKey}>
                <span>{KIND_LABEL_TR[c.kind as FlashcardKind] ?? "Kart"}</span>
                {c.front}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  if (phase === "done") {
    const missedFronts = queue
      .filter((_, i) => answers[String(i)] === "missed")
      .map((c) => c.front)
      .slice(0, 5);
    const sum = counts.knew + counts.hard + counts.missed || 1;
    return (
      <section className="cp-flash-session">
        <h1 className="cp-flash-title">Tekrar bitti</h1>
        <div className="cp-flash-counts">
          <span className="cp-flash-count--ok">Bildim {counts.knew}</span>
          <span className="cp-flash-count--hard">Zorlandım {counts.hard}</span>
          <span className="cp-flash-count--bad">Bilmedim {counts.missed}</span>
        </div>
        <div className="cp-flash-stack-bar" aria-hidden>
          <span style={{ width: `${(counts.knew / sum) * 100}%`, background: "var(--pm-success)" }} />
          <span style={{ width: `${(counts.hard / sum) * 100}%`, background: "var(--c-warning, #f59e0b)" }} />
          <span style={{ width: `${(counts.missed / sum) * 100}%`, background: "var(--pm-danger)" }} />
        </div>
        {failedSaves > 0 ? (
          <p className="cp-flash-save-err" role="status">
            Bazı değerlendirmeler kaydedilemedi.{" "}
            <button type="button" onClick={() => setFailedSaves(0)}>
              Yeniden dene
            </button>
          </p>
        ) : null}
        {missedFronts.length ? (
          <div className="cp-flash-stuck">
            <h2>Takıldığın kartlar</h2>
            <ul>
              {missedFronts.map((front) => (
                <li key={front}>{front}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {mode === "node" ? (
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            onClick={() => onFinish?.(answersRef.current)}
          >
            {finishLabel ?? "Sıradaki adıma geç"}
          </button>
        ) : (
          <>
            {missedFronts.length ? (
              <button
                type="button"
                className="cp-exam-continue cp-exam-continue--primary"
                onClick={() => {
                  const again = toQueued(
                    queue.filter((_, i) => answers[String(i)] === "missed"),
                  );
                  setQueue(again);
                  setAnswers({});
                  setCounts({ knew: 0, hard: 0, missed: 0 });
                  setIndex(0);
                  setFlipped(false);
                  setPhase("play");
                }}
              >
                Takıldıklarımı tekrar et
              </button>
            ) : null}
            {homeHref ? (
              <a href={homeHref} className="cp-exam-continue">
                Çalışma yoluna dön
              </a>
            ) : null}
          </>
        )}
      </section>
    );
  }

  // play
  return (
    <section className="cp-flash-session cp-flash-play">
      <header className="cp-flash-bar">
        <button
          type="button"
          className="cp-flash-close"
          aria-label="Tekrarı bitir"
          onClick={() => setExitOpen(true)}
        >
          <X size={18} />
        </button>
        <div className="cp-flash-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="cp-flash-count-label">
          {Math.min(index + 1, total)} / {total}
        </span>
      </header>

      {card ? (
        <button
          type="button"
          className={cn("cs-flashcard-scene cp-flash-card", flipped && "cp-flash-card--flipped")}
          role="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((v) => !v)}
          onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            if (!flipped || touchX == null) {
              setTouchX(null);
              return;
            }
            const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
            setTouchX(null);
            if (dx <= -80) void rate("missed");
            else if (dx >= 80) void rate("knew");
          }}
        >
          <div className={cn("cs-flashcard-inner", flipped && "cs-flashcard-inner--revealed")}>
            <div className="cs-flashcard-face cs-flashcard-face--front cp-flash-face">
              <div className="cp-flash-face-top">
                <span className="pm-chip">{KIND_LABEL_TR[card.kind] ?? "Kart"}</span>
                {card.fromMistake ? (
                  <span className="cp-flash-mistake-badge">Yanlışlarından</span>
                ) : null}
              </div>
              <p className="cp-flash-front-text">{card.front}</p>
              <span className="cp-flash-hint">Çevirmek için dokun · Boşluk</span>
            </div>
            <div className="cs-flashcard-face cs-flashcard-face--back cp-flash-face" aria-live="polite">
              <span className="cp-flash-answer-label">Cevap</span>
              <p className="cp-flash-back-text">{card.back}</p>
              {card.sourceLabel ? (
                <p className="cp-flash-source">Kaynak: {card.sourceLabel}</p>
              ) : null}
            </div>
          </div>
        </button>
      ) : null}

      {!flipped ? (
        <p className="cp-flash-flip-tip" role="status">
          Önce kartı çevir
        </p>
      ) : null}

      <div className="cp-flash-ratings">
        {(
          [
            { rating: "missed" as const, label: "Bilmedim", icon: X, hint: previewHints("missed"), className: "cp-flash-rate--bad" },
            { rating: "hard" as const, label: "Zorlandım", icon: Minus, hint: previewHints("hard"), className: "cp-flash-rate--hard" },
            { rating: "knew" as const, label: "Bildim", icon: Check, hint: previewHints("knew"), className: "cp-flash-rate--ok" },
          ] as const
        ).map((btn) => (
          <button
            key={btn.rating}
            type="button"
            className={cn("cp-flash-rate", btn.className)}
            disabled={!flipped}
            onClick={() => void rate(btn.rating)}
          >
            <btn.icon size={18} aria-hidden />
            <span>{btn.label}</span>
            <em>{btn.hint}</em>
          </button>
        ))}
      </div>

      {exitOpen ? (
        <div className="cp-flash-exit" role="dialog" aria-modal="true" aria-labelledby="flash-exit-title">
          <h2 id="flash-exit-title">Tekrarı bitirmek istiyor musun?</h2>
          <p>Şimdiye kadarki değerlendirmelerin kaydedildi.</p>
          <button type="button" className="cp-exam-continue cp-exam-continue--primary" onClick={() => setExitOpen(false)}>
            Devam et
          </button>
          <button
            type="button"
            className="cp-exam-continue"
            onClick={() => {
              setExitOpen(false);
              setPhase("done");
              if (mode === "node") onFinish?.(answersRef.current);
            }}
          >
            Bitir
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Üretim beklerken. */
export function FlashcardSessionLoading({ label = "Kartların hazırlanıyor…" }: { label?: string }) {
  return (
    <section className="cp-flash-session" aria-busy="true">
      <Loader2 className="animate-spin" size={28} aria-hidden />
      <p>{label}</p>
    </section>
  );
}
