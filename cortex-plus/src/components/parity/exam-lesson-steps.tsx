"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, CornerDownLeft, X } from "lucide-react";
import { honestReadingMinutes } from "@/lib/learning/lesson-coherence";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { displaySolution, isPromptEcho } from "@/lib/learning/oral-review";
import { LessonDiagramView } from "@/components/parity/lesson-diagram";
import {
  calloutTone,
  checkPresentation,
  reviewGateLead,
  reviewGateQuestion,
  trueFalseIndexes,
} from "@/lib/learning/lesson-chrome";
import type { MaterialLanguage } from "@/lib/learning/teacher-brain";
import {
  layoutBoard,
  overviewDuplicatesSection,
  studentTextParts,
  type BoardLine,
} from "@/lib/learning/lesson-board";
import "@/styles/exam-lesson-steps.css";

/**
 * Dersi adım adım göster.
 *
 * Her adım kendi slaytı: anlatım, gömülü doğru/yanlış ya da hızlı sınav,
 * ardından açıklama. Yanlışlar dersin sonunda bir kez daha sorulur.
 */

/** Yazılı yanıtı sayısal karşılaştırma için normalize eder. */
function normalizeAnswer(value: string): string {
  return value.replace(/\s+/g, "").replace(",", ".").toLocaleLowerCase("tr-TR");
}

function stepLine(text: string): boolean {
  return /^(?:Veri|Adım\s*\d+)\s*:/i.test(text.trim());
}

function BoardBody({ text, className }: { text: string; className?: string }) {
  const lines = layoutBoard(text);
  const rendered: BoardLine[] = lines.length ? lines : [{ kind: "prose", text }];
  const blocks: Array<{ kind: "line"; line: BoardLine; index: number } | { kind: "steps"; lines: BoardLine[]; index: number }> = [];
  for (let index = 0; index < rendered.length; index += 1) {
    const line = rendered[index];
    const previous = blocks[blocks.length - 1];
    if (stepLine(line.text) && previous?.kind === "steps") {
      previous.lines.push(line);
      continue;
    }
    if (stepLine(line.text)) {
      blocks.push({ kind: "steps", lines: [line], index });
      continue;
    }
    blocks.push({ kind: "line", line, index });
  }
  return (
    <div className={className ?? "als-body"}>
      {blocks.map((block) =>
        block.kind === "steps" ? (
          <ol key={block.index} className="als-steps">
            {block.lines.map((line, index) => (
              <li key={index}>
                <RichBody text={line.text} />
              </li>
            ))}
          </ol>
        ) : block.line.kind === "formula" ? (
          <p key={block.index} className="als-formula">
            <RichBody text={block.line.text} />
          </p>
        ) : (
          <p key={block.index}>
            <RichBody text={block.line.text} />
          </p>
        ),
      )}
    </div>
  );
}

function RichBody({ text }: { text: string }) {
  const parts = studentTextParts(text);
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="als-term">
            {part.text}
          </strong>
        ) : (
          part.text
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
  | {
      kind: "example";
      heading: string;
      prompt: string;
      solution: string;
      givens?: string[];
      unknown?: string;
      steps?: string[];
      result?: string;
    }
  | { kind: "recall"; heading: string; prompt: string; solution: string }
  | { kind: "mistake"; heading: string; claim: string; correction: string }
  | { kind: "summary"; heading: string; points: string[]; next: string[] }
  | { kind: "review-gate"; count: number }
  | {
      kind: "retry";
      heading: string;
      check: NonNullable<LessonV2["sections"][number]["check"]>;
    };

function buildSteps(lesson: LessonV2): Step[] {
  const steps: Step[] = [];
  const overview = (lesson.overview ?? "").trim();
  const firstBody = lesson.sections[0]?.body ?? "";
  if (overview && !overviewDuplicatesSection(overview, firstBody)) {
    steps.push({ kind: "overview", heading: lesson.title, body: overview });
  }
  steps.push(
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
  );
  if (lesson.example?.prompt.trim()) {
    steps.push({
      kind: "example",
      heading: "Örnek",
      prompt: lesson.example.prompt,
      solution: lesson.example.solution,
      givens: lesson.example.givens,
      unknown: lesson.example.unknown,
      steps: lesson.example.steps,
      result: lesson.example.result,
    });
  }
  if (lesson.numericalCheck?.prompt.trim()) {
    steps.push({
      kind: "section",
      heading: "Hesap",
      body: "Formülü ve verilenleri kullanarak hesapla.",
      check: {
        type: "numerical",
        prompt: lesson.numericalCheck.prompt,
        answer: lesson.numericalCheck.answer,
        explanation: lesson.numericalCheck.explanation,
      },
      // Gerçek bir ders bölümüne karşılık gelmiyor — kaçırılırsa tekrar
      // kapısı üretemesin diye lesson.sections dışı bir indeks kullanılır.
      sectionIndex: -1,
    });
  }
  if (lesson.findError?.prompt.trim()) {
    steps.push({
      kind: "section",
      heading: "Hatayı bul",
      body: lesson.findError.faultyText,
      check: {
        type: "findError",
        prompt: lesson.findError.prompt,
        faultyText: lesson.findError.faultyText,
        options: lesson.findError.options,
        answerIndex: lesson.findError.answerIndex,
        explanation: lesson.findError.explanation,
      },
      sectionIndex: -1,
    });
  }
  if (lesson.commonMistake?.claim.trim()) {
    steps.push({
      kind: "mistake",
      heading: "Sık yapılan hata",
      claim: lesson.commonMistake.claim,
      correction: lesson.commonMistake.correction,
    });
  }
  if (lesson.infoCheck?.prompt.trim() && lesson.infoCheck.answer.trim()) {
    const duplicated = lesson.sections.some(
      (section) => section.check?.prompt.trim() === lesson.infoCheck?.prompt.trim(),
    );
    if (!duplicated) {
      steps.push({
        kind: "recall",
        heading: "Bilgi kontrolü",
        prompt: lesson.infoCheck.prompt,
        solution: lesson.infoCheck.answer,
      });
    }
  }
  if ((lesson.summary?.length ?? 0) > 0 || (lesson.nextFocus?.length ?? 0) > 0) {
    steps.push({
      kind: "summary",
      heading: "Özet",
      points: lesson.summary ?? [],
      next: lesson.nextFocus ?? [],
    });
  }
  if (!steps.length) {
    steps.push({ kind: "overview", heading: lesson.title, body: lesson.sections[0]?.body ?? "" });
  }
  return steps;
}

function progressLabel(
  index: number,
  lessonCount: number,
  step: Step,
  retryOrdinal = 0,
  retryTotal = 0,
): string {
  if (step.kind === "review-gate") return "Tekrar";
  if (step.kind === "retry") return `Tekrar ${retryOrdinal} / ${Math.max(1, retryTotal)}`;
  const total = Math.max(1, lessonCount);
  return `${Math.min(index + 1, total)} / ${total}`;
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
  /** Kaçırılan bölüm indeksleri. Metin sunucuda dersin kendisinden kurulur. */
  onFinish?: (missedSectionIndexes?: number[]) => void;
  onClose?: () => void;
  closeHref?: string;
}) {
  const base = useMemo(() => buildSteps(lesson), [lesson]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  const [written, setWritten] = useState("");
  const [recallDraft, setRecallDraft] = useState("");
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
              check: reviewGateQuestion(section.check, language, section.body),
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
  const tf = check && presentation === "trueFalse" ? trueFalseIndexes(check.options ?? []) : null;
  const correct = Boolean(check && revealed && picked === check.answerIndex);

  function resetAnswer() {
    setPicked(null);
    setRevealed(false);
    setSolutionShown(false);
    setWritten("");
    setRecallDraft("");
  }

  function go(nextIndex: number) {
    setIndex(nextIndex);
    resetAnswer();
  }

  function next() {
    if (last) {
      onFinish?.(missed);
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
          {base.map((_, segment) => (
            <span
              key={segment}
              className={segment <= Math.min(index, base.length - 1) ? "is-on" : undefined}
            />
          ))}
        </div>
        <p className="als-count" aria-live="polite">
          <span>
            {progressLabel(
              index,
              base.length,
              step,
              index - base.length,
              Math.max(0, steps.length - base.length - 1),
            )}
          </span>
          <span className="als-minutes">yaklaşık {honestReadingMinutes(lesson)} dk</span>
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
            <BoardBody text={step.body} />
          ) : null}

          {step.kind === "section" && step.cards && step.cards.length >= 2 ? (
            <div className="als-card-grid">
              {step.cards.map((card) => (
                <article key={card.title} className="als-card">
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </article>
              ))}
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
              {step.givens?.length ? (
                <>
                  <h2 className="als-subhead">Verilenler</h2>
                  <ul className="als-list">
                    {step.givens.map((given) => (
                      <li key={given}>
                        <RichBody text={given} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="als-body">
                  <RichBody text={step.prompt} />
                </p>
              )}
              {step.unknown ? (
                <>
                  <h2 className="als-subhead">İstenen</h2>
                  <p className="als-body">
                    <RichBody text={step.unknown} />
                  </p>
                </>
              ) : null}
              {solutionShown ? (
                (() => {
                  const stepTexts = (step.steps ?? []).filter(
                    (item) => !isPromptEcho(item, step.prompt),
                  );
                  const shown = displaySolution(step.solution, step.prompt);
                  if (!shown && !stepTexts.length && !step.result) {
                    return (
                      <p className="text-sm text-[var(--cp-muted)]">
                        Bu örnek için ayrı bir çözüm metni yok.
                      </p>
                    );
                  }
                  return (
                    <div className="als-solution">
                      <span className="als-tag">Çözüm</span>
                      {stepTexts.length ? (
                        <ol className="als-list">
                          {stepTexts.map((item, stepIndex) => (
                            <li key={item}>
                              {stepIndex + 1}. <RichBody text={item} />
                            </li>
                          ))}
                        </ol>
                      ) : shown ? (
                        <BoardBody text={shown} className="als-solution-body" />
                      ) : null}
                      {step.result ? (
                        <p>
                          <strong>Sonuç: </strong>
                          <RichBody text={step.result} />
                        </p>
                      ) : null}
                    </div>
                  );
                })()
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

          {step.kind === "recall" ? (
            <div className="als-recall">
              <p className="als-body">
                <RichBody text={step.prompt} />
              </p>
              <label className="als-recall-label" htmlFor={`als-recall-${index}`}>
                Önce kendin yaz
              </label>
              <textarea
                id={`als-recall-${index}`}
                className="als-recall-input"
                value={recallDraft}
                placeholder="Cevabını düşün, sonra çözümü aç."
                onChange={(event) => setRecallDraft(event.target.value)}
              />
              {solutionShown ? (
                <div className="als-solution">
                  <span className="als-tag">Çözüm</span>
                  <BoardBody text={step.solution} className="als-solution-body" />
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
            </div>
          ) : null}

          {step.kind === "mistake" ? (
            <div className="als-mistake">
              <p className="als-mistake-claim">
                <span className="als-tag als-tag--warn">Yanlış</span>
                <RichBody text={step.claim} />
              </p>
              <p className="als-mistake-fix">
                <span className="als-tag als-tag--ok">Doğrusu</span>
                <RichBody text={step.correction} />
              </p>
            </div>
          ) : null}

          {step.kind === "summary" ? (
            <>
              <ul className="als-list">
                {step.points.map((point) => (
                  <li key={point}>
                    <RichBody text={point} />
                  </li>
                ))}
              </ul>
              {step.next.length ? (
                <>
                  <h2 className="als-subhead">Sırada ne var</h2>
                  <ul className="als-list als-list--muted">
                    {step.next.map((item) => (
                      <li key={item}>
                        <RichBody text={item} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {check && (check.type === "numerical" || check.type === "explain") ? (
        <section className="als-check" aria-label="Bölüm kontrolü">
          <p className="als-check-kicker">Kısa kontrol</p>
          <p className="als-check-prompt">{check.prompt}</p>
          <form
            className="als-options"
            onSubmit={(event) => {
              event.preventDefault();
              if (!written.trim()) return;
              setRevealed(true);
            }}
          >
            {check.type === "numerical" ? (
              <input
                className="als-write"
                value={written}
                onChange={(event) => setWritten(event.target.value)}
                disabled={revealed}
                inputMode="decimal"
                aria-label="Sayısal yanıt"
              />
            ) : (
              <textarea
                className="als-write"
                value={written}
                onChange={(event) => setWritten(event.target.value)}
                disabled={revealed}
                rows={3}
                aria-label="Kendi cümlen"
              />
            )}
            {!revealed ? (
              <button type="submit" className="als-secondary">
                Yanıtı kontrol et
              </button>
            ) : null}
          </form>
          {revealed ? (
            <div className="als-explain" role="status">
              {check.type === "numerical" ? (
                <p>
                  <strong>
                    {normalizeAnswer(written) === normalizeAnswer(check.answer ?? "")
                      ? "Doğru."
                      : "Doğrusu şu:"}
                  </strong>{" "}
                  {check.answer} {check.explanation}
                </p>
              ) : (
                <>
                  <strong>Beklenen noktalar</strong>
                  <ul className="als-list">
                    {(check.expectedPoints ?? [check.explanation]).map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {check && check.type !== "numerical" && check.type !== "explain" && presentation === "trueFalse" ? (
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
          <p className="als-check-prompt">
            <RichBody text={check.prompt} />
          </p>
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
                (check.options ?? []).map((option, optionIndex) => (
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

      {check && check.type !== "numerical" && check.type !== "explain" && presentation === "quickQuiz" ? (
        <section className="als-check" aria-label="Hızlı sınav">
          <p className="als-kicker">HIZLI SINAV</p>
          <p className="als-check-prompt">
            <RichBody text={check.prompt} />
          </p>
          <div className="als-options">
            {(check.options ?? []).map((option, optionIndex) => {
              const isAnswer = optionIndex === (check.answerIndex ?? -1);
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
                  <span>
                    <RichBody text={option} />
                  </span>
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
  const whyRight = check.whyRight?.trim() ?? "";
  const whyWrong = check.whyWrong?.trim() ?? "";
  const optionWhy = check.optionWhy ?? [];
  const pickedWhy = picked != null ? optionWhy[picked]?.trim() ?? "" : "";
  const answerWhy = check.answerIndex != null ? optionWhy[check.answerIndex]?.trim() ?? "" : "";
  const structured = Boolean(whyRight || whyWrong || check.misconception || check.hint || optionWhy.length);
  const options = check.options ?? [];
  return (
    <div className="als-explain">
      <p className="als-explain-kicker">AÇIKLAMA</p>
      {wrong ? (
        <>
          <p>
            <RichBody text={pickedWhy || whyWrong || check.explanation} />
          </p>
          {optionWhy.length > 1
            ? options.map((option, optionIndex) => {
                if (optionIndex === check.answerIndex || optionIndex === picked) return null;
                const reason = optionWhy[optionIndex]?.trim();
                if (!reason) return null;
                return (
                  <p key={option}>
                    <span className="als-tag">{option}</span> {reason}
                  </p>
                );
              })
            : null}
          {check.misconception?.trim() ? (
            <p>
              <span className="als-tag als-tag--warn">Yanılgı</span> {check.misconception.trim()}
            </p>
          ) : null}
          {check.hint?.trim() ? (
            <p>
              <span className="als-tag">İpucu</span> {check.hint.trim()}
            </p>
          ) : null}
        </>
      ) : (
        <p>
          <RichBody text={answerWhy || (structured && whyRight ? whyRight : check.explanation)} />
        </p>
      )}
      {wrong && revisit ? (
        <p className="als-revisit">Dersin sonunda buna geri döneceğiz.</p>
      ) : null}
    </div>
  );
}
