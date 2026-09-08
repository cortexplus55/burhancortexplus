"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { CreditGate } from "@/components/paywall/credit-gate";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

type DiagnosticEvidence = {
  questionIndex: number;
  topicLabel: string;
  skill: string;
  correct: boolean;
  questionPreview: string;
};

type DiagnosticPayload = {
  startingLevelLabel: string;
  overallMeasured: string;
  evidence: DiagnosticEvidence[];
  topicResults?: {
    topicLabel: string;
    status: string;
    measuredLevel: string;
    reason?: string;
  }[];
  hardTopicsSelf?: string[];
};

const SKILL_TR: Record<string, string> = {
  definition: "tanım",
  concept: "kavram",
  application: "uygulama",
  multi_step: "çok adım",
  misconception: "yanılgı",
};

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
  const [mode, setMode] = useState<"legacy" | "diagnostic_v2">("legacy");
  const [diagnostic, setDiagnostic] = useState<DiagnosticPayload | null>(null);
  const [displayTopic, setDisplayTopic] = useState(topicLabel);

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
      if (data.mode === "diagnostic_v2") setMode("diagnostic_v2");
      if (typeof data.topicLabel === "string") setDisplayTopic(data.topicLabel);
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
      if (data.mode === "diagnostic_v2" && data.diagnostic) {
        setMode("diagnostic_v2");
        setDiagnostic(data.diagnostic as DiagnosticPayload);
      }
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
          <p className="ap-lesson-kicker">{displayTopic}</p>
          <h1>
            {mode === "diagnostic_v2"
              ? "Başlangıç tanısı hazırlanıyor…"
              : "Tanışma testi hazırlanıyor…"}
          </h1>
          <p className="text-sm text-[var(--ap-muted)]">
            {mode === "diagnostic_v2"
              ? "Belgedeki ana konuların hepsinden kısa bir örnekleme geliyor. Bu test ustalığı kanıtlamaz."
              : "Konuyu kısaca yoklayan 5 soru geliyor."}
          </p>
        </section>
      ) : null}

      {stage === "play" && questions[index] ? (
        <>
          <p className="ap-lesson-kicker">
            {mode === "diagnostic_v2" ? "Başlangıç tanısı" : "Tanışma testi"} ·{" "}
            {displayTopic}
          </p>
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
          <p className="ap-lesson-kicker">
            {mode === "diagnostic_v2" ? "Başlangıç düzeyi" : "Doğru cevaplar"}
          </p>
          <p className="ap-exam-score-xl">
            {score.score}/{score.total}
          </p>
          {mode === "diagnostic_v2" && diagnostic ? (
            <>
              <p>{diagnostic.startingLevelLabel}</p>
              <p className="text-sm text-[var(--ap-muted)]">
                Ölçülen seviye öz-bildirimden ayrıdır.
                {diagnostic.hardTopicsSelf?.length
                  ? ` Öz-bildirim (zor): ${diagnostic.hardTopicsSelf.join(", ")}.`
                  : ""}
              </p>
              {diagnostic.topicResults?.length ? (
                <ul className="text-sm text-[var(--ap-muted)]">
                  {diagnostic.topicResults.map((topic) => (
                    <li key={topic.topicLabel}>
                      {topic.topicLabel}:{" "}
                      {topic.status === "unreadable" || topic.status === "unmeasured"
                        ? `ölçülmedi (${topic.measuredLevel})`
                        : `ölçülen ${topic.measuredLevel}`}
                      {topic.reason ? ` — ${topic.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {diagnostic.evidence?.length ? (
                <div>
                  <p className="ap-lesson-kicker">Hangi cevaplar seviyeyi belirledi?</p>
                  <ul className="text-sm">
                    {diagnostic.evidence.map((item) => (
                      <li key={`${item.questionIndex}-${item.topicLabel}`}>
                        {item.correct ? "✓" : "✗"} {item.topicLabel} ·{" "}
                        {SKILL_TR[item.skill] ?? item.skill}: {item.questionPreview}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p>
                {score.total && score.score / score.total >= 0.7
                  ? "Güzel gidiyor"
                  : "Biraz daha gelişebilirsin"}
              </p>
              <p className="text-sm text-[var(--ap-muted)]">
                Doğruluk {Math.round((score.score / Math.max(1, score.total)) * 100)}%
              </p>
            </>
          )}
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
