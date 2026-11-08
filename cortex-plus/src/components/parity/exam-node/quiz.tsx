"use client";

/** Test (konu testi, zayıf nokta, son kontrol, yazılı deneme): soru soru. */
import { useState } from "react";
import { ScratchPad } from "@/components/parity/scratch-pad";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { sanitizeStudentCopy } from "@/lib/learning/student-copy";
import { NodeSources } from "@/components/parity/node-sources";
import { QuestionReportButton } from "@/components/learning/question-report-button";
import { TwinQuestionCard } from "@/components/learning/twin-question-card";
import { TwoOptionHint } from "@/components/learning/two-option-hint";
import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function QuizPlay({ life }: { life: NodeLifecycle }) {
  const { sources, stage, loading, payload, setPayload, attemptId, markHint, index, setIndex, answers, revealedRef, lockAnswer, isTimedExam, finish, updateAnswer, questions, quizBuilding, mood } = life;
  // Koç katmanı (7 Kasım 2026): bu sorudan önceki art arda doğrular (yalnız kilitlenmiş cevaplar) ve bu soruda ipucu.
  const [hintAt, setHintAt] = useState<Record<string, boolean>>({});
  let streakBefore = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    const question = questions[at];
    const key = String(at);
    if (!question?.correct?.length || !revealedRef.current.has(key)) break;
    if (!sameOptionSet(selectedOptions(answers[key]), question.correct)) break;
    streakBefore += 1;
  }
  return (
    <>
      {stage === "play" && payload.type === "quiz" && questions[index] ? (
        <div className="cp-written-review">
          {!isTimedExam ? <NodeSources sources={sources} /> : null}
          {isTimedExam ? (
            <p className="cp-exam-silence">
              Yardım kapalı. Süre bitince cevapların gider. Açıklama sınav sonunda.
            </p>
          ) : payload.uncoveredTopics?.length ? (
            <p className="cp-exam-silence">
              Şu konular bu turda yok: {payload.uncoveredTopics.join(", ")}.
            </p>
          ) : null}
          <ScratchPad />
          <ExamQuizPlay
            questions={questions.map((question) => ({
              text: sanitizeStudentCopy(question.text ?? ""),
              options: (question.options ?? []).map((option) => sanitizeStudentCopy(option)),
              multi: Boolean(question.multi),
              correct: isTimedExam ? undefined : question.correct,
              explanation: isTimedExam ? undefined : question.explanation,
              optionWhy: isTimedExam ? undefined : question.optionWhy,
              steps: isTimedExam ? undefined : question.steps,
              misconceptionTag: isTimedExam ? undefined : question.misconceptionTag,
              voided: isTimedExam ? undefined : question.voided,
              keyFixed: isTimedExam ? undefined : question.keyFixed,
            }))}
            index={index}
            plannedTotal={quizBuilding ? payload.promised : undefined}
            value={answers[String(index)]}
            onChange={(value) => updateAnswer(String(index), value)}
            onReveal={() => lockAnswer(String(index))}
            locked={revealedRef.current.has(String(index))}
            streakBefore={isTimedExam ? 0 : streakBefore}
            mood={isTimedExam ? null : mood}
            usedHint={Boolean(hintAt[String(index)])}
            onContinue={() => {
              if (index + 1 < questions.length) {
                setIndex(index + 1);
                return;
              }
              if (quizBuilding) return;
              void finish();
            }}
            continueLabel={
              index + 1 < questions.length
                ? "Sonraki soru"
                : quizBuilding
                  ? "Devam et"
                  : isTimedExam
                    ? "Sınavı bitir"
                    : "Testi bitir"
            }
            disabled={loading}
            examMode={isTimedExam}
            twin={
              // İkiz soru ve iki şık ipucu (31 Ekim 2026, Paket J3 #12): yalnız açıklamalı testte.
              attemptId && !isTimedExam ? (at) => <TwinQuestionCard key={`twin:${attemptId}:${at}`} attemptId={attemptId} index={at} /> : undefined
            }
            twoOption={
              attemptId && !isTimedExam && !quizBuilding
                ? (at) => (
                    <TwoOptionHint
                      key={`two:${attemptId}:${at}`}
                      attemptId={attemptId}
                      index={at}
                      options={questions[at]?.options ?? []}
                      onUsed={() => {
                        markHint();
                        setHintAt((current) => ({ ...current, [String(at)]: true }));
                      }}
                    />
                  )
                : undefined
            }
            report={
              // "🚩 Soruda hata bildir" (31 Ekim 2026, Paket J2 #10): açıklama açılınca; test yazılırken değil.
              attemptId && !isTimedExam && !quizBuilding
                ? (at) => (
                    <QuestionReportButton
                      key={`${attemptId}:${at}`}
                      source="node"
                      targetId={attemptId}
                      questionRef={String(at)}
                      onResolved={(result) => {
                        if (!result.question) return;
                        const fixed = result.question;
                        setPayload((current) =>
                          current.type === "quiz" && current.questions
                            ? { ...current, questions: current.questions.map((row, i) => (i === at ? { ...row, ...fixed } : row)) }
                            : current,
                        );
                      }}
                    />
                  )
                : undefined
            }
          />
        </div>
      ) : null}
    </>
  );
}
