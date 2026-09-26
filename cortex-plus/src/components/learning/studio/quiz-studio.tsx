"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
  StudioProgress,
} from "@/components/learning/studio/studio-shared";
import { playPlusTone } from "@/lib/learning/studio-sound";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  text: string;
  options: string[];
  correct: string;
  explanation?: string | null;
};

const LETTERS = ["A", "B", "C", "D", "E"];
const DIFFICULTIES = [
  { id: "easy", label: "Kolay" },
  { id: "medium", label: "Orta" },
  { id: "hard", label: "Zor" },
  { id: "mixed", label: "Karışık" },
] as const;

type DiffId = (typeof DIFFICULTIES)[number]["id"];

export type QuizDocumentOption = { id: string; fileName: string };

export function QuizStudio({
  creditCost,
  initialTopic = "",
  documents = [],
  initialDocumentId = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  /** Hazır (parse edilmiş) belgeler — "Belgem" kaynağı için. */
  documents?: QuizDocumentOption[];
  initialDocumentId?: string | null;
}) {
  const [phase, setPhase] = useState<
    "entry" | "loading" | "play" | "reveal" | "results"
  >("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [blank, setBlank] = useState(0);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [count, setCount] = useState(6);
  const [difficulty, setDifficulty] = useState<DiffId>("medium");
  const [sourceMode, setSourceMode] = useState<"topic" | "document">(
    initialDocumentId ? "document" : "topic",
  );
  const [documentId, setDocumentId] = useState<string | null>(
    initialDocumentId ?? documents[0]?.id ?? null,
  );
  const [mistakesRecorded, setMistakesRecorded] = useState(0);
  const [paywall, setPaywall] = useState(false);
  const [grading, setGrading] = useState(false);
  const isPlus = Boolean(useStudentShellAccount()?.isPremium);

  const question = questions[index];
  const activeDocument =
    sourceMode === "document"
      ? documents.find((d) => d.id === documentId) ?? null
      : null;

  async function start(nextTopic: string) {
    if (sourceMode === "document" && !activeDocument) {
      toast.error("Önce bir belge seç.");
      return;
    }
    setPhase("loading");
    const result = await postStudio<{
      quizId?: string;
      title?: string;
      questions?: Question[];
    }>("/api/learning/quiz/generate", {
      topic: nextTopic,
      count,
      difficulty,
      ...(activeDocument ? { documentId: activeDocument.id } : {}),
    });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.questions?.length) {
      const friendly =
        !result.ok && result.error === "document_not_ready"
          ? "Belge henüz hazır değil ya da içi boş. Kredin düşmedi."
          : "Quiz üretilemedi. Kredin düşmedi.";
      toast.error(friendly);
      setPhase("entry");
      return;
    }
    setTopic(nextTopic);
    setTitle(result.data.title ?? nextTopic);
    setQuizId(result.data.quizId ?? null);
    setQuestions(result.data.questions);
    setIndex(0);
    setPicked(null);
    setAnswers({});
    setScore(0);
    setIncorrect(0);
    setBlank(0);
    setWeakTopics([]);
    setMistakesRecorded(0);
    setPhase("play");
  }

  function choose(option: string) {
    if (phase !== "play" || !question) return;
    setPicked(option);
    setAnswers((prev) => ({ ...prev, [question.id]: option }));
    const ok = option === question.correct;
    if (ok) setScore((n) => n + 1);
    if (isPlus) playPlusTone(ok ? "correct" : "wrong");
    setPhase("reveal");
  }

  async function finish() {
    setGrading(true);
    try {
      if (quizId) {
        const res = await fetch("/api/learning/quiz/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quizId,
            topic,
            answers: Object.entries(answers).map(([questionId, selected]) => ({
              questionId,
              selected,
            })),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            score: number;
            correct: number;
            incorrect: number;
            blank: number;
            weakTopics?: string[];
            mistakesRecorded?: number;
          };
          setScore(data.correct);
          setIncorrect(data.incorrect);
          setBlank(data.blank);
          setWeakTopics(data.weakTopics ?? []);
          setMistakesRecorded(data.mistakesRecorded ?? 0);
        } else {
          // Client fallback stats if grade API fails.
          setIncorrect(questions.length - score);
        }
      } else {
        setIncorrect(questions.length - score);
      }
    } finally {
      setGrading(false);
      setPhase("results");
    }
  }

  function next() {
    if (index + 1 >= questions.length) {
      void finish();
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
    setPhase("play");
  }

  function resetPlay() {
    setIndex(0);
    setPicked(null);
    setAnswers({});
    setScore(0);
    setPhase("play");
  }

  return (
    <StudioFrame tool="quiz" kicker="Quiz">
      {phase === "entry" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                sourceMode === "topic"
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
                  : "border-white/15 text-[var(--cs-muted)]",
              )}
              onClick={() => setSourceMode("topic")}
            >
              Konu
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                sourceMode === "document"
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
                  : "border-white/15 text-[var(--cs-muted)]",
              )}
              onClick={() => setSourceMode("document")}
            >
              Belgem
            </button>
          </div>
          {sourceMode === "document" ? (
            documents.length ? (
              <div className="space-y-1">
                <label
                  htmlFor="quiz-document"
                  className="text-xs font-semibold uppercase tracking-wide text-[var(--cs-muted)]"
                >
                  Belge
                </label>
                <select
                  id="quiz-document"
                  value={documentId ?? ""}
                  onChange={(e) => setDocumentId(e.target.value || null)}
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--cs-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fileName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--cs-muted)]">
                  Sorular yalnızca bu belgeden üretilir. Aşağıya belgenin hangi
                  bölümüne odaklanmak istediğini yaz.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--cs-muted)]">
                Henüz hazır bir belgen yok.{" "}
                <Link href="/dokumanlar" className="underline">
                  Belge yükle
                </Link>
                ; işlenince burada seçebilirsin.
              </p>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            {[4, 6, 8, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  count === n
                    ? "border-amber-500/50 bg-amber-500/15"
                    : "border-white/15 text-[var(--cs-muted)]",
                )}
              >
                {n} soru
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  difficulty === d.id
                    ? "border-amber-500/50 bg-amber-500/15"
                    : "border-white/15 text-[var(--cs-muted)]",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <StudioEntry
            tool="quiz"
            title="Quiz oluştur"
            placeholder={
              sourceMode === "document"
                ? "Örn. 3. bölüm — fonksiyonlar"
                : "Örn. Fonksiyonlar"
            }
            submitLabel={
              sourceMode === "document" ? "Belgeden quiz başlat" : "Quiz başlat"
            }
            creditCost={creditCost}
            initialTopic={initialTopic}
            onSubmit={(nextTopic) => void start(nextTopic)}
          />
        </div>
      ) : null}

      {phase === "loading" ? (
        <StudioLoading
          title="Sorular hazırlanıyor"
          lead="Kaynağına uygun sorular yazılıyor."
        />
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
            <div className="ls-actions space-y-2">
              {picked !== question.correct ? (
                <p className="text-sm text-red-300" role="status">
                  Yanlış. Doğru: {question.correct}
                </p>
              ) : (
                <p className="text-sm text-emerald-300" role="status">
                  Doğru.
                </p>
              )}
              {question.explanation ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cs-muted)]">
                    Neden?
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--cs-text)]">
                    {question.explanation}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                className="ls-cta"
                onClick={next}
                disabled={grading}
              >
                {index + 1 >= questions.length
                  ? grading
                    ? "Kaydediliyor…"
                    : "Sonucu gör"
                  : "Sonraki soru"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "results" ? (
        <div className="ls-results space-y-4">
          <p className="text-3xl font-semibold text-[var(--cs-text)]">
            %{questions.length ? Math.round((score / questions.length) * 100) : 0}
          </p>
          <p className="text-sm text-[var(--cs-muted)]">
            Doğru {score} · Yanlış {incorrect} · Boş {blank}
          </p>
          {weakTopics.length ? (
            <p className="text-sm text-[var(--cs-muted)]">
              Zayıf konular: {weakTopics.join(", ")}
            </p>
          ) : null}
          {mistakesRecorded > 0 ? (
            <p className="text-sm text-[var(--cs-muted)]">
              {mistakesRecorded} yanlış Yanlışlar Defteri&apos;ne yazıldı — üst
              üste iki doğru yapınca defterden çıkar.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {incorrect > 0 ? (
              <Link
                href="/yanlislarim"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                Yanlışlarımı tekrar et
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              >
                Çalışmaya devam et
              </Link>
            )}
            <button
              type="button"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-[var(--cs-text)]"
              onClick={resetPlay}
            >
              Tekrar çöz
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-[var(--cs-muted)]"
              onClick={() => setPhase("entry")}
            >
              Yeni quiz
            </button>
          </div>
        </div>
      ) : null}

      <StudioPaywall
        open={paywall}
        onOpenChange={setPaywall}
        returnPath="/studio/quiz"
      />
    </StudioFrame>
  );
}
