"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Copy, Swords, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DUEL_SECONDS,
  duelRules,
  type DuelAnswer,
  type DuelPublicQuestion,
} from "@/lib/learning/duel";

type BoardRow = { name: string; score: number; correct: number };

type RunResult = {
  correct: number;
  score: number;
  total: number;
  answers: number[];
  rank: number;
  leaderboard: BoardRow[];
};

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * Düello oyunu — Astra'nın kurallarıyla (bkz. `@/lib/learning/duel`).
 * Doğru cevaplar istemcide yok; tur bitince sunucu puanlayıp gösteriyor.
 */
export function DuelPlay({
  code,
  title,
  topic,
  creatorName,
  questions,
  initialBoard,
  signedIn,
}: {
  code: string;
  title: string;
  topic: string | null;
  creatorName: string;
  questions: DuelPublicQuestion[];
  initialBoard: BoardRow[];
  signedIn: boolean;
}) {
  const [stage, setStage] = useState<"intro" | "play" | "sending" | "result">("intro");
  const [name, setName] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DuelAnswer[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const startedAt = useRef(0);
  const answered = useRef(false);

  const limitMs = DUEL_SECONDS * 1000;
  const shareUrl =
    typeof window === "undefined" ? `/duello/${code}` : `${window.location.origin}/duello/${code}`;

  // Soru başına geri sayım; süre dolunca boş cevapla geçer.
  useEffect(() => {
    if (stage !== "play") return;
    startedAt.current = performance.now();
    answered.current = false;
    setElapsed(0);
    const timer = window.setInterval(() => {
      const ms = performance.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= limitMs && !answered.current) {
        answered.current = true;
        record({ choice: null, ms: limitMs });
      }
    }, 100);
    return () => window.clearInterval(timer);
    // record her çizimde yeniden kuruluyor; tetikleyici soru değişimi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index]);

  function record(answer: DuelAnswer) {
    const next = [...answers, answer];
    setAnswers(next);
    if (next.length >= questions.length) {
      void submit(next);
    } else {
      setIndex(next.length);
    }
  }

  function choose(choice: number) {
    if (answered.current) return;
    answered.current = true;
    record({ choice, ms: Math.round(performance.now() - startedAt.current) });
  }

  async function submit(all: DuelAnswer[]) {
    setStage("sending");
    try {
      const res = await fetch(`/api/duels/${code}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: all, name: signedIn ? undefined : name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Kaydedilemedi");
      setResult(data as RunResult);
      setStage("result");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sonuç kaydedilemedi.");
      setStage("intro");
      setAnswers([]);
      setIndex(0);
    }
  }

  function start() {
    if (!signedIn && name.trim().length < 2) {
      toast.error("Sıralamada görünecek adını yaz.");
      return;
    }
    setAnswers([]);
    setIndex(0);
    setResult(null);
    setStage("play");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Bağlantı kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı; adres çubuğundan paylaşabilirsin.");
    }
  }

  if (stage === "play" || stage === "sending") {
    const question = questions[Math.min(index, questions.length - 1)];
    const left = Math.max(0, Math.ceil((limitMs - elapsed) / 1000));
    const isLast = index === questions.length - 1;
    return (
      <section className="cp-duel-card" aria-live="polite">
        <div className="cp-duel-play-head">
          <span>
            Soru {Math.min(index + 1, questions.length)} / {questions.length}
            {isLast ? " · puanlar ×2" : ""}
          </span>
          <span className="cp-duel-timer">
            <Timer className="h-4 w-4" aria-hidden /> {left} sn
          </span>
        </div>
        <div className="cp-duel-bar" aria-hidden>
          <span style={{ width: `${Math.max(0, 100 - (elapsed / limitMs) * 100)}%` }} />
        </div>
        <h2 className="cp-duel-question">{question.text}</h2>
        <div className="cp-duel-options">
          {question.options.map((option, optionIndex) => (
            <button
              key={optionIndex}
              type="button"
              className="cp-duel-option"
              disabled={stage === "sending"}
              onClick={() => choose(optionIndex)}
            >
              <b>{LETTERS[optionIndex]}</b>
              {option}
            </button>
          ))}
        </div>
        {stage === "sending" ? <p className="cp-duel-muted">Puanın hesaplanıyor…</p> : null}
      </section>
    );
  }

  if (stage === "result" && result) {
    return (
      <section className="cp-duel-card">
        <p className="cp-duel-kicker">Puanın</p>
        <p className="cp-duel-score">{result.score}</p>
        <p className="cp-duel-muted">
          {result.total} soruda {result.correct} doğru · {result.rank}. sıradasın
        </p>
        <ol className="cp-duel-review">
          {questions.map((question, i) => {
            const mine = answers[i]?.choice;
            const right = result.answers[i];
            return (
              <li key={i} className={cn(mine === right ? "is-right" : "is-wrong")}>
                <span>{question.text}</span>
                <em>
                  {mine == null ? "Süre doldu" : `Senin: ${LETTERS[mine]}`} · Doğru: {LETTERS[right]}{" "}
                  {question.options[right]}
                </em>
              </li>
            );
          })}
        </ol>
        <Leaderboard rows={result.leaderboard} />
        <div className="cp-duel-actions">
          <button type="button" className="cp-duel-secondary" onClick={() => void copyLink()}>
            <Copy className="h-4 w-4" aria-hidden /> Bağlantıyı kopyala
          </button>
          <button type="button" className="cp-duel-primary" onClick={start}>
            Tekrar oyna
          </button>
        </div>
        {signedIn ? null : (
          <p className="cp-duel-muted">
            Kendi düellonu kurmak için{" "}
            <Link href="/kayit" className="underline">
              Cortex Plus&apos;a katıl
            </Link>
            .
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="cp-duel-card">
      <span className="cp-duel-icon" aria-hidden>
        <Swords className="h-8 w-8" />
      </span>
      <p className="cp-duel-kicker">{creatorName} seni düelloya çağırıyor</p>
      <h1 className="cp-duel-title">{title}</h1>
      {topic ? <p className="cp-duel-muted">{topic}</p> : null}
      <ol className="cp-duel-rules">
        {duelRules(questions.length).map((rule, i) => (
          <li key={rule}>
            <b>{i + 1}</b>
            {rule}
          </li>
        ))}
      </ol>
      {signedIn ? null : (
        <label className="cp-duel-name">
          <span>Sıralamada görünecek adın</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder="Adın"
            autoComplete="nickname"
          />
        </label>
      )}
      <button type="button" className="cp-duel-primary" onClick={start}>
        Düelloya başla
      </button>
      {initialBoard.length ? <Leaderboard rows={initialBoard} /> : null}
      <button type="button" className="cp-duel-secondary" onClick={() => void copyLink()}>
        <Copy className="h-4 w-4" aria-hidden /> Bağlantıyı kopyala
      </button>
    </section>
  );
}

function Leaderboard({ rows }: { rows: BoardRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="cp-duel-board">
      <p className="cp-duel-kicker">Sıralama</p>
      <ol>
        {rows.map((row, i) => (
          <li key={`${row.name}-${i}`}>
            <b>{i + 1}</b>
            <span>{row.name}</span>
            <em>{row.correct} doğru</em>
            <strong>{row.score}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}
