"use client";

/** Test (konu testi, zayıf nokta, son kontrol, yazılı deneme): soru soru. */
import { ScratchPad } from "@/components/parity/scratch-pad";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { sanitizeStudentCopy } from "@/lib/learning/student-copy";
import { NodeSources } from "@/components/parity/node-sources";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function QuizPlay({ life }: { life: NodeLifecycle }) {
  const { sources, stage, loading, payload, index, setIndex, answers, revealedRef, isTimedExam, finish, updateAnswer, questions, quizBuilding } = life;
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
            }))}
            index={index}
            value={answers[String(index)]}
            onChange={(value) => updateAnswer(String(index), value)}
            onReveal={() => revealedRef.current.add(String(index))}
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
          />
        </div>
      ) : null}
    </>
  );
}
