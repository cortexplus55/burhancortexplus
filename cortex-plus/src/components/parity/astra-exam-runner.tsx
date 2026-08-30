"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  LayoutGrid,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
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
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showNavPalette, setShowNavPalette] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [result, setResult] = useState<{ score: number; analysis: string } | null>(null);

  const current = questions[index];
  const isMulti = current?.question_type === "multi_mcq";

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((val) => {
      if (Array.isArray(val)) return val.length > 0;
      return typeof val === "string" && val.trim().length > 0;
    }).length;
  }, [answers]);

  const progress = questions.length
    ? Math.round(((index + 1) / questions.length) * 100)
    : 0;

  const selected = useMemo(() => {
    if (!current) return [] as string[];
    const value = answers[current.id];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }, [answers, current]);

  const toggleOption = useCallback(
    (option: string) => {
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
    },
    [current, isMulti],
  );

  // Keyboard navigation & option selection shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is inside an input or modal is open
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (e.key === "Escape") {
        setShowFinishModal(false);
        setShowNavPalette(false);
        return;
      }

      if (showFinishModal) return;

      if (e.key === "ArrowRight") {
        if (index < questions.length - 1) {
          setIndex((i) => i + 1);
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        if (index > 0) {
          setIndex((i) => i - 1);
        }
        return;
      }

      // Check option letter (A, B, C, D, E) or digit (1, 2, 3, 4, 5)
      const keyUpper = e.key.toUpperCase();
      if (!current) return;

      if (["A", "B", "C", "D", "E"].includes(keyUpper)) {
        const charIdx = keyUpper.charCodeAt(0) - 65;
        if (charIdx >= 0 && charIdx < current.options.length) {
          e.preventDefault();
          toggleOption(current.options[charIdx]);
        }
      } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
        const numIdx = parseInt(e.key, 10) - 1;
        if (numIdx >= 0 && numIdx < current.options.length) {
          e.preventDefault();
          toggleOption(current.options[numIdx]);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, index, questions.length, showFinishModal, toggleOption]);

  // Audio Speech TTS
  const toggleSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Tarayıcınız sesli okumayı desteklemiyor.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!current) return;
    window.speechSynthesis.cancel();

    const optionTexts = current.options
      .map((opt, i) => `${String.fromCharCode(65 + i)} şıkkı: ${opt}`)
      .join(". ");
    const speechText = `Soru ${index + 1}: ${current.text}. ${optionTexts}`;

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "tr-TR";
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [current, index, isSpeaking]);

  // Stop speech when changing question
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [index]);

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
        setShowFinishModal(false);
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
      toast.error("Bağlantı hatası oluştu.");
    } finally {
      setLoading(false);
    }
  }

  if (!questions.length) return null;

  if (result) {
    return (
      <div className="ap-exam-page max-w-2xl mx-auto py-12 px-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-8 backdrop-blur-xl shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sınav Tamamlandı</h2>
          <p className="text-4xl font-extrabold text-violet-400 mb-4">{result.score} Puan</p>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-lg mx-auto">{result.analysis}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-exam-suite-container min-h-[calc(100vh-140px)] flex flex-col justify-between max-w-4xl mx-auto px-4 py-6">
      {/* Top Header & Breadcrumb Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={`/deneme-sinavlari/${prepId}`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Konu yoluna dön</span>
          </Link>

          {/* Exam Title Badge */}
          <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs font-semibold text-violet-300">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="truncate max-w-[200px]">{title}</span>
          </div>

          {/* Question Palette Trigger & Question Counter */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNavPalette((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                showNavPalette
                  ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/25"
                  : "bg-zinc-900/80 hover:bg-zinc-800 border-white/10 text-zinc-300 hover:text-white",
              )}
              title="Tüm Soruları Göster"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>
                {index + 1} / {questions.length}
              </span>
            </button>
          </div>
        </div>

        {/* Glowing Progress Bar */}
        <div className="relative w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-violet-600 via-indigo-500 to-amber-400 transition-all duration-300 rounded-full shadow-[0_0_12px_rgba(124,108,247,0.6)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Navigator Drawer / Popover */}
      {showNavPalette ? (
        <div className="mt-3 p-4 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Soru Haritası
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                {answeredCount} / {questions.length} Cevaplandı
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowNavPalette(false)}
              className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {questions.map((q, qIdx) => {
              const hasAnswer =
                answers[q.id] &&
                (Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[]).length > 0
                  : Boolean(answers[q.id]));
              const isCurrent = qIdx === index;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setIndex(qIdx);
                    setShowNavPalette(false);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center h-10 rounded-xl text-xs font-bold transition-all relative",
                    isCurrent
                      ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-zinc-900 bg-violet-600 text-white shadow-md shadow-violet-500/40"
                      : hasAnswer
                        ? "bg-violet-500/20 text-violet-200 border border-violet-500/40 hover:bg-violet-500/30"
                        : "bg-zinc-800/80 text-zinc-400 border border-white/5 hover:bg-zinc-700/80 hover:text-white",
                  )}
                >
                  <span>{qIdx + 1}</span>
                  {hasAnswer && !isCurrent ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-0.5" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Main Question Card */}
      <div className="my-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161722]/90 to-[#101118]/90 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Subtle ambient light gradient glow */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Question Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-violet-600/20 border border-violet-500/30 text-xs font-bold tracking-wide text-violet-300">
                Soru {index + 1}
              </span>
              {isMulti ? (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25 text-[11px] font-semibold text-amber-300">
                  Çoklu Seçim
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-white/5 text-[11px] font-medium text-zinc-400">
                  Tek Seçimli
                </span>
              )}
            </div>

            {/* TTS Audio Read Button */}
            <button
              type="button"
              onClick={toggleSpeech}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                isSpeaking
                  ? "bg-violet-600 border-violet-400 text-white animate-pulse"
                  : "bg-zinc-800/60 hover:bg-zinc-700/80 border-white/10 text-zinc-300 hover:text-white",
              )}
              title="Soruyu Sesli Dinle"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Durdur</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Dinle</span>
                </>
              )}
            </button>
          </div>

          {/* Question Prompt */}
          <h2 className="text-lg sm:text-xl md:text-[1.35rem] font-medium text-zinc-100 leading-relaxed tracking-tight mb-8">
            {current.text}
          </h2>

          {/* Options Grid / List */}
          <div className="space-y-3">
            {current.options.map((option, optIndex) => {
              const letter = String.fromCharCode(65 + optIndex);
              const active = selected.includes(option);

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={cn(
                    "group w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-200 relative overflow-hidden border",
                    active
                      ? "bg-gradient-to-r from-violet-600/20 via-indigo-600/15 to-violet-600/10 border-violet-500 shadow-[0_0_24px_rgba(124,108,247,0.25)] text-white"
                      : "bg-[#13141d]/80 hover:bg-[#191a26]/90 border-white/10 hover:border-violet-500/40 text-zinc-200 hover:text-white",
                  )}
                >
                  {/* Left Letter Keycap */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-200",
                      active
                        ? "bg-violet-600 text-white shadow-md shadow-violet-500/40 scale-105"
                        : "bg-zinc-800/90 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-700/80 border border-white/5",
                    )}
                  >
                    {letter}
                  </div>

                  {/* Option Text */}
                  <span className="flex-1 text-sm sm:text-base font-normal leading-snug">
                    {option}
                  </span>

                  {/* Check Indicator */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 border",
                      active
                        ? "bg-violet-600 border-violet-400 text-white scale-100 opacity-100"
                        : isMulti
                          ? "rounded-md border-zinc-700 bg-zinc-800/50 opacity-40 group-hover:opacity-70"
                          : "border-zinc-700 bg-zinc-800/50 opacity-40 group-hover:opacity-70",
                    )}
                  >
                    {active ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Keyboard Helper Footer */}
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
            <span className="hidden sm:inline">
              Klavye ile seçim: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">A</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">B</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">C</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">D</kbd>
            </span>
            <span className="hidden sm:inline">
              Geçiş: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">→</kbd>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Action Dock */}
      <div className="sticky bottom-4 z-20">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl p-3 sm:p-4 shadow-2xl flex items-center justify-between gap-3">
          {/* Previous Button */}
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all",
              index === 0
                ? "opacity-30 cursor-not-allowed bg-zinc-800/50 text-zinc-500"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-white/5 shadow-sm active:scale-95",
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Önceki</span>
          </button>

          {/* Quick status & Drawer trigger */}
          <button
            type="button"
            onClick={() => setShowNavPalette((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="font-medium text-zinc-300">{answeredCount}</span>
            <span>/ {questions.length} yanıtlandı</span>
          </button>

          {/* Next / Finish Button */}
          {index < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 active:scale-95 transition-all"
            >
              <span>Sonraki</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => setShowFinishModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/40 hover:shadow-violet-600/60 active:scale-95 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Puanlanıyor…</span>
                </>
              ) : (
                <>
                  <Flag className="w-4 h-4" />
                  <span>Sınavı Bitir</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Finish Confirmation Modal */}
      {showFinishModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mb-4">
              <Flag className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Sınavı Bitirmek İstiyor musun?</h3>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Toplam <strong className="text-zinc-200">{questions.length}</strong> sorudan{" "}
              <strong className="text-violet-400">{answeredCount}</strong> tanesini yanıtladın.
              {answeredCount < questions.length ? (
                <span className="block mt-1 text-amber-400 font-medium">
                  {questions.length - answeredCount} soru boş bırakıldı.
                </span>
              ) : (
                <span className="block mt-1 text-emerald-400 font-medium">
                  Tüm soruları eksiksiz yanıtladın!
                </span>
              )}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void submit()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Değerlendiriliyor…</span>
                  </>
                ) : (
                  <span>Evet, Sınavı Bitir</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowFinishModal(false)}
                className="inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all"
              >
                Sorulara Dön
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Credit Gate Paywall Modal */}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Değerlendirme için yeterli kredin kalmadı. Yanıtların korundu."
        returnPath={`/deneme-sinavlari/${prepId}/deneme/${examId}`}
      />
    </div>
  );
}
