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
import { playPlusTone } from "@/lib/learning/studio-sound";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { cn } from "@/lib/utils";

type Question = { id: string; text: string; options: string[]; correct: string };

const LETTERS = ["A", "B", "C", "D", "E"];

export function QuizStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "reveal" | "results">(
    "entry",
  );
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [paywall, setPaywall] = useState(false);
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  const question = questions[index];

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{ title?: string; questions?: Question[] }>(
      "/api/learning/quiz/generate",
      { topic, count: 6 },
    );
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.questions?.length) {
      toast.error(result.ok ? "Quiz üretilemedi." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setTitle(result.data.title ?? topic);
    setQuestions(result.data.questions);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setPhase("play");
  }

  function choose(option: string) {
    if (phase !== "play" || !question) return;
    setPicked(option);
    const ok = option === question.correct;
    if (ok) setScore((n) => n + 1);
    if (isPlus) playPlusTone(ok ? "correct" : "wrong");
    setPhase("reveal");
  }

  function next() {
    if (index + 1 >= questions.length) {
      setPhase("results");
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
    setPhase("play");
  }

  function resetPlay() {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setPhase("play");
  }

  return (
    <StudioFrame tool="quiz" kicker="Quiz stüdyosu">
      {phase === "entry" ? (
        <StudioEntry
          tool="quiz"
          title="Bir sahne, altı soru."
          placeholder="Örn. Üslü sayılar"
          submitLabel="Sahneyi aç"
          creditCost={creditCost}
          loading={false}
          initialTopic={initialTopic}
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Sorular ısınıyor" lead="Sahne kuruluyor, şıklar hizalanıyor." />
      ) : null}

      {(phase === "play" || phase === "reveal") && question ? (
        <>
          <StudioProgress index={index} total={questions.length} />
          <p className="ls-credit" style={{ marginBottom: "0.75rem" }}>
            {title}
          </p>
          <div className="ls-stage ls-stage--quiz">
          <h2 className="ls-question">{question.text}</h2>
          <div className="ls-options">
            {question.options.map((option, i) => {
              const selected = picked === option;
              const correct = option === question.correct;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={phase === "reveal"}
                  className={cn(
                    "ls-option",
                    selected && phase === "play" && "is-selected",
                    phase === "reveal" && correct && "is-correct",
                    phase === "reveal" && selected && !correct && "is-wrong",
                  )}
                  onClick={() => choose(option)}
                >
                  <span className="ls-letter">{LETTERS[i] ?? i + 1}</span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
          </div>
          {phase === "reveal" ? (
            <div className="ls-actions">
              <button type="button" className="ls-cta" onClick={next}>
                {index + 1 >= questions.length ? "Sonucu gör" : "Sonraki soru"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="quiz"
          topic={topic}
          scoreLabel={`${score}/${questions.length}`}
          title={score === questions.length ? "Kusursuz tur." : "Tur bitti."}
          lead={
            score === questions.length
              ? "Hepsi yerinde. Bu konuyu artık sahiplendin."
              : `${questions.length - score} soruda takıldın. Tekrar et, altın çizgiyi koru.`
          }
          onAgain={resetPlay}
          onNew={() => setPhase("entry")}
        />
      ) : null}

      <StudioPaywall open={paywall} onOpenChange={setPaywall} returnPath="/studio/quiz" />
    </StudioFrame>
  );
}
