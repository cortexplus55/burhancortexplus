"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import type {
  MistakeQuestion,
  MistakeQuestionGroup,
} from "@/lib/learning/mistake-notebook";

/**
 * Yanlış defteri.
 *
 * Ekran iki hâlde: liste ve tekrar. Listede konular ve kaçar soru beklediği
 * var; bir konuya basınca o konunun soruları sırayla soruluyor.
 *
 * Tekrar sırasında doğru yanıt istemcide yok — yanıt sunucuya gidiyor,
 * doğruluk kararı oradan dönüyor. Bu yüzden "kontrol et" adımı ağ isteği
 * gerektiriyor ve düğme o sırada kilitleniyor.
 */

type Feedback = {
  correct: boolean;
  mastered: boolean;
  correctAnswer: string | null;
  explanation: string | null;
};

export function MistakeNotebookView({
  groups,
  masteredCount,
}: {
  groups: MistakeQuestionGroup[];
  masteredCount: number;
}) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sending, setSending] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);

  const openCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.questions.length, 0),
    [groups],
  );

  const queue = useMemo(() => {
    if (!activeTopic) return [] as MistakeQuestion[];
    const group = groups.find((g) => g.label === activeTopic);
    return group ? group.questions : [];
  }, [activeTopic, groups]);

  const current = queue[index];

  function startTopic(label: string) {
    setActiveTopic(label);
    setIndex(0);
    setPicked(null);
    setFeedback(null);
    setSolved([]);
  }

  function leave() {
    setActiveTopic(null);
    setFeedback(null);
    setPicked(null);
  }

  async function check() {
    if (!current || picked === null || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/learning/mistakes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: current.id, answer: picked }),
      });
      if (!res.ok) {
        setFeedback({
          correct: false,
          mastered: false,
          correctAnswer: null,
          explanation:
            "Yanıtın kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
        });
        return;
      }
      const data = (await res.json()) as Feedback;
      setFeedback(data);
      if (data.mastered) setSolved((prev) => [...prev, current.id]);
    } finally {
      setSending(false);
    }
  }

  function next() {
    setPicked(null);
    setFeedback(null);
    setIndex((i) => i + 1);
  }

  // ---------- tekrar ekranı ----------

  if (activeTopic) {
    const done = index >= queue.length;

    return (
      <div className="ap-exam-page">
        <div className="ap-page-head">
          <h1 className="ap-page-title">{activeTopic}</h1>
          <button type="button" onClick={leave} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]">
            Deftere dön
          </button>
        </div>

        {done ? (
          <div className="astra-pay-card p-6 text-center">
            <p className="text-lg font-semibold text-[var(--astra-text)]">
              Bu turu bitirdin.
            </p>
            <p className="mt-2 text-sm text-[var(--astra-muted)]">
              {solved.length
                ? `${solved.length} soru defterden çıktı. Kalanlar bir sonraki tura kaldı — üst üste iki doğru gerekiyor.`
                : "Hiçbir soru henüz defterden çıkmadı. Üst üste iki doğru gerekiyor; bir tur daha at."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => startTopic(activeTopic)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Bir tur daha
              </button>
              <button type="button" onClick={leave} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-[var(--astra-muted)] transition-colors hover:border-white/30 hover:text-[var(--astra-text)]">
                Deftere dön
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[var(--astra-muted)]">
              {index + 1} / {queue.length}
              {current && current.wrongCount > 1
                ? ` · bu soruyu ${current.wrongCount} kez yanlış yaptın`
                : ""}
            </p>

            <div className="astra-pay-card p-5">
              <p className="text-base leading-relaxed text-[var(--astra-text)]">
                {current?.questionText}
              </p>

              <div className="mt-4 flex flex-col gap-2">
                {current?.options.map((option) => {
                  const isPicked = picked === option;
                  const isAnswer =
                    feedback?.correctAnswer != null &&
                    feedback.correctAnswer === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={Boolean(feedback)}
                      onClick={() => setPicked(option)}
                      aria-pressed={isPicked}
                      className={[
                        "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                        isAnswer
                          ? "border-emerald-500/60 bg-emerald-500/10 text-[var(--astra-text)]"
                          : isPicked && feedback && !feedback.correct
                            ? "border-red-500/60 bg-red-500/10 text-[var(--astra-text)]"
                            : isPicked
                              ? "border-[var(--astra-primary)] bg-[var(--astra-primary)]/10 text-[var(--astra-text)]"
                              : "border-white/10 text-[var(--astra-muted)] hover:border-white/25",
                      ].join(" ")}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {!feedback ? (
                <button
                  type="button"
                  onClick={check}
                  disabled={picked === null || sending}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? "Kontrol ediliyor…" : "Kontrol et"}
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <p
                    className={[
                      "inline-flex items-center gap-2 text-sm font-semibold",
                      feedback.correct ? "text-emerald-400" : "text-red-400",
                    ].join(" ")}
                  >
                    {feedback.correct ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <X className="h-4 w-4" aria-hidden="true" />
                    )}
                    {feedback.correct ? "Doğru" : "Hâlâ yanlış"}
                    {feedback.mastered ? " · bu soru defterden çıktı" : ""}
                  </p>

                  {feedback.explanation ? (
                    <p className="text-sm leading-relaxed text-[var(--astra-muted)]">
                      {feedback.explanation}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={next}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {index + 1 >= queue.length ? "Turu bitir" : "Sonraki soru"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- liste ekranı ----------

  return (
    <div className="ap-exam-page">
      <div className="ap-page-head">
        <h1 className="ap-page-title">Yanlış defteri</h1>
      </div>

      <p className="text-sm text-[var(--astra-muted)]">
        Denemede ve quizde yanlış yaptığın sorular burada birikiyor. Bir soru
        defterden ancak <strong>üst üste iki kez</strong> doğru yaptığında
        çıkıyor — tek doğru şans olabilir.
      </p>

      {openCount === 0 ? (
        <div className="astra-pay-card mt-5 p-6 text-center">
          <p className="text-lg font-semibold text-[var(--astra-text)]">
            {masteredCount > 0
              ? "Defterin şu an boş."
              : "Defterin henüz boş."}
          </p>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            {masteredCount > 0
              ? `Bekleyen soru kalmadı. Bugüne kadar ${masteredCount} soruyu defterden çıkardın.`
              : "Bir deneme sınavı ya da quiz çözdüğünde yanlışların buraya kendiliğinden düşecek."}
          </p>
          <Link
            href="/deneme-sinavlari"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            Deneme çöz
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="astra-pay-card p-4">
              <p className="text-xs text-[var(--astra-muted)]">Bekleyen soru</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--astra-text)]">
                {openCount}
              </p>
            </div>
            <div className="astra-pay-card p-4">
              <p className="text-xs text-[var(--astra-muted)]">Defterden çıkan</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--astra-text)]">
                {masteredCount}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {groups.map((group) => (
              <button
                key={group.label}
                type="button"
                onClick={() => startTopic(group.label)}
                className="astra-pay-card flex items-center justify-between gap-4 p-4 text-left transition-transform hover:scale-[1.01]"
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--astra-text)]">
                    {group.label}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--astra-muted)]">
                    {group.questions.length} soru bekliyor
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[var(--astra-primary)]">
                  Tekrar et
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
