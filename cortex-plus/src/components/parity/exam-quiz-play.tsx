"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sameOptionSet, selectedOptions, type PublicQuizQuestion } from "@/lib/learning/exam-quiz";

export function ExamQuizPlay({
  questions,
  index,
  value,
  onChange,
  onContinue,
  continueLabel,
  disabled,
}: {
  questions: PublicQuizQuestion[];
  index: number;
  value: unknown;
  onChange: (value: string | string[]) => void;
  onContinue: () => void;
  continueLabel: string;
  disabled?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const question = questions[index];

  useEffect(() => {
    setRevealed(false);
  }, [index]);

  if (!question) return null;

  const selected = selectedOptions(value);
  const isOn = (option: string) => selected.includes(option);
  const hasCorrect = Array.isArray(question.correct) && question.correct.length > 0;
  const isCorrect = hasCorrect ? sameOptionSet(selected, question.correct!) : false;

  function pick(option: string) {
    if (revealed) return;
    if (question.multi) {
      onChange(
        isOn(option) ? selected.filter((item) => item !== option) : [...selected, option],
      );
      return;
    }
    onChange(option);
  }

  function handleAction() {
    if (hasCorrect && !revealed) {
      setRevealed(true);
      return;
    }
    onContinue();
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <span className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs font-bold text-violet-300">
          Soru {index + 1} / {questions.length}
        </span>
        {question.multi ? (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-[11px] font-semibold text-amber-300">
            Birden fazla yanıt seçilebilir
          </span>
        ) : null}
      </div>

      {/* Question Prompt */}
      <h2 className="text-lg sm:text-xl md:text-2xl font-medium text-white leading-relaxed">
        {question.text}
      </h2>

      {/* Options List */}
      <div className="space-y-3">
        {question.options.map((option, optionIndex) => {
          const selectedThis = isOn(option);
          const isThisCorrect = hasCorrect && question.correct!.includes(option);
          const showGreen = revealed && isThisCorrect;
          const showRed = revealed && selectedThis && !isThisCorrect;
          const letter = String.fromCharCode(65 + optionIndex);

          return (
            <button
              key={option}
              type="button"
              disabled={revealed}
              onClick={() => pick(option)}
              className={cn(
                "group w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-200 relative overflow-hidden border",
                showGreen
                  ? "bg-emerald-950/40 border-emerald-500 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  : showRed
                    ? "bg-rose-950/40 border-rose-500 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                    : selectedThis
                      ? "bg-gradient-to-r from-violet-600/20 to-indigo-600/15 border-violet-500 shadow-[0_0_20px_rgba(124,108,247,0.25)] text-white"
                      : "bg-[#13141d]/80 hover:bg-[#191a26]/90 border-white/10 hover:border-violet-500/40 text-zinc-200 hover:text-white",
              )}
            >
              {/* Option Letter Keycap */}
              <div
                className={cn(
                  "flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-200",
                  showGreen
                    ? "bg-emerald-500 text-black shadow-md"
                    : showRed
                      ? "bg-rose-500 text-white shadow-md"
                      : selectedThis
                        ? "bg-violet-600 text-white shadow-md shadow-violet-500/40"
                        : "bg-zinc-800/90 text-zinc-400 group-hover:text-zinc-200 border border-white/5",
                )}
              >
                {showGreen ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : showRed ? (
                  <X className="h-4 w-4 stroke-[3]" />
                ) : (
                  letter
                )}
              </div>

              {/* Option Text */}
              <span className="flex-1 text-sm sm:text-base font-normal leading-snug">
                {option}
              </span>

              {/* Status Dot / Checkmark */}
              <div
                className={cn(
                  "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all border",
                  showGreen
                    ? "bg-emerald-500 border-emerald-400 text-black"
                    : showRed
                      ? "bg-rose-500 border-rose-400 text-white"
                      : selectedThis
                        ? "bg-violet-600 border-violet-400 text-white"
                        : "border-zinc-700 bg-zinc-800/50 opacity-40 group-hover:opacity-70",
                )}
              >
                {showGreen ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : showRed ? (
                  <X className="w-3.5 h-3.5 stroke-[3]" />
                ) : selectedThis ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Instant Feedback Callout */}
      {revealed && hasCorrect ? (
        <div
          className={cn(
            "p-5 rounded-2xl border backdrop-blur-md space-y-2 animate-in fade-in zoom-in-95 duration-200",
            isCorrect
              ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/30 border-rose-500/40 text-rose-200",
          )}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            {isCorrect ? (
              <>
                <Check className="h-4 w-4 stroke-[3] text-emerald-400" />
                <span className="text-emerald-300">Harika! Doğru yanıt.</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 stroke-[3] text-rose-400" />
                <span className="text-rose-300">Yanlış yanıt.</span>
              </>
            )}
          </div>
          {question.explanation ? (
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed pt-1">
              {question.explanation}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Action CTA */}
      <button
        type="button"
        disabled={disabled || selected.length === 0}
        onClick={handleAction}
        className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>{hasCorrect && !revealed ? "Yanıtı Kontrol Et" : continueLabel}</span>
      </button>
    </div>
  );
}
