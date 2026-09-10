"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { LessonDiagramView } from "@/components/parity/lesson-diagram";
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

/**
 * Anahtar terimleri koyu göster.
 *
 * Ders gövdesi düz paragraftı: sınava iki gün kala geri dönen öğrenci
 * hangi kelimenin sınavda çıkacak terim olduğunu göremiyordu. Astra
 * terimleri metnin içinde koyu veriyor.
 *
 * Metin `**terim**` biçiminde geliyor; HTML'e çevirmiyoruz, parçalayıp
 * <strong> ile basıyoruz — modelden gelen metne innerHTML açmak, ders
 * içeriğini işaretleme kanalına dönüştürürdü.
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
    }
  | { kind: "example"; heading: string; prompt: string; solution: string }
  | { kind: "mistake"; heading: string; claim: string; correction: string }
  | { kind: "summary"; heading: string; points: string[]; next: string[] }
  | {
      kind: "retry";
      heading: string;
      check: NonNullable<LessonV2["sections"][number]["check"]>;
    };

function buildSteps(lesson: LessonV2): Step[] {
  const steps: Step[] = [
    { kind: "overview", heading: lesson.title, body: lesson.overview },
    ...lesson.sections.map(
      (s): Step => ({
        kind: "section",
        heading: s.heading,
        body: s.body,
        check: s.check,
        note: s.note,
        diagram: s.diagram,
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
  const base = useMemo(() => buildSteps(lesson), [lesson]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  /** Yanlış cevaplanan bölümlerin sırası — tekrar kuyruğunu bunlar doğurur. */
  const [missed, setMissed] = useState<number[]>([]);

  /**
   * Ders özetle bitmiyor.
   *
   * Astra'da bir dersi adım adım geçerken sayaç 6/6 iken 7/7 oldu: özetten
   * sonra, yanlış cevapladığın bölümün adıyla etiketlenmiş bir hatırlama
   * sorusu eklendi. Öğrenme okumakla değil, geri çağırmakla oturuyor;
   * üstelik hangi bölümden geldiği yazılı olduğu için öğrenci nereye
   * döneceğini biliyor.
   *
   * Yeni üretim yok: soru zaten o bölümün kontrolü. Yanlış yaptıysan bir
   * kez daha karşına çıkıyor, o kadar.
   */
  const steps = useMemo(() => {
    const retries = missed
      .map((sectionIndex) => {
        const section = lesson.sections[sectionIndex];
        return section?.check
          ? ({ kind: "retry", heading: section.heading, check: section.check } as Step)
          : null;
      })
      .filter((s): s is Step => s !== null);
    return [...base, ...retries];
  }, [base, missed, lesson]);

  const step = steps[index];
  const last = index === steps.length - 1;
  const check =
    step.kind === "section" ? step.check : step.kind === "retry" ? step.check : undefined;
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

      {step.kind === "retry" ? (
        <p className="als-check-kicker als-retry-kicker">Tekrarla</p>
      ) : null}
      <h1 className="als-heading">{step.heading}</h1>

      {step.kind === "overview" || step.kind === "section" ? (
        <p className="als-body">
          <RichBody text={step.body} />
        </p>
      ) : null}

      {step.kind === "section" && step.diagram ? (
        <LessonDiagramView diagram={step.diagram} id={`als-d-${index}`} />
      ) : null}

      {/* Tuzak, kavramın hemen yanında. Dersin sonunda tek adım olarak
          durduğunda öğrenci onu beş adım geç görüyordu. */}
      {step.kind === "section" && step.note ? (
        <aside className="als-note">
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
                    // Yanlış cevaplanan bölüm özetten sonra bir kez daha
                    // sorulur. Tekrar adımında tekrar yanlış yapmak yeni
                    // bir adım doğurmaz; kuyruk sonsuza gitmemeli.
                    if (
                      step.kind === "section" &&
                      optionIndex !== check.answerIndex &&
                      !missed.includes(index - 1)
                    ) {
                      setMissed((prev) => [...prev, index - 1]);
                    }
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
