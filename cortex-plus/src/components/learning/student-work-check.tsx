"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleDot, Eye, PenLine, ShieldAlert, X } from "lucide-react";
import { useDismiss } from "@/lib/ui/use-dismiss";
import type { SolveDone } from "@/lib/solve/solve-client";
import { CHECK_STATE_TITLE, lineMark, lineNote, type StudentCheck } from "@/lib/solve/student-work";

/*
  El yazısı çözüm kontrolünün kartı (21 Kasım 2026, `teacher.v2`). Öğrencinin kendi satırları kâğıttaki sırayla:
  ✓ doğru, ✗ hatalı, · değerlendirilmedi; ilk hatalı satır vurgulu ve altında türü. Sonra tek cümle açıklama ve tek
  yönlendirici soru. Doğru cevap bu kartta yok: "Doğrusunu göster" deyince çözüm kartın altında açılır
  (`SolutionView`). Soru çöz sayfası ve sohbet aynı kartı çizer.
*/

export type StudentWorkCheckCardProps = {
  /** Çözücünün bitmiş durumu; `phase.solution.check` dolu olmalı. */
  phase: SolveDone;
  check: StudentCheck;
  imageSrc?: string | null;
  /** Doğru çözüm açıldı mı (düğme gizlenir). */
  revealed: boolean;
  onReveal: () => void;
};

const STATE_ICON = {
  correct: CheckCircle2,
  error: PenLine,
  incomplete: CircleDot,
  no_work: ShieldAlert,
} as const;

export function StudentWorkCheckCard({ phase, check, imageSrc, revealed, onReveal }: StudentWorkCheckCardProps) {
  const { solution } = phase;
  const [lightbox, setLightbox] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDismiss(lightbox, () => setLightbox(false), { initialFocus: closeRef });
  const Icon = STATE_ICON[check.state];
  const firstLine = check.firstError?.line ?? null;

  return (
    <section className="cp-solver-check" data-state={check.state} aria-label="Çözüm kontrolü">
      <header className="cp-solver-readback">
        {imageSrc ? (
          <button type="button" className="cp-solver-thumb" onClick={() => setLightbox(true)} aria-label="Fotoğrafı büyüt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt="" />
          </button>
        ) : null}
        <div className="cp-solver-readback-body">
          <div className="cp-solver-readback-meta">
            {solution.subject ? <span className="cp-solver-subject">{solution.subject}</span> : null}
            <span className="cp-solver-time">{Math.max(1, Math.round(phase.ms / 1000))} sn</span>
          </div>
          <p className="cp-solver-readback-label">Soruyu böyle okudum</p>
          <p className="cp-solver-readback-q">{solution.question}</p>
          {solution.options.length ? (
            <ul className="cp-solver-readback-opts">
              {solution.options.map((option) => (
                <li key={option.letter}>
                  <span>{option.letter}</span>
                  {option.text}
                </li>
              ))}
            </ul>
          ) : null}
          {solution.criticalWords?.length ? (
            <p className="cp-solver-flags">
              {solution.criticalWords.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </p>
          ) : null}
        </div>
      </header>

      <div className="cp-solver-check-card">
        <p className="cp-solver-check-badge" data-state={check.state}>
          <Icon aria-hidden /> {CHECK_STATE_TITLE[check.state]}
        </p>

        {check.lines.length ? (
          <ol className="cp-solver-check-lines" aria-label="Senin çözüm satırların">
            {check.lines.map((step) => {
              const { mark, label } = lineMark(step.status);
              const first = step.n === firstLine;
              const note = lineNote(step);
              return (
                <li key={step.n} data-status={step.status} data-first={first || undefined}>
                  <span className="cp-solver-check-mark" aria-hidden>
                    {mark}
                  </span>
                  <div className="cp-solver-check-line">
                    <span className="cp-solver-check-n">{step.n}. satır</span>
                    <span className="cp-solver-check-text">{step.text}</span>
                    <span className="sr-only">{first ? `${label}, ilk hata` : label}</span>
                    {note ? <span className="cp-solver-check-note">{note}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        <p className="cp-solver-check-explain">{check.explanation}</p>
        {check.question ? (
          <p className="cp-solver-check-question">
            <span aria-hidden>🤔</span> {check.question}
          </p>
        ) : null}
        {phase.status === "uncertain" ? (
          <p className="cp-solver-note">Doğru cevaptan tam emin değiliz; kontrolü kitabınla da karşılaştır.</p>
        ) : phase.status === "revised" ? (
          <p className="cp-solver-note">Denetimde doğru çözüm düzeltildi; kontrol buna göre yenilendi.</p>
        ) : null}

        {!revealed ? (
          <button type="button" className="cp-solver-secondary cp-solver-reveal" onClick={onReveal}>
            <Eye aria-hidden /> {check.state === "correct" ? "Örnek çözümü gör" : "Doğrusunu göster"}
          </button>
        ) : null}
      </div>

      {lightbox && imageSrc ? (
        <div
          className="cp-solver-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Soru fotoğrafı"
          onClick={() => setLightbox(false)}
        >
          <button
            ref={closeRef}
            type="button"
            className="cp-solver-lightbox-close"
            aria-label="Kapat"
            onClick={() => setLightbox(false)}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Soru fotoğrafı" />
        </div>
      ) : null}
    </section>
  );
}
