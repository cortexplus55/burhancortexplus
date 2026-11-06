"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

/**
 * 6 Kasım 2026: tanışma uçları model çağırıyor; istek askıda kalınca ekran sonsuza kadar "hazırlanıyor"
 * diyordu. Her istek 60 sn'de kesilir, öğrenci ne olduğunu görür ve yeniden dener.
 */
export const INTRO_TIMEOUT_MS = 60_000;
export const INTRO_TIMEOUT_MESSAGE =
  "İstek 1 dakikada tamamlanmadı; bağlantın yavaş olabilir. Tekrar dene.";

/** `AbortSignal.timeout` olmayan tarayıcıda da çalışan süre sınırı. */
export function introDeadline(ms: number = INTRO_TIMEOUT_MS): {
  signal: AbortSignal;
  timedOut: () => boolean;
  clear: () => void;
} {
  const controller = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, ms);
  return { signal: controller.signal, timedOut: () => fired, clear: () => clearTimeout(timer) };
}

const LEVEL_TR: Record<string, string> = {
  unknown: "henüz ölçülmedi",
  weak: "temel tekrar gerekli",
  developing: "gelişiyor",
  solid: "temeli sağlam",
  strong: "ileri düzey",
};

export function ExamIntroQuiz({
  prepId,
  topicLabel,
}: {
  prepId: string;
  topicLabel: string;
}) {
  const router = useRouter();
  const home = examPrepHomeHref(prepId);
  const [loading, setLoading] = useState(true);
  const [paywall, setPaywall] = useState(false);
  const [stage, setStage] = useState<"play" | "result">("play");
  const [questions, setQuestions] = useState<PublicQuizQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [score, setScore] = useState({ score: 0, total: 5 });
  const [nextHref, setNextHref] = useState(home);
  const [mode, setMode] = useState<"legacy" | "diagnostic_v2">("legacy");
  const [diagnostic, setDiagnostic] = useState<DiagnosticPayload | null>(null);
  const [displayTopic, setDisplayTopic] = useState(topicLabel);
  const [startError, setStartError] = useState<string | null>(null);
  const [sourceLimited, setSourceLimited] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepId]);

  // Ölçüm yapmadan kapıyı aç. Test kaybolmuyor: hazırlık sayfasında
  // hatırlatma kartı kalıyor, öğrenci hazır olduğunda dönüyor.
  async function deferIntro() {
    setDeferring(true);
    const deadline = introDeadline();
    try {
      const res = await fetch("/api/learning/exam-prep/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, action: "skip" }),
        signal: deadline.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.nextHref) {
        toast.error(payload.error ?? "Ders açılamadı. Tekrar dene.");
        setDeferring(false);
        return;
      }
      router.push(payload.nextHref ?? home);
      router.refresh();
    } catch {
      setDeferring(false);
      toast.error(
        deadline.timedOut() ? INTRO_TIMEOUT_MESSAGE : "Bağlantı kesildi. Derse geçmek için tekrar dene.",
      );
    } finally {
      deadline.clear();
    }
  }

  async function start() {
    setLoading(true);
    setStartError(null);
    setSourceLimited(false);
    setQuestions([]);
    setAttemptId(null);
    const deadline = introDeadline();
    try {
      const res = await fetch("/api/learning/exam-prep/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, action: "start" }),
        signal: deadline.signal,
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
      if (data.sourceLimited) {
        if (typeof data.topicLabel === "string") setDisplayTopic(data.topicLabel);
        setSourceLimited(true);
        return;
      }
      if (!res.ok) {
        const message = data.error ?? "Tanışma testi bu sefer gelmedi. Yeniden dene.";
        setStartError(message);
        toast.error(message);
        return;
      }
      const nextQuestions = data.questions ?? [];
      if (!nextQuestions.length) {
        const message = "Soru listesi boş geldi. Tekrar dene.";
        setStartError(message);
        toast.error(message);
        return;
      }
      setQuestions(nextQuestions);
      setAttemptId(typeof data.attemptId === "string" ? data.attemptId : null);
      if (data.mode === "diagnostic_v2") setMode("diagnostic_v2");
      if (typeof data.topicLabel === "string") setDisplayTopic(data.topicLabel);
    } catch {
      const message = deadline.timedOut() ? INTRO_TIMEOUT_MESSAGE : "Bağlantı hatası.";
      setStartError(message);
      toast.error(message);
    } finally {
      deadline.clear();
      setLoading(false);
    }
  }

  async function finish(nextAnswers: Record<string, unknown>) {
    setLoading(true);
    setFinishError(null);
    const deadline = introDeadline();
    try {
      const res = await fetch("/api/learning/exam-prep/intro", {
        signal: deadline.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          ...(attemptId ? { attemptId } : {}),
          action: "complete",
          answers: nextAnswers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ?? "Kaydedilemedi.";
        setFinishError(message);
        toast.error(message);
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
      const message = deadline.timedOut() ? INTRO_TIMEOUT_MESSAGE : "Bağlantı hatası.";
      setFinishError(message);
      toast.error(message);
    } finally {
      deadline.clear();
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
    <div className="cp-exam-page cp-exam-node">
      <div className="cp-exam-study-bar">
        <Link href={home} className="cp-back-pill">
          ← Geri
        </Link>
        <Link href={home} className="cp-back-pill">
          ×
        </Link>
      </div>

      {loading && stage === "play" && !questions.length ? (
        <section>
          <p className="cp-lesson-kicker">{displayTopic}</p>
          <h1>
            {mode === "diagnostic_v2"
              ? "Başlangıç tanısı hazırlanıyor…"
              : "Tanışma testi hazırlanıyor…"}
          </h1>
          <p className="text-sm text-[var(--cp-muted)]">
            {mode === "diagnostic_v2"
              ? "Seçtiğin konunun belge sayfalarından kısa sorular hazırlanıyor. Diğer konular ölçülmemiş kalır."
              : "Seçtiğin konuyu yoklayan kısa sorular hazırlanıyor."}
          </p>
          {/* Kaçış hazırlanma sırasında da dursun: test yirmi saniyeden uzun
              sürebiliyor ve öğrencinin atlamak isteyeceği an tam burası. */}
          <button
            type="button"
            className="cp-exam-intro-defer"
            disabled={deferring}
            onClick={() => void deferIntro()}
          >
            {deferring ? "Açılıyor…" : "Beklemeden derse geç"}
          </button>
        </section>
      ) : null}

      {!loading && stage === "play" && !questions.length && !paywall && sourceLimited ? (
        <section>
          <p className="cp-lesson-kicker">{displayTopic}</p>
          <h1>Bu bölüm için ölçümü erteleyelim</h1>
          <p className="text-sm text-[var(--cp-muted)]">
            Belgenin bu bölümündeki sayfalar aynı kısa bilgiyi tekrarlıyor. Üç farklı
            beceriyi yalnızca bu kaynaktan güvenilir biçimde ölçemeyiz. Konu ölçülmemiş
            kalacak; derse şimdi geçebilirsin.
          </p>
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            disabled={deferring}
            onClick={() => void deferIntro()}
          >
            {deferring ? "Ders açılıyor…" : "Derse geç"}
          </button>
        </section>
      ) : null}

      {!loading && stage === "play" && !questions.length && !paywall && !sourceLimited ? (
        <section>
          <p className="cp-lesson-kicker">{displayTopic}</p>
          <h1>Tanışma testi açılamadı</h1>
          <p role="alert" className="text-sm text-[var(--cp-muted)]">
            {startError ?? "Sorular yüklenemedi. Boş ekranda kalma — tekrar dene."}
          </p>
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            onClick={() => void start()}
          >
            Tekrar dene
          </button>
          <button
            type="button"
            className="cp-exam-intro-defer"
            disabled={deferring}
            onClick={() => void deferIntro()}
          >
            {deferring ? "Ders açılıyor…" : "Ölçümü ertele, derse geç"}
          </button>
        </section>
      ) : null}

      {stage === "play" && questions[index] ? (
        <>
          <p className="cp-lesson-kicker">
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
          {finishError ? (
            <div role="alert" className="text-sm text-[var(--cp-muted)]">
              <p>{finishError}</p>
              <button
                type="button"
                className="cp-exam-continue cp-exam-continue--primary"
                disabled={loading}
                onClick={() => void finish(answers)}
              >
                Tekrar dene
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="cp-exam-intro-defer"
            disabled={deferring}
            onClick={() => void deferIntro()}
          >
            {deferring ? "Açılıyor…" : "Sonra yaparım, derse geç"}
          </button>
        </>
      ) : null}

      {stage === "result" ? (
        <section className="cp-exam-node-result">
          <p className="cp-lesson-kicker">
            {mode === "diagnostic_v2" ? "Başlangıç düzeyi" : "Doğru cevaplar"}
          </p>
          <p className="cp-exam-score-xl">
            {score.score}/{score.total}
          </p>
          {mode === "diagnostic_v2" && diagnostic ? (
            <>
              <p>{diagnostic.startingLevelLabel}</p>
              <p className="text-sm text-[var(--cp-muted)]">
                Ölçülen seviye öz-bildirimden ayrıdır.
                {diagnostic.hardTopicsSelf?.length
                  ? ` Öz-bildirim (zor): ${diagnostic.hardTopicsSelf.join(", ")}.`
                  : ""}
              </p>
              {diagnostic.topicResults?.length ? (
                <ul className="text-sm text-[var(--cp-muted)]">
                  {diagnostic.topicResults.map((topic) => (
                    <li key={topic.topicLabel}>
                      {topic.topicLabel}:{" "}
                      {topic.status === "unreadable" || topic.status === "unmeasured"
                        ? LEVEL_TR.unknown
                        : `ölçülen düzey: ${LEVEL_TR[topic.measuredLevel] ?? topic.measuredLevel}`}
                      {topic.reason ? ` — ${topic.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {diagnostic.evidence?.length ? (
                <div>
                  <p className="cp-lesson-kicker">Hangi cevaplar seviyeyi belirledi?</p>
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
              <p className="text-sm text-[var(--cp-muted)]">
                Doğruluk {Math.round((score.score / Math.max(1, score.total)) * 100)}%
              </p>
            </>
          )}
          <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            Devam et
          </Link>
        </section>
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Tanışma testi için kullanım hakkın doldu."
        returnPath={home}
        // Kurulum işi ücretsizde dahil (sunucu `freeMeter: "included"`); dolan, günlük adım sınırı.
        meter="included"
      />
    </div>
  );
}
