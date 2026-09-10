"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import "@/styles/exam-lesson-steps.css";

/**
 * Dersi adım adım göster.
 *
 * Ders tek bir kaydırma olarak sunuluyordu: öğrenci baştan sona okuyor, anlayıp
 * anlamadığını ancak en sonda öğreniyordu. Bölümlere ayırıp her bölümün sonuna
 * kendi kontrolünü koymak yanlış anlamayı okunduğu yerde yakalıyor.
 *
 * İçerik zaten böyle üretiliyordu; kaybolduğu yer depolamaydı.
 */

type Step =
  | { kind: "overview"; heading: string; body: string }
  | {
      kind: "section";
      heading: string;
      body: string;
      check?: LessonV2["sections"][number]["check"];
    }
  | { kind: "example"; heading: string; prompt: string; solution: string }
  | { kind: "mistake"; heading: string; claim: string; correction: string }
  | { kind: "summary"; heading: string; points: string[]; next: string[] };

function buildSteps(lesson: LessonV2): Step[] {
  const steps: Step[] = [
    { kind: "overview", heading: lesson.title, body: lesson.overview },
    ...lesson.sections.map(
      (s): Step => ({
        kind: "section",
        heading: s.heading,
        body: s.body,
        check: s.check,
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
  onFinish,
}: {
  lesson: LessonV2;
  onFinish?: () => void;
}) {
  const steps = useMemo(() => buildSteps(lesson), [lesson]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);

  const step = steps[index];
  const last = index === steps.length - 1;
  const check = step.kind === "section" ? step.check : undefined;
  const mustAnswer = Boolean(check) && !revealed;

  function next() {
    if (last) {
      onFinish?.();
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
    setRevealed(false);
    setSolutionShown(false);
  }

  return (
    <article className="als">
      <div className="als-progress" aria-hidden>
        <div
          className="als-progress-fill"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>
      <p className="als-count" aria-live="polite">
        {index + 1} / {steps.length}
      </p>

      <h1 className="als-heading">{step.heading}</h1>

      {step.kind === "overview" || step.kind === "section" ? (
        <p className="als-body">{step.body}</p>
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

      {check ? (
        <section className="als-check" aria-label="Bölüm kontrolü">
          <p className="als-check-kicker">Kısa kontrol</p>
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
                  onClick={() => {
                    setPicked(optionIndex);
                    setRevealed(true);
                  }}
                >
                  <span>{option}</span>
                  {revealed && isAnswer ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                  ) : null}
                  {revealed && isPicked && !isAnswer ? (
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
          {revealed ? (
            <div className="als-explain" role="status">
              <strong>
                {picked === check.answerIndex ? "Doğru." : "Doğrusu şu:"}
              </strong>{" "}
              {check.explanation}
            </div>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className="als-cta"
        disabled={mustAnswer}
        onClick={next}
      >
        {mustAnswer ? "Önce soruyu yanıtla" : last ? "Dersi bitir" : "Devam et"}
      </button>
    </article>
  );
}
