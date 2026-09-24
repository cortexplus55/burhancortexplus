"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CornerDownLeft, X } from "lucide-react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { LessonDiagramView } from "@/components/parity/lesson-diagram";
import {
  calloutTone,
  checkPresentation,
  reviewGateLead,
  trueFalseIndexes,
} from "@/lib/learning/lesson-chrome";
import { rephraseSectionCheck, type MaterialLanguage } from "@/lib/learning/teacher-brain";
import "@/styles/exam-lesson-steps.css";

/**
 * Dersi adım adım göster.
 *
 * Her adım kendi slaytı: anlatım, gömülü doğru/yanlış ya da hızlı sınav,
 * ardından açıklama. Yanlışlar dersin sonunda bir kez daha sorulur.
 */

function RichBody({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]{1,80}\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="als-term">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Step =
  | { kind: "overview"; heading: string; body: string }
  | {
      kind: "section";
      heading: string;
      body: string;
      check?: LessonV2["sections"][number]["check"];
      note?: LessonV2["sections"][number]["note"];
      diagram?: LessonV2["sections"][number]["diagram"];
      cards?: LessonV2["sections"][number]["cards"];
      sectionIndex: number;
    }
  | { kind: "example"; heading: string; prompt: string; solution: string }
  | { kind: "mistake"; heading: string; claim: string; correction: string }
  | { kind: "summary"; heading: string; points: string[]; next: string[] }
  | { kind: "review-gate"; count: number }
  | {
      kind: "retry";
      heading: string;
      check: NonNullable<LessonV2["sections"][number]["check"]>;
    };

function buildSteps(lesson: LessonV2): Step[] {
  const steps: Step[] = [
    { kind: "overview", heading: lesson.title, body: lesson.overview },
    ...lesson.sections.map(
      (s, sectionIndex): Step => ({
        kind: "section",
        heading: s.heading,
        body: s.body,
        check: s.check,
        note: s.note,
        diagram: s.diagram,
        cards: s.cards,
        sectionIndex,
      }),
    ),
  ];
  if (lesson.example.prompt.trim()) {
    steps.push({
      kind: "example",
      heading: "Örnek",
      prompt: lesson.example.prompt,
      solution: lesson.example.solution,
    });
  }
  if (lesson.commonMistake.claim.trim()) {
    steps.push({
      kind: "mistake",
      heading: "Sık yapılan hata",
      claim: lesson.commonMistake.claim,
      correction: lesson.commonMistake.correction,
    });
  }
  steps.push({
    kind: "summary",
    heading: "Özet",
    points: lesson.summary,
    next: lesson.nextFocus,
  });
  return steps;
}

export function ExamLessonSteps({
  lesson,
  language = "tr",
  onFinish,
  onClose,
  closeHref,
}: {
  lesson: LessonV2;
  /** Hazırlığın dili. Tekrar sorusu bu dilde yeniden kurulur. */
  language?: MaterialLanguage;
  onFinish?: () => void;
  onClose?: () => void;
  closeHref?: string;
}) {
  const base = useMemo(() => buildSteps(lesson), [lesson]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  /** Yanlış cevaplanan bölümlerin sırası — tekrar kuyruğunu bunlar doğurur. */
  const [missed, setMissed] = useState<number[]>([]);

  const steps = useMemo(() => {
    const retries = missed
      .map((sectionIndex) => {
        const section = lesson.sections[sectionIndex];
        return section?.check
          ? ({
              kind: "retry",
              heading: section.heading,
              check: rephraseSectionCheck(section.check, language),
            } as Step)
          : null;
      })
      .filter((s): s is Step => s !== null);
    if (!retries.length) return base;
    return [...base, { kind: "review-gate", count: retries.length } as Step, ...retries];
  }, [base, missed, lesson, language]);

  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const check =
    step.kind === "section" ? step.check : step.kind === "retry" ? step.check : undefined;
  const mustAnswer = Boolean(check) && !revealed;
  const presentation = check ? checkPresentation(check) : null;
  const tf = check && presentation === "trueFalse" ? trueFalseIndexes(check.options) : null;
  const correct = Boolean(check && revealed && picked === check.answerIndex);

  function resetAnswer() {
    setPicked(null);
    setRevealed(false);
    setSolutionShown(false);
    setCardIndex(0);
  }

  function go(nextIndex: number) {
    setIndex(nextIndex);
    resetAnswer();
  }

  function next() {
    if (last) {
      onFinish?.();
      return;
    }
    go(index + 1);
  }

  function back() {
    if (index > 0) {
      go(index - 1);
      return;
    }
    onClose?.();
  }

  function pick(optionIndex: number) {
    if (!check || revealed) return;
    setPicked(optionIndex);
    setRevealed(true);
    if (
      step.kind === "section" &&
      optionIndex !== check.answerIndex &&
      !missed.includes(step.sectionIndex)
    ) {
      setMissed((prev) => [...prev, step.sectionIndex]);
    }
  }

  const closeControl =
    onClose ? (
      <button type="button" className="als-icon" onClick={onClose} aria-label="Kapat">
        <X className="h-4 w-4" />
      </button>
    ) : closeHref ? (
      <Link href={closeHref} className="als-icon" aria-label="Kapat">
        <X className="h-4 w-4" />
      </Link>
    ) : null;

  return (
    <article className="als">
      <header className="als-top">
        {index > 0 || onClose ? (
          <button type="button" className="als-icon" onClick={back} aria-label="Geri">
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : closeHref ? (
          <Link href={closeHref} className="als-icon" aria-label="Geri">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="als-icon als-icon--ghost" aria-hidden />
        )}
        <div className="als-segments" aria-hidden>
          {steps.map((_, segment) => (
            <span key={segment} className={segment <= index ? "is-on" : undefined} />
          ))}
        </div>
        <p className="als-count" aria-live="polite">
          {index + 1} / {steps.length}
        </p>
        {closeControl ?? <span className="als-icon als-icon--ghost" aria-hidden />}
      </header>

      {step.kind === "review-gate" ? (
        <div className="als-slide">
          <p className="als-kicker">TEKRARLA</p>
          <h1 className="als-heading">Bitirmeden önce kısa tekrar</h1>
          <p className="als-body">{reviewGateLead(step.count)}</p>
        </div>
      ) : null}

      {step.kind === "retry" ? <p className="als-kicker">TEKRARLA</p> : null}

      {step.kind !== "review-gate" ? (
        <div className={step.kind === "overview" || step.kind === "section" ? "als-slide" : undefined}>
          <h1 className="als-heading">{step.heading}</h1>

          {step.kind === "overview" || step.kind === "section" ? (
            <p className="als-body">
              <RichBody text={step.body} />
            </p>
          ) : null}

          {step.kind === "section" && step.cards && step.cards.length >= 2 ? (
            <div className="als-carousel">
              <div className="als-carousel-row">
                {step.cards.slice(cardIndex, cardIndex + 2).map((card) => (
                  <article key={card.title} className="als-card">
                    <h2>{card.title}</h2>
                    <p>{card.body}</p>
                  </article>
                ))}
                {step.cards[cardIndex + 2] ? (
                  <article className="als-card als-card--peek" aria-hidden>
                    <h2>{step.cards[cardIndex + 2].title}</h2>
                  </article>
                ) : null}
              </div>
              <div className="als-carousel-nav">
                <button
                  type="button"
                  className="als-icon"
                  aria-label="Önceki kart"
                  disabled={cardIndex === 0}
                  onClick={() => setCardIndex((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="als-icon"
                  aria-label="Sonraki kart"
                  disabled={cardIndex >= step.cards.length - 2}
                  onClick={() =>
                    setCardIndex((value) =>
                      Math.min(step.cards!.length - 2, value + 1),
                    )
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {step.kind === "section" && step.diagram ? (
            <LessonDiagramView diagram={step.diagram} id={`als-d-${index}`} />
          ) : null}

          {step.kind === "section" && step.note ? (
            <aside className={`als-note als-note--${calloutTone(step.note)}`}>
              <p className="als-note-title">{step.note.title}</p>
              <p className="als-note-body">
                <RichBody text={step.note.body} />
              </p>
            </aside>
          ) : null}

          {step.kind === "example" ? (
            <>
              <p className="als-body">{step.prompt}</p>
              {solutionShown ? (
                <div className="als-solution">
                  <span className="als-tag">Çözüm</span>
                  <p>{step.solution}</p>
                </div>
              ) : (
                <button
                  type="button"
                  className="als-secondary"
                  onClick={() => setSolutionShown(true)}
                >
                  Çözümü göster
                </button>
              )}
            </>
          ) : null}

          {step.kind === "mistake" ? (
            <div className="als-mistake">
              <p className="als-mistake-claim">
                <span className="als-tag als-tag--warn">Yanlış</span>
                {step.claim}
              </p>
              <p className="als-mistake-fix">
                <span className="als-tag als-tag--ok">Doğrusu</span>
                {step.correction}
              </p>
            </div>
          ) : null}

          {step.kind === "summary" ? (
            <>
              <ul className="als-list">
                {step.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {step.next.length ? (
                <>
                  <h2 className="als-subhead">Sırada ne var</h2>
                  <ul className="als-list als-list--muted">
                    {step.next.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {check && presentation === "trueFalse" ? (
        <section
          className={[
            "als-check",
            revealed ? (correct ? "is-right" : "is-wrong") : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Doğru mu yanlış mı"
        >
          <p className="als-kicker">DOĞRU MU YANLIŞ MI?</p>
          <p className="als-check-prompt">{check.prompt}</p>
          {!revealed ? (
            <div className="als-tf">
              {tf ? (
                <>
                  <button type="button" className="als-tf-btn" onClick={() => pick(tf.wrong)}>
                    Yanlış
                  </button>
                  <button type="button" className="als-tf-btn" onClick={() => pick(tf.right)}>
                    Doğru
                  </button>
                </>
              ) : (
                check.options.map((option, optionIndex) => (
                  <button
                    key={option}
                    type="button"
                    className="als-tf-btn"
                    onClick={() => pick(optionIndex)}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {revealed ? <Explanation check={check} picked={picked} revisit={step.kind === "section"} /> : null}
        </section>
      ) : null}

      {check && presentation === "quickQuiz" ? (
        <section className="als-check" aria-label="Hızlı sınav">
          <p className="als-kicker">HIZLI SINAV</p>
          <p className="als-check-prompt">{check.prompt}</p>
          <div className="als-options">
            {check.options.map((option, optionIndex) => {
              const isAnswer = optionIndex === check.answerIndex;
              const isPicked = picked === optionIndex;
              const state = !revealed
                ? isPicked
                  ? "is-picked"
                  : undefined
                : isAnswer
                  ? "is-right"
                  : isPicked
                    ? "is-wrong"
                    : undefined;
              return (
                <button
                  key={option}
                  type="button"
                  className={["als-option", state].filter(Boolean).join(" ")}
                  disabled={revealed}
                  aria-pressed={isPicked}
                  onClick={() => pick(optionIndex)}
                >
                  <span className="als-option-num" aria-hidden>
                    {optionIndex + 1}
                  </span>
                  <span>{option}</span>
                  {revealed && isAnswer ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                  ) : revealed && isPicked && !isAnswer ? (
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <span className="als-radio" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          {revealed ? <Explanation check={check} picked={picked} revisit={step.kind === "section"} /> : null}
        </section>
      ) : null}

      {revealed && check ? (
        <div className={correct ? "als-feedback is-right" : "als-feedback is-wrong"} role="status">
          <span>{correct ? "🎉 Doğru" : "🤔 Yanlış"}</span>
          <button type="button" className="als-cta als-cta--inline" onClick={next}>
            Devam et <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : mustAnswer ? null : (
        <button type="button" className="als-cta" onClick={next}>
          {last ? "Dersi bitir" : "Devam et"}
          <CornerDownLeft className="h-4 w-4" aria-hidden />
        </button>
      )}
    </article>
  );
}

function Explanation({
  check,
  picked,
  revisit,
}: {
  check: NonNullable<LessonV2["sections"][number]["check"]>;
  picked: number | null;
  revisit: boolean;
}) {
  const wrong = picked !== check.answerIndex;
  return (
    <div className="als-explain">
      <p className="als-explain-kicker">AÇIKLAMA</p>
      <p>{check.explanation}</p>
      {wrong && revisit ? (
        <p className="als-revisit">Dersin sonunda buna geri döneceğiz.</p>
      ) : null}
    </div>
  );
}
