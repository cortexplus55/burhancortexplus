"use client";

/** Oturumun çerçevesi: kayıt durumu, tek çıkış ×, çıkış özeti, bekleme ekranları, eğitmen, kredi kapısı. */
import { ExamNodeCoach } from "@/components/parity/exam-node-coach";
import { CreditGate } from "@/components/paywall/credit-gate";
import { cn } from "@/lib/utils";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function SaveStatus({ life }: { life: NodeLifecycle }) {
  const { stage, saveCursorRef, pendingSaves, saveError, draftRestored, answersRef, persistAnswers } = life;
  return (
    <>
      {/* Kayıt durumu (30 Ekim 2026): "kaydediliyor" yazısı her terminal sonuçta kalkar; düşen
          kaydın düğmesi kilitlenmez. Cevaplar bu arada tarayıcı taslağında. */}
      {pendingSaves > 0 && !saveError && stage === "play" ? <p role="status" className="text-sm">Cevapların kaydediliyor…</p> : null}
      {draftRestored > 0 && stage === "play" ? (
        <p role="status" className="text-sm">Kaydedilmemiş cevapların geri yüklendi.</p>
      ) : null}
      {saveError && stage === "play" ? <div role="alert" className="text-sm text-red-400">
        <p>{saveError}</p>
        <button type="button" className="underline"
          onClick={() => { void persistAnswers(answersRef.current, saveCursorRef.current).catch(() => undefined); }}>Kaydı yeniden dene</button>
      </div> : null}
    </>
  );
}

export function StudyBar({ life }: { life: NodeLifecycle }) {
  const { stage, isTimedExam, timeLeft, formatTimer, requestExit, cinematicLesson, cinematicPodcast, cinematicLoading, oralOwnsChrome } = life;
  return (
    <>
      {cinematicLesson || cinematicLoading || cinematicPodcast || oralOwnsChrome ? null : (
      // Astra'da oturumda tek çıkış sağ üstteki × (3 Ekim 2026); üst çubuk da yok.
      // × hiçbir durumda kilitlenmez (30 Ekim 2026): kayıt sürerken ya da düşmüşken de çıkılabilir.
      <div className="cp-exam-study-bar">
        {stage === "play" && isTimedExam ? (
          <span className={cn("cp-exam-timer", timeLeft < 120 && "cp-exam-timer--urgent")}>
            ⏱ {formatTimer(timeLeft)}
          </span>
        ) : null}
        <button type="button" className="cp-back-pill" aria-label="Oturumdan çık" onClick={requestExit}>
          ×
        </button>
      </div>
      )}
    </>
  );
}

export function ExitDialog({ life }: { life: NodeLifecycle }) {
  const { prepId, router, saveCursorRef, setExitPrompt, answersRef, persistAnswers, exitSummary } = life;
  return (
    <>
      {exitSummary ? (
        <div className="cp-oral-modal-back">
          <div className="cp-oral-modal" role="dialog" aria-modal="true" aria-labelledby="exit-save-title">
            <h2 id="exit-save-title">
              {exitSummary.unsaved ? "Bazı cevapların henüz kaydedilmedi" : "Bütün cevapların kaydedildi"}
            </h2>
            <p>
              {exitSummary.saved} cevap kaydedildi, {exitSummary.unsaved} cevap kaydedilemedi.
              {exitSummary.unsaved
                ? " Kaydedilemeyenler bu cihazda saklı; bu adımı yeniden açınca geri yüklenir."
                : null}
            </p>
            <div className="cp-oral-modal-actions">
              <button type="button" className="cp-oral-ghost" onClick={() => setExitPrompt(false)}>
                Geri dön
              </button>
              {exitSummary.unsaved ? (
                <button
                  type="button"
                  className="cp-oral-ghost"
                  onClick={() => void persistAnswers(answersRef.current, saveCursorRef.current).catch(() => undefined)}
                >
                  Kaydı yeniden dene
                </button>
              ) : null}
              <button type="button" className="cp-oral-cta" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
                Yine de çık
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function WaitScreens({ life }: { life: NodeLifecycle }) {
  const { prepId, router, meta, stage, gradingLate, retryGradingNow } = life;
  return (
    <>
      {stage === "grading" ? (
        <section className="cp-exam-setup cp-exam-restoring" aria-busy="true" aria-live="polite">
          <span className="cp-exam-restoring-spin" aria-hidden />
          <p className="cp-lesson-kicker">{meta.setupLabel}</p>
          <h1>Değerlendiriliyor…</h1>
          <p className="text-sm text-[var(--cp-muted)]">
            Sonuç hazır olunca burada görünecek. Cevapların bu cihazda da saklı; ücret yeniden alınmaz.
          </p>
          {gradingLate ? (
            <>
              <p className="text-sm text-[var(--cp-muted)]" role="status">
                Değerlendirme beklenenden uzun sürüyor. Çalışma yoluna dönebilirsin; sonuç bu adımın
                sonuç sayfasında da görünür.
              </p>
              <button type="button" className="cp-exam-continue cp-exam-continue--primary" onClick={() => void retryGradingNow()}>
                Yeniden dene
              </button>
            </>
          ) : null}
          <button type="button" className="cp-exam-continue" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
            Çalışma yoluna dön
          </button>
        </section>
      ) : null}

      {stage === "restoring" ? (
        <section className="cp-exam-setup cp-exam-restoring" aria-busy="true" aria-live="polite">
          <span className="cp-exam-restoring-spin" aria-hidden />
          <p className="cp-lesson-kicker">Devam</p>
          <h1>Kaldığın yer açılıyor…</h1>
          <p className="text-sm text-[var(--cp-muted)]">
            Kaydedilmiş cevapların yükleniyor. Yeniden ücret alınmaz — yarım kalan
            oturum güvenle sürer.
          </p>
          <p className="text-xs text-[var(--cp-muted)]" role="status">
            Bu ekran boş değil; kısa süre sonra sorulara döneceksin.
          </p>
        </section>
      ) : null}
    </>
  );
}

export function SessionCoach({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, payload, index, tutorMessages, setTutorMessages, cardIndex, coachItem, showCoach, markHint } = life;
  return (
    <>
      {showCoach && coachItem ? (
        <ExamNodeCoach
          prepId={prepId}
          nodeId={nodeId}
          itemText={coachItem}
          returnPath={`/deneme-sinavlari/${prepId}`}
          onUsed={markHint}
          messages={tutorMessages}
          onMessagesChange={setTutorMessages}
          questionIndex={payload.type === "cards" ? cardIndex : index}
        />
      ) : null}
    </>
  );
}

export function SessionCreditGate({ life }: { life: NodeLifecycle }) {
  const { prepId, gateCopy, paywall, setPaywall, paywallGate } = life;
  return (
    <>
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message={paywallGate?.message ?? gateCopy.message}
        beyondFreeDaily={(paywallGate ?? gateCopy).beyondFreeDaily}
        meter={(paywallGate ?? gateCopy).meter}
        action={paywallGate?.action}
        actionLabel={paywallGate?.actionLabel}
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </>
  );
}
