"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreditGate } from "@/components/paywall/credit-gate";

type Question = { id: string; text: string; options: string[] };

export function ExamRunner({
  examId,
  title,
  durationMinutes,
  questions,
}: {
  examId: string;
  title: string;
  durationMinutes: number | null;
  questions: Question[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [result, setResult] = useState<{ score: number; analysis: string } | null>(
    null,
  );

  if (!questions.length) return null;

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/learning/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, answers }),
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
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{title}</h3>
          <span className="text-xs text-muted-foreground">
            {questions.length} soru
            {durationMinutes ? ` · ${durationMinutes} dk` : ""}
          </span>
        </div>

        <ol className="mt-4 space-y-4">
          {questions.map((question, index) => (
            <li key={question.id}>
              <fieldset>
                <legend className="text-sm font-medium">
                  {index + 1}. {question.text}
                </legend>
                <div className="mt-2 space-y-1">
                  {question.options.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={answers[question.id] === option}
                        disabled={Boolean(result)}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option }))
                        }
                        className="accent-[hsl(var(--primary))]"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>

        {result ? (
          <div className="mt-4 rounded-md bg-accent/50 p-3 text-sm">
            <p className="font-medium">Puan: {result.score}/100</p>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
              {result.analysis}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="mt-4"
            disabled={loading || Object.keys(answers).length !== questions.length}
            onClick={submit}
          >
            {loading ? "Değerlendiriliyor…" : "Sınavı bitir"}
          </Button>
        )}
      </section>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Deneme değerlendirmesi için yeterli kredin kalmadı. Yanıtların ekranda korunuyor."
        returnPath="/deneme-sinavlari"
      />
    </>
  );
}
