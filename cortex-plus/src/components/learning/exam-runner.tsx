"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreditGate } from "@/components/paywall/credit-gate";
import { cn } from "@/lib/utils";

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
      <section className="rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <h3 className="text-lg font-bold text-white">{title}</h3>
          </div>
          <span className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-300">
            {questions.length} soru
            {durationMinutes ? ` · ${durationMinutes} dk` : ""}
          </span>
        </div>

        <ol className="space-y-6">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="p-5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-violet-600/20 text-xs font-bold text-violet-300">
                  {index + 1}
                </span>
                <p className="text-base font-medium text-zinc-100 leading-relaxed">
                  {question.text}
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {question.options.map((option, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx);
                  const isSelected = answers[question.id] === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={Boolean(result)}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [question.id]: option }))
                      }
                      className={cn(
                        "w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl text-left text-sm transition-all border",
                        isSelected
                          ? "bg-violet-600/20 border-violet-500 text-white shadow-md shadow-violet-600/20"
                          : "bg-zinc-900/60 hover:bg-zinc-800/80 border-white/5 text-zinc-300 hover:text-white",
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-all",
                          isSelected
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-zinc-800 text-zinc-400",
                        )}
                      >
                        {letter}
                      </div>

                      <span className="flex-1 leading-snug">{option}</span>

                      <div
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center border transition-all",
                          isSelected
                            ? "bg-violet-600 border-violet-400 text-white"
                            : "border-zinc-700 bg-zinc-800/50 opacity-40",
                        )}
                      >
                        {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>

        {result ? (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6 backdrop-blur-md space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <p className="font-bold text-lg text-white">Puan: {result.score} / 100</p>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
              {result.analysis}
            </p>
          </div>
        ) : (
          <div className="pt-4 flex justify-end">
            <Button
              type="button"
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-violet-600/30"
              disabled={loading || Object.keys(answers).length !== questions.length}
              onClick={submit}
            >
              {loading ? "Değerlendiriliyor…" : "Sınavı Bitir ve Puanla"}
            </Button>
          </div>
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
