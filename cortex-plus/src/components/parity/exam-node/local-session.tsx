"use client";

/** Kayıtlardan kurulan adımlar: kayıtlı soru yok / kilitli ve hazır olma ekranı. */
import { ExamReadinessScreen } from "@/components/parity/exam-readiness-screen";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function LocalSessionPlay({ life }: { life: NodeLifecycle }) {
  const { prepId, router, meta, stage, loading, payload, finish } = life;
  return (
    <>
      {stage === "play" && payload.type === "practice_empty" ? (
        <section className="cp-practice-empty">
          <p className="cp-lesson-kicker">{meta.setupLabel}</p>
          <h1>{payload.locked ? "🔒 Henüz kilitli" : "Kayıtlı soru yok"}</h1>
          <p>{payload.message}</p>
          <button type="button" className="cp-exam-continue" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
            Çalışma yoluna dön
          </button>
          {payload.locked ? null : (
            <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} onClick={() => void finish()}>
              Bu adımı tamamla
            </button>
          )}
        </section>
      ) : null}

      {stage === "play" && payload.type === "readiness" && payload.screen ? (
        <ExamReadinessScreen
          screen={payload.screen}
          continuing={loading}
          onContinue={() => void finish()}
        />
      ) : null}
    </>
  );
}

export function LocalSessionResult({ life }: { life: NodeLifecycle }) {
  const { stage, payload, nextHref } = life;
  return (
    <>
      {stage === "result" && payload.type === "readiness" && payload.screen ? (
        <ExamReadinessScreen screen={payload.screen} nextHref={nextHref} />
      ) : null}

      {stage === "result" && payload.type === "practice_empty" ? (
        <section className="cp-practice-empty">
          <h1>Bu adım kaydedildi</h1>
          <p>{payload.message}</p>
          <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            Devam et
          </a>
        </section>
      ) : null}
    </>
  );
}
