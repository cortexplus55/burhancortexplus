"use client";

/** Ders: adım adım ders (LessonV3) ya da eski düz metin. */
import { ExamLessonBodyLazy } from "@/components/parity/exam-lesson-body-lazy";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import type { LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { NodeSources } from "@/components/parity/node-sources";
import { readNoteWarnings } from "@/lib/learning/formula-typos";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function LessonPlay({ life }: { life: NodeLifecycle }) {
  const { prepId, language, sources, activityMinutes, router, stage, loading, payload, attemptId, finish, structuredLesson, lessonBuilding, gradeLessonCheck, reexplainStep } = life;
  return (
    <>
      {stage === "play" && payload.type === "lesson" ? (
        structuredLesson ? (
          <>
          {/* Stream-first (3 Kasım 2026): denetim ilk ekranı düzelttiyse tek satırlık sakin not. */}
          {lessonBuilding && (payload as { previewCorrected?: boolean }).previewCorrected ? (
            <p className="als-time-chip" role="status">İlk ekran kontrol edildi ve güncellendi.</p>
          ) : null}
          {/* Yapısal ders adım adım gelir: her bölüm kendi kontrolüyle biter ve öğrenci cevaplamadan ilerleyemez. */}
          <ExamLessonSteps
            lesson={structuredLesson}
            building={lessonBuilding}
            upcoming={lessonBuilding ? (payload.upcoming ?? []) : []}
            plannedScreens={lessonBuilding ? (payload.plannedScreens ?? null) : null}
            writingDone={lessonBuilding && payload.writingDone === true}
            noteWarnings={readNoteWarnings(payload.noteWarnings)}
            plannedMinutes={activityMinutes}
            language={language}
            gradeCheck={attemptId ? gradeLessonCheck : undefined}
            onReexplain={reexplainStep}
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
          </>
        ) : (
          <section>
            <h1>{payload.title}</h1>
            <ExamLessonBodyLazy content={payload.contentMd ?? ""} />
            <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} aria-busy={loading} onClick={() => void finish()}>
              {loading ? "Kaydediliyor…" : "Bitir"}
            </button>
          </section>
        )
      ) : null}
    </>
  );
}
