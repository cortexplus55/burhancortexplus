"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExamNodeCoach } from "@/components/parity/exam-node-coach";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";
import { CreditGate } from "@/components/paywall/credit-gate";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  DEFAULT_FAMILIARITY,
  DEFAULT_MOOD,
  FAMILIARITY_OPTIONS,
  MOOD_OPTIONS,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import { cn } from "@/lib/utils";

type Difficulty = "kolay" | "orta" | "ileri";

type Payload = {
  type?: string;
  title?: string;
  contentMd?: string;
  chapters?: { title: string; script: string }[];
  questions?: {
    text?: string;
    prompt?: string;
    options?: string[];
    multi?: boolean;
    correct?: string[];
    explanation?: string;
    hint?: string;
  }[];
  items?: { text: string; correct: boolean; explanation: string }[];
  cards?: { front: string; back: string }[];
};

export function ExamNodeSession({
  prepId,
  nodeId,
  kind,
  prepTitle,
  topicLabel,
  initialFamiliarity,
}: {
  prepId: string;
  nodeId: string;
  kind: PlanNodeKind;
  prepTitle: string;
  topicLabel: string | null;
  /** Konuya daha önce girildiyse beyan edilen aşinalık — varsayılan olarak gelir. */
  initialFamiliarity?: Familiarity | null;
}) {
  const router = useRouter();
  const meta = PLAN_NODE_META[kind];
  // Astra'daki sıra: aşinalık → ruh hali → kurulum. İkisi de zorunlu değil;
  // "setup"tan geri dönülebilsin diye aynı stage makinesinde tutuluyorlar.
  const [stage, setStage] = useState<
    "familiarity" | "mood" | "setup" | "play" | "result"
  >("familiarity");
  const [familiarity, setFamiliarity] = useState<Familiarity>(
    initialFamiliarity ?? DEFAULT_FAMILIARITY,
  );
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);
  const [difficulty, setDifficulty] = useState<Difficulty>("orta");
  const [voiceMode, setVoiceMode] = useState(meta.voice);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [payload, setPayload] = useState<Payload>({});
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ score: 0, total: 1 });
  const [nextHref, setNextHref] = useState(`/deneme-sinavlari/${prepId}`);
  const [feedback, setFeedback] = useState<{
    headline: string;
    note: string;
    gaps: string[];
    nextFocus: string[];
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [tfRevealed, setTfRevealed] = useState(false);

  const isTimedExam = kind === "written_exam";
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  useEffect(() => {
    if (stage !== "play" || !isTimedExam) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, isTimedExam]);

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "start",
          difficulty,
          voiceMode,
          familiarity,
          mood,
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Ders üretilemedi.");
        return;
      }
      setPayload(data.payload ?? {});
      setStage("play");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function finish(nextAnswers?: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "complete",
          answers: nextAnswers ?? answers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi.");
        return;
      }
      setScore({ score: data.score ?? 0, total: data.total ?? 1 });
      setNextHref(data.nextHref ?? `/deneme-sinavlari/${prepId}`);
      setFeedback(null);
      setStage("result");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function loadFeedback() {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Geri bildirim alınamadı.");
        return;
      }
      setFeedback(data.feedback ?? null);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  const questions = payload.questions ?? [];
  const items = payload.items ?? [];
  const cards = payload.cards ?? [];
  const chapters = payload.chapters ?? [];
  const coachItem =
    payload.type === "quiz"
      ? questions[index]?.text
      : payload.type === "true_false"
        ? items[index]?.text
        : payload.type === "cards"
          ? cards[index]?.front
          : payload.type === "oral"
            ? questions[index]?.prompt
            : payload.type === "lesson"
              ? payload.title
              : null;
  const showCoach =
    stage === "play" &&
    Boolean(coachItem) &&
    payload.type !== "voice" &&
    payload.type !== "podcast";

  return (
    <div className="ap-exam-page ap-exam-node">
      <div className="ap-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
          ← Geri
        </Link>
        {stage === "play" && isTimedExam ? (
          <span className={cn("ap-exam-timer", timeLeft < 120 && "ap-exam-timer--urgent")}>
            ⏱ {formatTimer(timeLeft)}
          </span>
        ) : null}
        <button type="button" className="ap-back-pill" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
          ×
        </button>
      </div>

      {stage === "familiarity" || stage === "mood" ? (
        <article className="ap-signal-card">
          <div className="ap-signal-steps" aria-hidden>
            <span className="ap-signal-step ap-signal-step--on" />
            <span
              className={cn(
                "ap-signal-step",
                stage === "mood" && "ap-signal-step--on",
              )}
            />
          </div>
          {stage === "familiarity" ? (
            <>
              <h1>Bu konuya ne kadar aşinasın?</h1>
              <p className="ap-signal-lead">
                Doğru zorluk seviyesini belirlememize yardımcı olur.
              </p>
              {FAMILIARITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="ap-signal-option"
                  aria-pressed={familiarity === option.id}
                  onClick={() => {
                    setFamiliarity(option.id);
                    setStage("mood");
                  }}
                >
                  <span className="ap-signal-emoji" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="ap-signal-title">{option.title}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <h1>Bugün ruh halin nasıl?</h1>
              <p className="ap-signal-lead">
                Anlatım tonunu buna göre ayarlayacağım.
              </p>
              {MOOD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="ap-signal-option"
                  aria-pressed={mood === option.id}
                  onClick={() => {
                    setMood(option.id);
                    setStage("setup");
                  }}
                >
                  <span className="ap-signal-emoji" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="ap-signal-title">{option.title}</span>
                </button>
              ))}
            </>
          )}
        </article>
      ) : null}

      {stage === "setup" ? (
        <article className="ap-exam-setup-card">
          <p className="ap-lesson-kicker">{prepTitle}</p>
          <h1>{meta.setupLabel}</h1>
          {topicLabel ? <p className="text-sm text-[var(--ap-muted)]">{topicLabel}</p> : null}
          <label className="ap-field">
            <span>Zorluk seviyesi belirle</span>
            <strong className="ap-exam-diff-label">
              {difficulty === "kolay" ? "Kolay" : difficulty === "ileri" ? "İleri" : "Orta"}
            </strong>
            <input
              type="range"
              min={0}
              max={2}
              value={difficulty === "kolay" ? 0 : difficulty === "ileri" ? 2 : 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDifficulty(value === 0 ? "kolay" : value === 2 ? "ileri" : "orta");
              }}
            />
          </label>
          {meta.voice ? (
            <label className="ap-exam-voice-row">
              <span>
                Sesli mod
                <em>Yazmak yerine konuş</em>
              </span>
              <input
                type="checkbox"
                checked={voiceMode}
                onChange={(event) => setVoiceMode(event.target.checked)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            disabled={loading}
            onClick={() => void start()}
          >
            {loading ? "Hazırlanıyor…" : "Ders oluştur"}
          </button>
        </article>
      ) : null}

      {stage === "play" && payload.type === "voice" ? (
        <ExamVoiceTutor
          prepId={prepId}
          nodeId={nodeId}
          kind={kind === "oral" ? "oral" : "qa"}
          topicLabel={topicLabel ?? prepTitle}
          difficulty={difficulty}
          returnPath={`/deneme-sinavlari/${prepId}`}
          onFinish={(turns) => {
            void finish({ "0": turns > 0 ? "sesli yanıt" : "" });
          }}
        />
      ) : null}

      {stage === "play" && payload.type === "lesson" ? (
        <section>
          <h1>{payload.title}</h1>
          <ExamLessonBody content={payload.contentMd ?? ""} />
          <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={() => void finish()}>
            Bitir
          </button>
        </section>
      ) : null}

      {stage === "play" && payload.type === "podcast" ? (
        <ExamPodcastPlayer
          title={payload.title ?? "Podcast"}
          chapters={chapters}
          finishing={loading}
          onFinish={() => void finish()}
        />
      ) : null}

      {stage === "play" && payload.type === "quiz" && questions[index] ? (
        <ExamQuizPlay
          questions={questions.map((question) => ({
            text: question.text ?? "",
            options: question.options ?? [],
            multi: Boolean(question.multi),
            correct: question.correct,
            explanation: question.explanation,
          }))}
          index={index}
          value={answers[String(index)]}
          onChange={(value) =>
            setAnswers((prev) => ({ ...prev, [String(index)]: value }))
          }
          onContinue={() => {
            if (index + 1 < questions.length) setIndex(index + 1);
            else void finish();
          }}
          continueLabel={index + 1 < questions.length ? "İleri" : "Bitir"}
          disabled={loading}
        />
      ) : null}

      {stage === "play" && payload.type === "true_false" && items[index] ? (
        <section>
          <p className="ap-lesson-kicker">
            {index + 1}/{items.length}
          </p>
          <h1>{items[index].text}</h1>
          <div className="flex gap-2">
            {([true, false] as const).map((value) => {
              const isSelected = answers[String(index)] === value;
              const isItemCorrect = items[index].correct === value;
              const showGreen = tfRevealed && isItemCorrect;
              const showRed = tfRevealed && isSelected && !isItemCorrect;

              return (
                <button
                  key={String(value)}
                  type="button"
                  disabled={tfRevealed}
                  className={cn(
                    "ap-exam-continue",
                    isSelected && "ap-exam-continue--primary",
                    showGreen && "border-emerald-500 bg-emerald-500/20 text-emerald-300",
                    showRed && "border-rose-500 bg-rose-500/20 text-rose-300",
                  )}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [String(index)]: value }));
                    setTfRevealed(true);
                  }}
                >
                  {value ? "Doğru" : "Yanlış"}
                </button>
              );
            })}
          </div>

          {tfRevealed ? (
            <div className="ap-exam-quiz-feedback">
              <div
                className={cn(
                  "ap-exam-quiz-verdict",
                  answers[String(index)] === items[index].correct
                    ? "ap-exam-quiz-verdict--ok"
                    : "ap-exam-quiz-verdict--bad",
                )}
              >
                {answers[String(index)] === items[index].correct ? "✓ Doğru!" : "✕ Yanlış"}
              </div>
              {items[index].explanation ? (
                <p className="ap-exam-quiz-explain">{items[index].explanation}</p>
              ) : null}
              <button
                type="button"
                className="ap-exam-continue ap-exam-continue--primary mt-2"
                onClick={() => {
                  setTfRevealed(false);
                  if (index + 1 < items.length) setIndex(index + 1);
                  else void finish();
                }}
              >
                {index + 1 < items.length ? "Sonraki soru" : "Bitir"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {stage === "play" && payload.type === "cards" && cards[index] ? (
        <section className="ap-exam-card-stage">
          <p className="ap-lesson-kicker">
            {index + 1}/{cards.length}
          </p>
          <button type="button" className="ap-exam-flash" onClick={() => setFlipped((value) => !value)}>
            {flipped ? cards[index].back : cards[index].front}
          </button>
          <p className="text-sm text-[var(--ap-muted)]">Kartı çevirmek için tıkla</p>
          <p>Cevabı biliyor musun?</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ap-exam-continue"
              onClick={() => {
                setAnswers((prev) => ({ ...prev, [String(index)]: false }));
                setFlipped(false);
                if (index + 1 < cards.length) setIndex(index + 1);
                else void finish();
              }}
            >
              Hayır
            </button>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              onClick={() => {
                setAnswers((prev) => ({ ...prev, [String(index)]: true }));
                setFlipped(false);
                if (index + 1 < cards.length) setIndex(index + 1);
                else void finish();
              }}
            >
              Evet
            </button>
          </div>
        </section>
      ) : null}

      {stage === "play" && payload.type === "oral" && questions[index] ? (
        <section>
          <p className="ap-lesson-kicker">
            {index + 1}/{questions.length}
          </p>
          <h1>{questions[index].prompt}</h1>
          {questions[index].hint ? (
            <p className="text-sm text-[var(--ap-muted)]">İpucu: {questions[index].hint}</p>
          ) : null}
          <textarea
            className="ap-exam-oral-input"
            rows={4}
            placeholder={voiceMode ? "Konuşarak veya yazarak yanıtla" : "Yanıtın"}
            value={String(answers[String(index)] ?? "")}
            onChange={(event) =>
              setAnswers((prev) => ({ ...prev, [String(index)]: event.target.value }))
            }
          />
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            onClick={() => {
              if (index + 1 < questions.length) setIndex(index + 1);
              else void finish();
            }}
          >
            {index + 1 < questions.length ? "Sonraki soru" : "Bitir"}
          </button>
        </section>
      ) : null}

      {stage === "result" ? (
        <section className="ap-exam-node-result">
          <p className="ap-lesson-kicker">Doğru cevaplar</p>
          <p className="ap-exam-score-xl">
            {score.score}/{score.total}
          </p>
          <p>{score.total && score.score / score.total >= 0.7 ? "Güzel gidiyor" : "Biraz daha gelişebilirsin"}</p>
          <p className="text-sm text-[var(--ap-muted)]">
            Doğruluk {Math.round((score.score / Math.max(1, score.total)) * 100)}%
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ap-exam-continue" onClick={() => {
              setStage("setup");
              setIndex(0);
              setAnswers({});
              setFeedback(null);
            }}>
              Dersi tekrarla
            </button>
            <button
              type="button"
              className="ap-exam-continue"
              disabled={feedbackLoading}
              onClick={() => void loadFeedback()}
            >
              {feedbackLoading ? "Yazıyor…" : "Eğitmeninden geri bildirim"}
            </button>
          </div>
          {feedback ? (
            <article className="ap-exam-debrief">
              <p className="ap-lesson-kicker">Eğitmen notu</p>
              <h2>{feedback.headline}</h2>
              <p>{feedback.note}</p>
              {feedback.gaps.length ? (
                <>
                  <p className="ap-exam-debrief-label">Zayıf noktalar</p>
                  <ul>
                    {feedback.gaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {feedback.nextFocus.length ? (
                <>
                  <p className="ap-exam-debrief-label">Bundan sonra</p>
                  <ul>
                    {feedback.nextFocus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ) : null}
          <Link href={nextHref} className="ap-exam-continue ap-exam-continue--primary">
            Devam et
          </Link>
        </section>
      ) : null}

      {showCoach && coachItem ? (
        <ExamNodeCoach
          key={`${payload.type}-${index}`}
          prepId={prepId}
          nodeId={nodeId}
          itemText={coachItem}
          returnPath={`/deneme-sinavlari/${prepId}`}
        />
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu ders için kredin kalmadı."
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
