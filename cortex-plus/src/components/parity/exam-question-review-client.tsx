"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { ReviewTools } from "@/components/parity/review-tools";
import { cn } from "@/lib/utils";

type ReviewItem = {
  id: string;
  question_id: string;
  user_answer: string | null;
  is_correct: boolean;
  explanation: string | null;
  liked: boolean;
};

type QuestionItem = {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string | null;
  sort_order?: number;
};

export function ExamQuestionReviewClient({
  prepId,
  examId,
  examTitle,
  score,
  questions,
  reviews,
}: {
  prepId: string;
  examId: string;
  examTitle: string;
  score: number | null;
  questions: QuestionItem[];
  reviews: ReviewItem[];
}) {
  const [filter, setFilter] = useState<"all" | "correct" | "wrong">("all");

  const reviewMap = useMemo(() => {
    return new Map(reviews.map((r) => [r.question_id, r]));
  }, [reviews]);

  const stats = useMemo(() => {
    let correctCount = 0;
    let wrongCount = 0;
    for (const q of questions) {
      const r = reviewMap.get(q.id);
      if (r?.is_correct) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
    return {
      total: questions.length,
      correct: correctCount,
      wrong: wrongCount,
    };
  }, [questions, reviewMap]);

  const filteredQuestions = useMemo(() => {
    if (filter === "all") return questions;
    return questions.filter((q) => {
      const r = reviewMap.get(q.id);
      if (filter === "correct") return Boolean(r?.is_correct);
      return !r?.is_correct;
    });
  }, [filter, questions, reviewMap]);

  return (
    <div className="ap-exam-suite-container max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
        <Link
          href={`/deneme-sinavlari/${prepId}/sonuc?examId=${examId}${
            score != null ? `&score=${score}` : ""
          }`}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Sonuca dön</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href={`/deneme-sinavlari/${prepId}/deneme/${examId}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-semibold text-violet-300 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tekrar Çöz</span>
          </Link>
        </div>
      </div>

      {/* Header Summary Hero */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161722]/90 to-[#101118]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-300 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Soru Soru Çözüm Analizi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {examTitle}
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Soruların doğru cevaplarını ve Astra AI çözüm açıklamalarını incele.
            </p>
          </div>

          {/* Score Badge */}
          {score != null ? (
            <div className="flex-shrink-0 flex sm:flex-col items-center justify-center px-6 py-4 rounded-2xl bg-zinc-900/90 border border-white/10 text-center gap-2 sm:gap-0">
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                Sınav Puanı
              </span>
              <span className="text-3xl sm:text-4xl font-black text-violet-400">
                {score}
              </span>
            </div>
          ) : null}
        </div>

        {/* Filter Tabs & Quick Stats */}
        <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex p-1 rounded-xl bg-zinc-900/90 border border-white/10">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                filter === "all"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-zinc-400 hover:text-white",
              )}
            >
              Tüm Sorular ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilter("correct")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                filter === "correct"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-zinc-400 hover:text-emerald-400",
              )}
            >
              Doğrular ({stats.correct})
            </button>
            <button
              type="button"
              onClick={() => setFilter("wrong")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                filter === "wrong"
                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                  : "text-zinc-400 hover:text-rose-400",
              )}
            >
              Yanlışlar ({stats.wrong})
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {stats.correct} Doğru
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              {stats.wrong} Yanlış
            </span>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {filteredQuestions.map((question) => {
          const review = reviewMap.get(question.id);
          const options = question.options ?? [];
          const isCorrect = review?.is_correct ?? false;
          const explanation =
            review?.explanation ||
            `Doğru yanıt: ${question.correct_answer ?? "—"}`;
          const speakText = `${question.question_text}. ${explanation}`;

          // Find original index in all questions
          const displayNum = questions.findIndex((q) => q.id === question.id) + 1;

          return (
            <div
              key={question.id}
              className="rounded-3xl border border-white/10 bg-zinc-900/75 backdrop-blur-xl p-6 sm:p-7 shadow-xl space-y-5 relative overflow-hidden"
            >
              {/* Card Header: Question Number & Result Verdict */}
              <div className="flex items-center justify-between gap-3">
                <span className="px-3 py-1 rounded-lg bg-zinc-800 text-xs font-bold text-zinc-300">
                  Soru {displayNum}
                </span>

                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide",
                    isCorrect
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                      : "bg-rose-500/15 border border-rose-500/30 text-rose-400",
                  )}
                >
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Doğru Yanıt</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Yanlış / Boş</span>
                    </>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <h3 className="text-base sm:text-lg font-medium text-zinc-100 leading-relaxed">
                {question.question_text}
              </h3>

              {/* Options Breakdown */}
              <div className="space-y-2.5">
                {options.map((option, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx);
                  const isOptionCorrect = option === question.correct_answer;
                  const isOptionUserAnswer = option === review?.user_answer;

                  return (
                    <div
                      key={option}
                      className={cn(
                        "w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl text-left text-sm transition-all border",
                        isOptionCorrect
                          ? "bg-emerald-950/30 border-emerald-500/60 text-emerald-200 shadow-sm shadow-emerald-900/20"
                          : isOptionUserAnswer && !isOptionCorrect
                            ? "bg-rose-950/30 border-rose-500/60 text-rose-200 shadow-sm shadow-rose-900/20"
                            : "bg-zinc-800/40 border-white/5 text-zinc-400",
                      )}
                    >
                      {/* Letter badge */}
                      <div
                        className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                          isOptionCorrect
                            ? "bg-emerald-500 text-black font-extrabold"
                            : isOptionUserAnswer && !isOptionCorrect
                              ? "bg-rose-500 text-white font-extrabold"
                              : "bg-zinc-800 text-zinc-400",
                        )}
                      >
                        {letter}
                      </div>

                      <span className="flex-1 font-normal leading-snug">
                        {option}
                      </span>

                      {/* Status Badges */}
                      {isOptionCorrect ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                          Doğru Yanıt
                        </span>
                      ) : null}

                      {isOptionUserAnswer && !isOptionCorrect ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-bold">
                          Senin Yanıtın
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* AI Explanation & Tutor Insight Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
                      Astra AI Çözüm Açıklaması
                    </span>
                  </div>

                  {review ? (
                    <ReviewTools
                      text={speakText}
                      initialLiked={Boolean(review.liked)}
                      likeHref="/api/learning/exam/review-like"
                      likeBody={{ reviewId: review.id }}
                      copyLabel="Açıklama kopyalandı."
                      ariaLabel={`Soru ${displayNum} araçları`}
                    />
                  ) : null}
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed">
                  {explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
