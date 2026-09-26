"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type GovernorAction = {
  action: string;
  topicId: string;
  topicKey: string;
  teachingMode: string;
  difficulty: string;
  durationTarget: number;
  reasonCode: string;
  reasonCopy: string;
  decisionTraceId: string;
};

type PublicQuestion = {
  id: string;
  prompt: string;
  format: "mcq" | "numeric" | "short_text";
  choices?: string[];
  transfer?: boolean;
};

type ActionContent = {
  id: string;
  action: string;
  kind: string;
  title: string;
  bodyMarkdown: string;
  steps?: string[];
  misconceptionAddressed?: string | null;
  question: PublicQuestion | null;
  decisionTraceId: string;
};

type SessionPayload = {
  id: string;
  objective: string;
  plannedDurationMinutes: number;
  completionPct: number;
};

type CompletionSummary = {
  objectivesCompleted: string[];
  masteryGained: { topicKey: string; delta: number }[];
  remainingWeakPoint: string | null;
  scheduledReviews: { topicKey: string; dueAt: string }[];
  nextStudyDay: string | null;
  todayProgressPct: number;
  message: string;
};

const MANUAL = [
  { id: "reteach", label: "Başka şekilde anlat" },
  { id: "easier", label: "Daha kolay örnek" },
  { id: "harder", label: "Daha zor soru" },
  { id: "skip", label: "Bunu atla" },
  { id: "break", label: "Ara ver" },
] as const;

export function AdaptiveStudySession({
  prepId,
  prepTitle,
  daysRemaining,
}: {
  prepId: string;
  prepTitle: string;
  daysRemaining: number | null;
}) {
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [action, setAction] = useState<GovernorAction | null>(null);
  const [content, setContent] = useState<ActionContent | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [stepNote, setStepNote] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadContent = useCallback(
    async (sess: SessionPayload, act: GovernorAction, misconception?: string | null) => {
      setContentLoading(true);
      setContent(null);
      setAnswer("");
      try {
        const res = await fetch("/api/adaptive/session/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examPrepId: prepId,
            sessionId: sess.id,
            action: act,
            misconception: misconception ?? null,
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok && data.content) {
          setContent(data.content as ActionContent);
        } else {
          setStepNote("İçerik şu an üretilemedi; yine de devam edebilirsin.");
        }
      } catch {
        setStepNote("Bağlantı sorunu; içeriği yenilemeyi dene.");
      } finally {
        setContentLoading(false);
      }
    },
    [prepId],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/adaptive/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examPrepId: prepId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError("Çalışma oturumu şu an açılamadı. Biraz sonra tekrar dene.");
        return;
      }
      setSession(data.session);
      setAction(data.action);
      if (data.session && data.action) {
        await loadContent(data.session, data.action);
      }
    } catch {
      setError("Bağlantı sorunu. Sayfayı yenileyip tekrar dene.");
    } finally {
      setLoading(false);
    }
  }, [prepId, loadContent]);

  useEffect(() => {
    void start();
  }, [start]);

  async function refreshNext(extra?: Record<string, unknown>) {
    if (!session) return;
    const res = await fetch("/api/adaptive/session/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examPrepId: prepId,
        sessionId: session.id,
        ...extra,
      }),
    });
    const data = await res.json();
    if (data.ok && data.action) {
      setAction(data.action);
      await loadContent(session, data.action);
    }
  }

  async function submitAnswer() {
    if (!session || !action || !content?.question) return;
    setSubmitting(true);
    setStepNote(null);
    const idempotencyKey = `${session.id}:${action.decisionTraceId}:${Date.now()}`;
    try {
      const res = await fetch("/api/adaptive/session/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examPrepId: prepId,
          sessionId: session.id,
          idempotencyKey,
          decisionTraceId: action.decisionTraceId,
          topicId: action.topicId || undefined,
          topicKey: action.topicKey,
          studentAnswer: answer,
          difficulty: action.difficulty,
          independent: true,
          hintUsed: false,
          transfer: Boolean(content.question.transfer),
          retrievalAfterDelay: action.action === "scheduled_review" || action.action === "retrieval_practice",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStepNote(data.feedback || (data.correct ? "Doğru." : "Kaydettik."));
        if (data.action) {
          setAction(data.action);
          await loadContent(
            session,
            data.action,
            data.misconceptionTag ?? null,
          );
        }
      } else {
        setStepNote("Cevap kaydedilemedi; tekrar dene.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function continueWithoutAnswer() {
    setStepNote(null);
    await refreshNext({ lastAnswerCorrect: true });
  }

  async function complete() {
    if (!session) return;
    const res = await fetch("/api/adaptive/session/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examPrepId: prepId,
        sessionId: session.id,
      }),
    });
    const data = await res.json().catch(() => null);
    if (data?.summary) setSummary(data.summary as CompletionSummary);
    setDone(true);
  }

  async function manual(kind: (typeof MANUAL)[number]["id"]) {
    if (kind === "break") {
      await complete();
      return;
    }
    setStepNote("Tercihin kaydedildi; plan bozulmadan devam ediyoruz.");
    await refreshNext({
      lastAnswerCorrect: kind === "harder" ? true : null,
      hintCount: kind === "easier" ? 1 : 0,
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--cs-muted)]">
        Bugünkü programın hazırlanıyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <p className="text-sm text-[var(--cs-text)]">{error}</p>
        <button
          type="button"
          onClick={() => void start()}
          className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground"
        >
          Tekrar dene
        </button>
        <div>
          <Link
            href={`/deneme-sinavlari/${prepId}`}
            className="text-xs text-[var(--cs-muted)] underline"
          >
            Programa dön
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cs-text)]">
          Bugün tamamlandı
        </h1>
        <p className="text-sm text-[var(--cs-muted)]">
          {summary?.message ||
            "Öğrendiklerin kaydedildi. Yarınki programın otomatik hazırlanacak."}
        </p>
        {summary?.remainingWeakPoint ? (
          <p className="text-sm text-[var(--cs-text)]">
            Zayıf nokta: {summary.remainingWeakPoint}
          </p>
        ) : null}
        {summary?.nextStudyDay ? (
          <p className="text-xs text-[var(--cs-muted)]">
            Sonraki önerilen gün: {summary.nextStudyDay}
          </p>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex rounded-xl bg-action px-5 py-2.5 text-sm font-bold text-action-foreground"
        >
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs text-[var(--cs-muted)]">
          {prepTitle}
          {daysRemaining != null ? ` · ${daysRemaining} gün` : ""}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-xl text-[var(--cs-text)]">
          {session?.objective || "Çalışma oturumu"}
        </h1>
      </header>

      {action ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--cs-muted)]">
            Sıradaki adım · ~{action.durationTarget} dk · {actionLabel(action.action)}
          </p>
          <h2 className="text-lg font-semibold text-[var(--cs-text)]">
            {content?.title || action.topicKey}
          </h2>

          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="text-left text-xs text-amber-200/90 underline-offset-2 hover:underline"
          >
            Bunu neden çalışıyorum?
          </button>
          {whyOpen ? (
            <p className="text-sm text-[var(--cs-text)]">{action.reasonCopy}</p>
          ) : null}

          {contentLoading ? (
            <p className="text-sm text-[var(--cs-muted)]">İçerik hazırlanıyor…</p>
          ) : content ? (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--cs-text)]">
                {content.bodyMarkdown}
              </div>
              {content.steps?.length ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--cs-text)]">
                  {content.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : null}
              {content.misconceptionAddressed ? (
                <p className="text-xs text-amber-100/80">
                  Odak: {content.misconceptionAddressed}
                </p>
              ) : null}

              {content.question ? (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <p className="text-sm font-medium text-[var(--cs-text)]">
                    {content.question.prompt}
                  </p>
                  {content.question.format === "mcq" && content.question.choices ? (
                    <div className="flex flex-col gap-2">
                      {content.question.choices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAnswer(c)}
                          className={`rounded-xl border px-3 py-2 text-left text-sm ${
                            answer === c
                              ? "border-action bg-action/20 text-action-foreground"
                              : "border-white/15 text-[var(--cs-text)]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Cevabını yaz"
                      className="w-full rounded-xl border border-white/15 bg-transparent px-3 py-2 text-sm text-[var(--cs-text)]"
                    />
                  )}
                  <button
                    type="button"
                    disabled={submitting || !answer.trim()}
                    onClick={() => void submitAnswer()}
                    className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground disabled:opacity-50"
                  >
                    {submitting ? "Kontrol ediliyor…" : "Cevabı gönder"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void continueWithoutAnswer()}
                  className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground"
                >
                  {action.action === "advance"
                    ? "Sonraki konuya geç"
                    : "Anladım, devam"}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                session && action
                  ? void loadContent(session, action)
                  : undefined
              }
              className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-action-foreground"
            >
              İçeriği yükle
            </button>
          )}
        </section>
      ) : (
        <p className="text-sm text-[var(--cs-muted)]">
          Bugün için sıradaki adım bulunamadı. Programa dönüp konuları kontrol et.
        </p>
      )}

      {stepNote ? (
        <p className="text-sm text-emerald-200/90">{stepNote}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {MANUAL.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void manual(m.id)}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-[var(--cs-muted)] hover:border-white/30 hover:text-[var(--cs-text)]"
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">
        <Link
          href={`/deneme-sinavlari/${prepId}`}
          className="text-xs text-[var(--cs-muted)] underline-offset-2 hover:underline"
        >
          Programı gör
        </Link>
        <button
          type="button"
          onClick={() => void complete()}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm text-[var(--cs-text)]"
        >
          Oturumu bitir
        </button>
      </div>
    </div>
  );
}

function actionLabel(a: string): string {
  const map: Record<string, string> = {
    teach: "Kısa anlatım",
    worked_example: "Çözümlü örnek",
    easier_example: "Kolay örnek",
    practice: "Pratik soru",
    retrieval_practice: "Hatırlama",
    prerequisite_review: "Temel tekrar",
    reteach: "Yeniden anlatım",
    mini_assessment: "Mini değerlendirme",
    advance: "İlerleme",
    scheduled_review: "Aralıklı tekrar",
  };
  return map[a] ?? a;
}
