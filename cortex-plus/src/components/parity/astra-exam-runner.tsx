"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditGate } from "@/components/paywall/credit-gate";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  text: string;
  options: string[];
  question_type: string;
};

export function AstraExamRunner({
  examId,
  prepId,
  title,
  questions,
}: {
  examId: string;
  prepId: string;
  title: string;
  questions: Question[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [result, setResult] = useState<{ score: number; analysis: string } | null>(
    null,
  );

  const current = questions[index];
  const progress = questions.length
    ? Math.round(((index + 1) / questions.length) * 100)
    : 0;
  const isMulti = current?.question_type === "multi_mcq";

  const selected = useMemo(() => {
    if (!current) return [] as string[];
    const value = answers[current.id];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }, [answers, current]);

  function toggleOption(option: string) {
    if (!current) return;
    if (isMulti) {
      setAnswers((prev) => {
        const existing = prev[current.id];
        const list = Array.isArray(existing) ? [...existing] : existing ? [existing] : [];
        const next = list.includes(option)
          ? list.filter((o) => o !== option)
          : [...list, option];
        return { ...prev, [current.id]: next };
      });
      return;
    }
    setAnswers((prev) => ({ ...prev, [current.id]: option }));
  }

  async function submit() {
    setLoading(true);
    try {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(answers)) {
        normalized[key] = Array.isArray(value) ? value.join("|") : value;
      }
      const res = await fetch("/api/learning/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, answers: normalized }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Değerlendirme yapılamadı.");
        return;
      }
      setResult({ score: payload.score, analysis: payload.analysis });
      router.push(
        `/deneme-sinavlari/${prepId}/sonuc?examId=${examId}&score=${payload.score}`,
      );
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  if (!questions.length) return null;

  if (result) {
    return (
      <div className="ap-exam-page">
        <p className="text-lg font-semibold">Puan: {result.score}</p>
        <p className="mt-2 text-sm text-[var(--ap-muted)]">{result.analysis}</p>
      </div>
    );
  }

  return (
    <>
      <div className="ap-exam-runner">
        <div className="ap-exam-runner-progress">
          <div style={{ width: `${progress}%` }} />
        </div>
        <Link href={`/deneme-sinavlari/${prepId}/calis`} className="ap-back-pill">
          ← Geri
        </Link>
        <h1 className="ap-exam-runner-title">{title}</h1>
        {isMulti ? (
          <p className="ap-exam-multi-hint">✓ Birden fazla yanıt seçebilirsin</p>
        ) : null}
        <p className="ap-exam-runner-q">{current.text}</p>
        <ol className="ap-exam-options">
          {current.options.map((option, optIndex) => {
            const active = selected.includes(option);
            return (
              <li key={option}>
                <button
                  type="button"
                  className={cn("ap-exam-option", active && "ap-exam-option--active")}
                  onClick={() => toggleOption(option)}
                >
                  <span className="ap-exam-option-num">{optIndex + 1}</span>
                  <span className="ap-exam-option-check" aria-hidden />
                  <span>{option}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="ap-wizard-nav">
          <button
            type="button"
            className="ap-chip"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Önceki
          </button>
          {index < questions.length - 1 ? (
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              onClick={() => setIndex((i) => i + 1)}
            >
              Sonraki
            </button>
          ) : (
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              disabled={loading}
              onClick={() => void submit()}
            >
              {loading ? "Bitiriliyor…" : "Sınavı bitir"}
            </button>
          )}
        </div>
      </div>
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Değerlendirme için yeterli kredin kalmadı."
        returnPath={`/deneme-sinavlari/${prepId}/deneme/${examId}`}
      />
    </>
  );
}
