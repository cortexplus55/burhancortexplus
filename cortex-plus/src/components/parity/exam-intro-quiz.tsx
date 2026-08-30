"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { CreditGate } from "@/components/paywall/credit-gate";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

export function ExamIntroQuiz({
  prepId,
  topicLabel,
}: {
  prepId: string;
  topicLabel: string;
}) {
  const home = examPrepHomeHref(prepId);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState(false);
  const [stage, setStage] = useState<"play" | "result">("play");
  const [questions, setQuestions] = useState<PublicQuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [score, setScore] = useState({ score: 0, total: 5 });
  const [nextHref, setNextHref] = useState(home);

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepId]);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, action: "start" }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.done && data.nextHref) {
        window.location.assign(data.nextHref);
        return;
      }
      if (res.status === 409 && data.nextHref) {
        window.location.assign(data.nextHref);
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Tanışma testi üretilemedi.");
        return;
      }
      setQuestions(data.questions ?? []);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function finish(nextAnswers: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, action: "complete", answers: nextAnswers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi.");
        return;
      }
      setScore({ score: data.score ?? 0, total: data.total ?? questions.length });
      setNextHref(data.nextHref ?? home);
      setStage("result");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    const nextAnswers = answers;
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    void finish(nextAnswers);
  }

  return (
    <div className="ap-exam-page ap-exam-node">
      <div className="ap-exam-study-bar">
        <Link href={home} className="ap-back-pill">
          ← Geri
        </Link>
        <Link href={home} className="ap-back-pill">
          ×
        </Link>
      </div>

      {loading && stage === "play" && !questions.length ? (
        <section>
          <p className="ap-lesson-kicker">{topicLabel}</p>
          <h1>Tanışma testi hazırlanıyor…</h1>
          <p className="text-sm text-[var(--ap-muted)]">
            Konuyu kısaca yoklayan 5 soru geliyor.
          </p>
        </section>
      ) : null}

      {stage === "play" && questions[index] ? (
        <>
          <p className="ap-lesson-kicker">Tanışma testi · {topicLabel}</p>
          <ExamQuizPlay
            questions={questions}
            index={index}
            value={answers[String(index)]}
            onChange={(value) =>
              setAnswers((prev) => ({ ...prev, [String(index)]: value }))
            }
            onContinue={goNext}
            continueLabel={index + 1 < questions.length ? "İleri" : "Bitir"}
            disabled={loading}
          />
        </>
      ) : null}

      {stage === "result" ? (
        <section className="ap-exam-node-result">
          <p className="ap-lesson-kicker">Doğru cevaplar</p>
          <p className="ap-exam-score-xl">
            {score.score}/{score.total}
          </p>
          <p>
            {score.total && score.score / score.total >= 0.7
              ? "Güzel gidiyor"
              : "Biraz daha gelişebilirsin"}
          </p>
          <p className="text-sm text-[var(--ap-muted)]">
            Doğruluk {Math.round((score.score / Math.max(1, score.total)) * 100)}%
          </p>
          <Link href={nextHref} className="ap-exam-continue ap-exam-continue--primary">
            Devam et
          </Link>
        </section>
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Tanışma testi için kredin kalmadı."
        returnPath={home}
      />
    </div>
  );
}
