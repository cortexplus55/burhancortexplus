"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
  StudioProgress,
  StudioResults,
} from "@/components/learning/studio/studio-shared";
import { cn } from "@/lib/utils";

type Question = { id: string; text: string; options: string[]; points?: number };

const LETTERS = ["A", "B", "C", "D", "E"];

export function WrittenStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "grading" | "results">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [examId, setExamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [paywall, setPaywall] = useState(false);

  const question = questions[index];

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{
      examId?: string;
      title?: string;
      questions?: Question[];
    }>("/api/learning/exam/generate", {
      topic,
      questionCount: 8,
      difficulty: "medium",
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.questions?.length || !result.data.examId) {
      toast.error(result.ok ? "Yazılı üretilemedi." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setExamId(result.data.examId);
    setTitle(result.data.title ?? topic);
    setQuestions(result.data.questions);
    setIndex(0);
    setAnswers({});
    setScore(null);
    setPhase("play");
  }

  function choose(option: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: option }));
  }

  async function finish() {
    if (!examId) return;
    setPhase("grading");
    const result = await postStudio<{ score?: number; analysis?: string }>(
      "/api/learning/exam/grade",
      { examId, answers },
    );
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("play");
      return;
    }
    if (!result.ok) {
      toast.error(result.error);
      setPhase("play");
      return;
    }
    setScore(result.data.score ?? 0);
    setAnalysis(result.data.analysis ?? "Kağıdın değerlendirildi.");
    setPhase("results");
  }

  return (
    <StudioFrame tool="yazili" kicker="Yazılı deneme">
      {phase === "entry" ? (
        <StudioEntry
          tool="yazili"
          title="Kağıt önünde."
          placeholder="Örn. Fonksiyonlar"
          submitLabel="Yazılıyı aç"
          creditCost={creditCost}
          initialTopic={initialTopic}
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Kağıt basılıyor" lead="Sorular diziliyor, süre sahneye giriyor." />
      ) : null}

      {phase === "play" && question ? (
        <>
          <StudioProgress index={index} total={questions.length} />
          <div className="ls-paper">
            <p className="ls-flash-kicker">{title}</p>
            <h2 className="ls-question" style={{ marginBottom: "1rem" }}>
              {question.text}
            </h2>
            <div className="ls-options">
              {question.options.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "ls-option",
                    answers[question.id] === option && "is-selected",
                  )}
                  onClick={() => choose(option)}
                >
                  <span className="ls-letter">{LETTERS[i] ?? i + 1}</span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ls-actions">
            <button
              type="button"
              className="ls-ghost"
              disabled={index === 0}
              onClick={() => setIndex((n) => Math.max(0, n - 1))}
            >
              Önceki
            </button>
            {index + 1 < questions.length ? (
              <button
                type="button"
                className="ls-cta"
                disabled={!answers[question.id]}
                onClick={() => setIndex((n) => n + 1)}
              >
                Sonraki soru
              </button>
            ) : (
              <button
                type="button"
                className="ls-cta"
                disabled={Object.keys(answers).length !== questions.length}
                onClick={() => void finish()}
              >
                Kağıdı teslim et
              </button>
            )}
          </div>
        </>
      ) : null}

      {phase === "grading" ? (
        <StudioLoading title="Okunuyor" lead="Cevapların işaretlendi, analiz yazılıyor." />
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="yazili"
          topic={topic}
          scoreLabel={score != null ? `${score}` : undefined}
          title="Yazılı bitti."
          lead={analysis}
          onAgain={() => {
            setIndex(0);
            setAnswers({});
            setPhase("play");
          }}
          onNew={() => setPhase("entry")}
        />
      ) : null}

      <StudioPaywall open={paywall} onOpenChange={setPaywall} returnPath="/studio/yazili" />
    </StudioFrame>
  );
}
