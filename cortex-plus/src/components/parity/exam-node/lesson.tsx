"use client";

/** Ders: adım adım ders (LessonV3) ya da eski düz metin. */
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import type { GradeCheckResult, LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { NodeSources } from "@/components/parity/node-sources";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function LessonPlay({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, language, sources, activityMinutes, router, stage, loading, payload, attemptId, finish, structuredLesson, lessonBuilding } = life;
  return (
    <>
      {stage === "play" && payload.type === "lesson" ? (
        structuredLesson ? (
          // Yapısal ders adım adım gelir: her bölüm kendi kontrolüyle
          // biter ve öğrenci cevaplamadan ilerleyemez.
          <ExamLessonSteps
            lesson={structuredLesson}
            building={lessonBuilding}
            upcoming={lessonBuilding ? (payload.upcoming ?? []) : []}
            plannedScreens={lessonBuilding ? (payload.plannedScreens ?? null) : null}
            plannedMinutes={activityMinutes}
            language={language}
            gradeCheck={
              attemptId
                ? async (sectionIndex, answer, variant = "primary") => {
                    const res = await fetch("/api/learning/exam-prep/node", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        prepId,
                        nodeId,
                        attemptId,
                        action: "grade-check",
                        sectionIndex,
                        variant,
                        checkAnswer: answer,
                      }),
                    });
                    const data = (await res.json().catch(() => ({}))) as GradeCheckResult & {
                      ok?: boolean;
                      error?: string;
                    };
                    if (!res.ok) {
                      throw new Error(data.error ?? "grade_failed");
                    }
                    return data;
                  }
                : undefined
            }
            onFinish={(missed, lessonAnswers, retryAnswers) => {
              const indexes = (missed ?? []).filter((index) => Number.isInteger(index));
              const payloadAnswers: Record<string, unknown> = {};
              if (indexes.length) payloadAnswers.lessonMisses = indexes;
              if (lessonAnswers && Object.keys(lessonAnswers).length) {
                payloadAnswers.lessonAnswers = lessonAnswers as Record<string, LessonCheckAnswer>;
              }
              if (retryAnswers && Object.keys(retryAnswers).length) {
                payloadAnswers.retryAnswers = retryAnswers as Record<string, LessonCheckAnswer>;
              }
              return finish(Object.keys(payloadAnswers).length ? payloadAnswers : undefined);
            }}
            onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
            toolbar={sources.length ? <NodeSources sources={sources} /> : null}
            sourceDocs={sources}
          />
        ) : (
          <section>
            <h1>{payload.title}</h1>
            <ExamLessonBody content={payload.contentMd ?? ""} />
            <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} aria-busy={loading} onClick={() => void finish()}>
              {loading ? "Kaydediliyor…" : "Bitir"}
            </button>
          </section>
        )
      ) : null}
    </>
  );
}
