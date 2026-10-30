"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, Copy, Swords, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DUEL_SECONDS,
  duelRules,
  type DuelAnswer,
  type DuelPublicQuestion,
} from "@/lib/learning/duel";
import {
  BOT_LEVEL_IDS,
  BOT_LEVELS,
  botComboUntil,
  botScoreUntil,
  headToHead,
  type BotLevel,
  type BotStep,
} from "@/lib/learning/duel-bot";

/** Oyundan önceki geri sayım (sn). */
export const DUEL_COUNTDOWN_SECONDS = 3;

type BoardRow = { name: string; score: number; correct: number };

type RunResult = {
  correct: number;
  score: number;
  total: number;
  answers: number[];
  rank: number;
  leaderboard: BoardRow[];
};

/** Sunucudan gelen bot turu: cevap yok, soru başına süre ve doğru/yanlış. */
type BotTimeline = { level: BotLevel; name: string; steps: BotStep[]; correct: number; score: number; total: number };

const LETTERS = ["A", "B", "C", "D", "E"];

/**
 * Düello oyunu — Astra'nın kurallarıyla (bkz. `@/lib/learning/duel`).
 * Doğru cevaplar istemcide yok; tur bitince sunucu puanlayıp gösteriyor.
 *
 * Bot rakip (29 Ekim 2026): arkadaş beklemeden "AI derece öğrencisiyle" kapışılır. Botun turu
 * sunucuda hazır gelir; oyun sırasında üst çubukta botun o soruya kaç saniyede cevap verdiği ve
 * serisi akar, sonunda kafa kafaya tablo. Bot sıralamaya yazılmaz.
 */
export function DuelPlay({
  code,
  title,
  topic,
  creatorName,
  questions,
  initialBoard,
  signedIn,
  initialBot = null,
  countdownSeconds = DUEL_COUNTDOWN_SECONDS,
}: {
  code: string;
  title: string;
  topic: string | null;
  creatorName: string;
  questions: DuelPublicQuestion[];
  initialBoard: BoardRow[];
  signedIn: boolean;
  /** Hazırlıktan "AI rakiple hemen başla" ile gelince bu düzey seçili açılır. */
  initialBot?: BotLevel | null;
  /** Oyun öncesi geri sayım (sn); 0 doğrudan başlatır. */
  countdownSeconds?: number;
}) {
  const [stage, setStage] = useState<"intro" | "countdown" | "play" | "sending" | "result">("intro");
  /** Oyun öncesi 3-2-1 (30 Ekim 2026, canlı tur): sorular gelince 1. sorunun süresi hemen başlıyor, öğrenci kaçırıyordu. */
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [name, setName] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DuelAnswer[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [level, setLevel] = useState<BotLevel>(initialBot ?? "derece");
  const [bot, setBot] = useState<BotTimeline | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const startedAt = useRef(0);
  const answered = useRef(false);
  const autoBot = useRef(false);

  const limitMs = DUEL_SECONDS * 1000;
  const shareUrl =
    typeof window === "undefined" ? `/duello/${code}` : `${window.location.origin}/duello/${code}`;

  // Oyun öncesi geri sayım: her saniye bir azalır, bitince ilk soru ve süresi başlar.
  useEffect(() => {
    if (stage !== "countdown") return;
    if (countdownSeconds <= 0) {
      setStage("play");
      return;
    }
    setCountdown(countdownSeconds);
    let left = countdownSeconds;
    const timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        setStage("play");
      } else {
        setCountdown(left);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, countdownSeconds]);

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

  // Hazırlıktan bot düzeyiyle gelen oturumlu öğrenci beklemeden başlar.
  useEffect(() => {
    if (!initialBot || !signedIn || autoBot.current) return;
    autoBot.current = true;
    void startWithBot(initialBot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function nameMissing(): boolean {
    if (!signedIn && name.trim().length < 2) {
      toast.error("Sıralamada görünecek adını yaz.");
      return true;
    }
    return false;
  }

  function start() {
    if (nameMissing()) return;
    setBot(null);
    setAnswers([]);
    setIndex(0);
    setResult(null);
    setStage("countdown");
  }

  /** Bot turu sunucudan alınır, sonra oyun başlar. Her başlatma yeni bir bot (tohum sunucuda). */
  async function startWithBot(chosen: BotLevel) {
    if (nameMissing()) return;
    setLevel(chosen);
    setBotLoading(true);
    try {
      const res = await fetch(`/api/duels/${code}/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: chosen }),
      });
      const data = (await res.json().catch(() => ({}))) as BotTimeline & { error?: string };
      if (!res.ok || !Array.isArray(data.steps)) throw new Error(data?.error ?? "Bot rakip hazırlanamadı.");
      setBot(data);
      setAnswers([]);
      setIndex(0);
      setResult(null);
      setStage("countdown");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bot rakip hazırlanamadı.");
    } finally {
      setBotLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Bağlantı kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı; adres çubuğundan paylaşabilirsin.");
    }
  }

  if (stage === "countdown") {
    return (
      <section className="cp-duel-card" aria-live="assertive">
        <p className="cp-duel-countdown-kicker">{bot ? `${bot.name} hazır` : "Hazır ol"}</p>
        <p className="cp-duel-countdown" aria-label={`İlk soru ${countdown} saniye sonra`}>
          {countdown}
        </p>
        <p className="cp-duel-countdown-note">İlk soru birazdan geliyor.</p>
      </section>
    );
  }

  if (stage === "play" || stage === "sending") {
    const question = questions[Math.min(index, questions.length - 1)];
    const left = Math.max(0, Math.ceil((limitMs - elapsed) / 1000));
    const isLast = index === questions.length - 1;
    const botScore = bot ? botScoreUntil(bot.steps, index, elapsed) : 0;
    const botCombo = bot ? botComboUntil(bot.steps, index, elapsed) : 0;
    const botStep = bot?.steps[index];
    const botDone = Boolean(botStep && botStep.ms <= elapsed);
    return (
      <section className="cp-duel-card" aria-live="polite">
        {bot ? (
          <div className="cp-duel-bot" data-bot-level={bot.level}>
            <span className="cp-duel-bot-name">
              <Bot className="h-4 w-4" aria-hidden /> {bot.name}
            </span>
            <span className="cp-duel-bot-score" aria-label={`${bot.name} puanı ${botScore}`}>
              {botScore} puan
            </span>
            {botCombo >= 2 ? <span className="cp-duel-bot-combo">🔥 x{botCombo}</span> : null}
            <ol className="cp-duel-bot-track" aria-label="Botun ilerleyişi">
              {bot.steps.map((step, i) => {
                const state = i < index || (i === index && botDone) ? (step.correct ? "right" : "wrong") : i === index ? "live" : "wait";
                return <li key={i} className={`is-${state}`} aria-hidden />;
              })}
            </ol>
            <span className="cp-duel-bot-status">
              {botDone && botStep
                ? `${botStep.correct ? "✓ bildi" : "✗ yanıldı"} · ${(botStep.ms / 1000).toFixed(1)} sn`
                : "düşünüyor…"}
            </span>
          </div>
        ) : null}
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
    const versus = bot ? headToHead({ studentScore: result.score, studentAnswers: answers, correctIndexes: result.answers, bot }) : null;
    return (
      <section className="cp-duel-card">
        {versus ? <p className="cp-duel-kicker">{versus.headline}</p> : <p className="cp-duel-kicker">Puanın</p>}
        <p className="cp-duel-score">{result.score}</p>
        <p className="cp-duel-muted">
          {result.total} soruda {result.correct} doğru · {result.rank}. sıradasın
        </p>
        {versus && bot ? (
          <div className="cp-duel-versus" data-winner={versus.winner}>
            <div className="cp-duel-versus-head">
              <span>
                <b>Sen</b>
                <strong>{result.score}</strong>
                <em>
                  {result.correct} doğru{versus.studentAvgMs != null ? ` · ort. ${(versus.studentAvgMs / 1000).toFixed(1)} sn` : ""}
                </em>
              </span>
              <span className="cp-duel-versus-vs" aria-hidden>
                vs
              </span>
              <span>
                <b>{bot.name}</b>
                <strong>{bot.score}</strong>
                <em>
                  {bot.correct} doğru · ort. {(versus.botAvgMs / 1000).toFixed(1)} sn
                </em>
              </span>
            </div>
            <ol className="cp-duel-versus-rows">
              {versus.rows.map((row) => (
                <li key={row.question}>
                  <b>{row.question}</b>
                  <span className={`is-${row.student}`}>{row.student === "right" ? "✓" : row.student === "wrong" ? "✗" : "—"}</span>
                  <span className={`is-${row.bot}`}>{row.bot === "right" ? "✓" : "✗"}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
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
          {bot ? (
            <button type="button" className="cp-duel-primary" disabled={botLoading} onClick={() => void startWithBot(level)}>
              <Bot className="h-4 w-4" aria-hidden /> {botLoading ? "Bot hazırlanıyor…" : "Botla yeniden"}
            </button>
          ) : (
            <button type="button" className="cp-duel-primary" onClick={start}>
              Tekrar oyna
            </button>
          )}
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
      <div className="cp-duel-bot-pick" role="group" aria-labelledby="cp-duel-bot-title">
        <p id="cp-duel-bot-title" className="cp-duel-kicker">
          🤖 Hemen şimdi AI rakiple kapış
        </p>
        <div className="cp-duel-bot-levels" role="radiogroup" aria-label="Zorluk">
          {BOT_LEVEL_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={level === id}
              className={cn("cp-duel-bot-level", level === id && "is-on")}
              onClick={() => setLevel(id)}
            >
              {BOT_LEVELS[id].label}
            </button>
          ))}
        </div>
        <button type="button" className="cp-duel-secondary" disabled={botLoading} onClick={() => void startWithBot(level)}>
          <Bot className="h-4 w-4" aria-hidden /> {botLoading ? "Bot hazırlanıyor…" : `${BOT_LEVELS[level].name} ile başla`}
        </button>
      </div>
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
