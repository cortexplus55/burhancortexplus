"use client";

import { useState } from "react";
import Link from "next/link";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { scoreQuizAnswers, type PublicQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { PREP_HOME_COPY } from "@/lib/learning/exam-wizard-copy";

export function ChallengeSetPlay({ prepId }: { prepId: string }) {
  const [questions, setQuestions] = useState<PublicQuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [done, setDone] = useState(false);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/learning/exam-prep/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? "Zor sorular şu an hazırlanamadı.");
        return;
      }
      const next = Array.isArray(payload.questions) ? (payload.questions as PublicQuizQuestion[]) : [];
      if (!next.length) {
        setError("Kaynağa bağlı soru çıkmadı.");
        return;
      }
      setQuestions(next);
      setIndex(0);
      setAnswers({});
      setDone(false);
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  if (!questions) {
    return (
      <section className="cp-exam-page">
        <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
          ← Geri
        </Link>
        <h1>{PREP_HOME_COPY.challenge}</h1>
        <p className="text-sm text-[var(--cp-muted)]">{PREP_HOME_COPY.challengeLead}</p>
        {error ? (
          <p className="cp-topic-warning" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} onClick={() => void start()}>
          {loading ? "Hazırlanıyor…" : "Zor soruları aç"}
        </button>
      </section>
    );
  }

  if (done) {
    const scored = scoreQuizAnswers(questions as QuizQuestion[], answers);
    return (
      <section className="cp-exam-page">
        <h1>Zor sorular bitti</h1>
        <p>
          {scored.score} / {scored.total} doğru.
        </p>
        <p className="text-sm text-[var(--cp-muted)]">
          Bu set hazırlık puanını ve bitirdiğin konuları değiştirmez.
        </p>
        <Link href={`/deneme-sinavlari/${prepId}`} className="cp-exam-continue">
          Hazırlığa dön
        </Link>
      </section>
    );
  }

  return (
    <section className="cp-exam-page">
      <p className="text-sm text-[var(--cp-muted)]">{PREP_HOME_COPY.challenge}</p>
      <ExamQuizPlay
        questions={questions}
        index={index}
        value={answers[String(index)]}
        onChange={(value) => setAnswers((current) => ({ ...current, [String(index)]: value }))}
        continueLabel={index === questions.length - 1 ? "Bitir" : "Sonraki"}
        onContinue={() => {
          if (index >= questions.length - 1) {
            setDone(true);
            return;
          }
          setIndex((current) => current + 1);
        }}
      />
    </section>
  );
}
