"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowRight, Check, FileText, Lock, RotateCcw, X } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { coachReaction, streakBadge } from "@/lib/learning/coach-reactions";
import { TWO_OPTION_CHIP } from "@/lib/learning/twin-question-copy";
import {
  JOURNEY_CARD,
  JOURNEY_COPY,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_LESSON,
  JOURNEY_PLUS_CARDS,
  JOURNEY_QUESTION,
  JOURNEY_ROADMAP,
  JOURNEY_STEPS,
  JOURNEY_TRUTH,
  journeyGuideLine,
  journeyScore,
  journeySignupHref,
  journeyStepIndex,
  nextJourneyStep,
  type JourneyStepId,
} from "@/lib/marketing/landing-journey";
import type { AudienceSegmentId } from "@/lib/marketing/landing-showcase";
import { cn } from "@/lib/utils";
import "@/styles/landing-journey.css";

/** Halkanın çevresi (r = 34). */
const RING = 2 * Math.PI * 34;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Ana sayfanın 7 adımlı tanıtım turu (11 Kasım 2026). Misafir örnek notu tarama alanına bırakır ve ürünün
 * ekranlarını kendi tıklamasıyla sırayla gezer: yol haritası, ilk ders, soru, kart, doğru/yanlış, Plus vitrini.
 *
 * Tamamen tarayıcıda çalışır: durum bu bileşende, içerik `landing-journey.ts`te; ağ isteği, model çağrısı ve
 * yükleme yok. İlerleme rayı tıklanabilir (her adıma doğrudan gidilir). Hareket yalnız CSS'te ve
 * `prefers-reduced-motion`da durur; tarama beklemesi de o zaman atlanır.
 */
export function FuturisticGuidedJourney({ segmentId }: { segmentId: AudienceSegmentId }) {
  const [step, setStep] = useState<JourneyStepId>("upload");
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Soruda yanlış denenen şıklar ve doğru şık seçildi mi. */
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [lastPick, setLastPick] = useState<string | null>(null);
  /** İlk seçim doğru muydu (sonuç halkası bunu sayar); cevaplanmadıysa null. */
  const [questionFirst, setQuestionFirst] = useState<boolean | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [seenBack, setSeenBack] = useState(false);
  const [truthPick, setTruthPick] = useState<boolean | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const index = journeyStepIndex(step);
  const solved = lastPick === JOURNEY_QUESTION.answer;
  const truthCorrect = truthPick === null ? null : truthPick === JOURNEY_TRUTH.answer;
  const score = journeyScore({ questionCorrect: questionFirst, truthCorrect });

  const go = useCallback((next: JourneyStepId) => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    setScanning(false);
    setDragOver(false);
    setStep(next);
  }, []);

  // Adım değişince sahne odağa ve görüş alanına gelir (ilk çizimde değil: sayfa kendi kendine kaymasın).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    stage.focus({ preventScroll: true });
    if (typeof stage.scrollIntoView !== "function") return;
    // Yeni adımın başı sabit menünün ve ilerleme çizgisinin altında, ekranın üst yarısındaysa sayfa kaymaz. Değilse
    // (telefonda adım ekrandan uzunken önceki düğme aşağıda kalır) adımın başına hizalanır; boşluk CSS'teki
    // `scroll-margin-top`tan gelir. "nearest" ekrandan uzun adımda hiç kaydırmıyordu.
    const top = stage.getBoundingClientRect().top;
    const margin = Number.parseFloat(getComputedStyle(stage).scrollMarginTop) || 0;
    if (top >= margin - 1 && top <= window.innerHeight / 2) return;
    stage.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [step]);

  useEffect(
    () => () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
    },
    [],
  );

  function startScan() {
    if (scanning) return;
    setScanning(true);
    setDragOver(false);
    const wait = prefersReducedMotion() ? 0 : JOURNEY_FILE.scanMs;
    scanTimer.current = setTimeout(() => go("roadmap"), wait);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    startScan();
  }

  function pick(option: string) {
    if (solved) return;
    if (questionFirst === null) setQuestionFirst(option === JOURNEY_QUESTION.answer);
    setLastPick(option);
    if (option !== JOURNEY_QUESTION.answer) setWrongPicks((list) => (list.includes(option) ? list : [...list, option]));
  }

  function restart() {
    setWrongPicks([]);
    setLastPick(null);
    setQuestionFirst(null);
    setHintOpen(false);
    setFlipped(false);
    setSeenBack(false);
    setTruthPick(null);
    go("upload");
  }

  const reaction = solved
    ? coachReaction({ correct: true, streak: questionFirst ? 1 : 0, usedHint: hintOpen })
    : lastPick
      ? coachReaction({ correct: false, streak: 0 })
      : null;
  const streak = questionFirst && truthCorrect ? streakBadge(2) : null;
  const following = nextJourneyStep(step);

  return (
    <section id="nasil" className="lj" aria-labelledby="lj-title">
      <div className="lj-wrap">
        <div className="lj-head">
          <p className="lj-kicker">{JOURNEY_COPY.kicker}</p>
          <h2 id="lj-title" className="lj-title">
            {JOURNEY_COPY.title}
          </h2>
          <p className="lj-note">{JOURNEY_COPY.note}</p>
        </div>

        <div className="lj-console">
          {/* İlerleme rayı: logonun şeridi. Her durak tıklanır; dolan kısım geçilen adımlardır. */}
          <ol className="lj-rail" style={{ ["--lj-progress" as string]: index / (JOURNEY_STEPS.length - 1) }}>
            {JOURNEY_STEPS.map((item, at) => (
              <li key={item.id} className="lj-rail-item">
                <button
                  type="button"
                  className={cn("lj-stop", at < index && "is-done", at === index && "is-on")}
                  aria-current={at === index ? "step" : undefined}
                  aria-label={`Adım ${at + 1}: ${item.title}`}
                  onClick={() => go(item.id)}
                >
                  <span className="lj-stop-dot" aria-hidden>
                    {at < index ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : at + 1}
                  </span>
                  <span className="lj-stop-label" aria-hidden>
                    {item.short}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div ref={stageRef} className="lj-stage" tabIndex={-1} data-step={step}>
            <div className="lj-stage-head">
              <h3 className="lj-step-title">{JOURNEY_STEPS[index]!.title}</h3>
              <p className="lj-guide" role="status" aria-live="polite">
                <span aria-hidden>{step === "upload" || step === "cards" ? "👆" : "👉"}</span> {journeyGuideLine(step)}
              </p>
            </div>

            {step === "upload" ? (
              <div className={cn("lj-upload", scanning && "is-scanning")}>
                <button
                  type="button"
                  className="lj-file"
                  draggable={!scanning}
                  disabled={scanning}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", JOURNEY_FILE.name);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={startScan}
                >
                  <span className="lj-file-sheet" aria-hidden>
                    <FileText className="h-6 w-6" />
                    <span className="lj-file-badge">PDF</span>
                  </span>
                  <span className="lj-file-text">
                    <strong>{JOURNEY_FILE.name}</strong>
                    <span>{JOURNEY_FILE.meta}</span>
                  </span>
                </button>

                <span className="lj-flight" aria-hidden />

                <button
                  type="button"
                  className={cn("lj-zone", dragOver && "is-over")}
                  disabled={scanning}
                  aria-label={`${JOURNEY_FILE.zoneTitle}: ${JOURNEY_FILE.zoneHint}`}
                  onClick={startScan}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <span className="lj-zone-rings" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="lj-zone-core" aria-hidden>
                    <CortexMark size={56} />
                  </span>
                  {scanning ? (
                    <span className="lj-scan" role="status" aria-live="polite">
                      <span className="lj-scan-sheet" aria-hidden>
                        <span className="lj-scan-laser" />
                      </span>
                      {JOURNEY_FILE.scanning.map((line) => (
                        <span key={line} className="lj-scan-line">
                          {line}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="lj-zone-copy">
                      <strong>{JOURNEY_FILE.zoneTitle}</strong>
                      <span>{JOURNEY_FILE.zoneHint}</span>
                    </span>
                  )}
                </button>
              </div>
            ) : null}

            {step === "roadmap" ? (
              <div className="lj-road">
                <ul className="lj-goals" aria-label="Hedef">
                  {JOURNEY_ROADMAP.goals.map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
                <ol className="lj-days">
                  {JOURNEY_ROADMAP.days.map((day, at) => (
                    <li key={day.day} className={cn("lj-day", day.ready && "is-ready")} style={{ ["--lj-i" as string]: at }}>
                      <span className="lj-day-node" aria-hidden />
                      <div className="lj-day-body">
                        <p className="lj-day-when">
                          {day.day}
                          {day.meta ? <span className="lj-day-meta">{day.meta}</span> : null}
                        </p>
                        <p className="lj-day-title">{day.title}</p>
                        {day.ready ? (
                          <button type="button" className="lj-cta lj-cta--pulse" onClick={() => go("lesson")}>
                            {JOURNEY_ROADMAP.cta}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {step === "lesson" ? (
              <div className="lj-lesson">
                <div className="lj-lesson-main">
                  <p className="lj-lesson-topic">{JOURNEY_LESSON.topic}</p>
                  <p className="lj-lesson-concept">{JOURNEY_LESSON.concept}</p>
                  <div className="lj-formula" role="group" aria-label={JOURNEY_LESSON.formula.title}>
                    <p className="lj-tag lj-tag--formula">📐 {JOURNEY_LESSON.formula.title}</p>
                    {JOURNEY_LESSON.formula.rows.map((row) => (
                      <div key={row.label} className="lj-formula-row">
                        <span className="lj-formula-label">{row.label}</span>
                        <span className="lj-formula-expr">{row.expression}</span>
                        <span className="lj-formula-note">{row.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lj-lesson-side">
                  <aside className="lj-trap" aria-label={JOURNEY_LESSON.trap.title}>
                    <p className="lj-tag lj-tag--trap">⚠️ {JOURNEY_LESSON.trap.title}</p>
                    <p className="lj-trap-line">
                      <X className="lj-trap-icon lj-trap-icon--bad" aria-label="Hatalı" />
                      <span>
                        <span className="lj-math">{JOURNEY_LESSON.trap.wrong}</span>
                        <small>{JOURNEY_LESSON.trap.wrongWhy}</small>
                      </span>
                    </p>
                    <p className="lj-trap-line">
                      <Check className="lj-trap-icon lj-trap-icon--ok" aria-label="Doğru" />
                      <span>
                        <span className="lj-math">{JOURNEY_LESSON.trap.right}</span>
                        <small>{JOURNEY_LESSON.trap.rightWhy}</small>
                      </span>
                    </p>
                  </aside>
                  <aside className="lj-hook" aria-label={JOURNEY_LESSON.hook.title}>
                    <p className="lj-tag lj-tag--hook">🧠 {JOURNEY_LESSON.hook.title}</p>
                    <p>{JOURNEY_LESSON.hook.body}</p>
                  </aside>
                </div>
                <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("question")}>
                  {JOURNEY_LESSON.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}

            {step === "question" ? (
              <div className="lj-question">
                <p className="lj-prompt">{JOURNEY_QUESTION.prompt}</p>
                <div className="lj-options" role="group" aria-label="Şıklar">
                  {JOURNEY_QUESTION.options.map((option, at) => {
                    const isRight = solved && option === JOURNEY_QUESTION.answer;
                    const isWrong = wrongPicks.includes(option);
                    const inPair = hintOpen && !solved && JOURNEY_QUESTION.twoOption.pair.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        className={cn("lj-option", isRight && "is-right", isWrong && "is-wrong", inPair && "is-pair")}
                        disabled={solved || isWrong}
                        aria-pressed={lastPick === option}
                        onClick={() => pick(option)}
                      >
                        <span className="lj-option-letter" aria-hidden>
                          {String.fromCharCode(65 + at)}
                        </span>
                        <span className="lj-option-text">{option}</span>
                        {isRight ? <Check className="h-4 w-4" strokeWidth={3} aria-label="Doğru cevap" /> : null}
                        {isWrong ? <X className="h-4 w-4" strokeWidth={3} aria-label="Yanlış" /> : null}
                      </button>
                    );
                  })}
                </div>

                {!solved ? (
                  hintOpen ? (
                    <p className="lj-hint" role="status">
                      <strong>
                        En çok karıştırılan iki şık: {JOURNEY_QUESTION.twoOption.pair.join(" ve ")}.
                      </strong>{" "}
                      {JOURNEY_QUESTION.twoOption.hint}
                    </p>
                  ) : (
                    <button type="button" className="lj-chip" onClick={() => setHintOpen(true)}>
                      {TWO_OPTION_CHIP}
                    </button>
                  )
                ) : null}

                {reaction ? (
                  <div className={cn("lj-feedback", solved ? "is-right" : "is-off")} role="status" aria-live="polite">
                    <p className="lj-coach">{reaction.text}</p>
                    <p>{solved ? JOURNEY_QUESTION.explanation : (JOURNEY_QUESTION.wrongWhy[lastPick ?? ""] ?? "")}</p>
                  </div>
                ) : null}

                {solved ? (
                  <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("cards")}>
                    {JOURNEY_QUESTION.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}

            {step === "cards" ? (
              <div className="lj-cards">
                <button
                  type="button"
                  className={cn("lj-flip", flipped && "is-flipped")}
                  aria-pressed={flipped}
                  aria-label={flipped ? `Arka yüz: ${JOURNEY_CARD.back}` : `Ön yüz: ${JOURNEY_CARD.front}. ${JOURNEY_CARD.flipHint}`}
                  onClick={() => {
                    setFlipped((value) => !value);
                    setSeenBack(true);
                  }}
                >
                  <span className="lj-flip-inner" aria-hidden>
                    <span className="lj-flip-face lj-flip-face--front">
                      <span className="lj-flip-side">Soru</span>
                      <span className="lj-flip-text">{JOURNEY_CARD.front}</span>
                      <span className="lj-flip-hint">👆 {JOURNEY_CARD.flipHint}</span>
                    </span>
                    <span className="lj-flip-face lj-flip-face--back">
                      <span className="lj-flip-side">Cevap</span>
                      <span className="lj-flip-text">{JOURNEY_CARD.back}</span>
                    </span>
                  </span>
                </button>
                <div className="lj-row">
                  <button type="button" className="lj-ghost" onClick={() => setFlipped(false)} disabled={!flipped}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {JOURNEY_CARD.again}
                  </button>
                  <button type="button" className={cn("lj-cta", seenBack && "lj-cta--pulse")} onClick={() => go("check")}>
                    {JOURNEY_CARD.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}

            {step === "check" ? (
              <div className="lj-check">
                <p className="lj-statement">{JOURNEY_TRUTH.statement}</p>
                <div className="lj-truth" role="group" aria-label="Doğru mu, yanlış mı?">
                  {[true, false].map((value) => {
                    const chosen = truthPick === value;
                    const right = truthPick !== null && value === JOURNEY_TRUTH.answer;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        className={cn("lj-truth-btn", right && "is-right", chosen && !right && "is-wrong")}
                        disabled={truthPick !== null}
                        aria-pressed={chosen}
                        onClick={() => setTruthPick(value)}
                      >
                        {value ? "✅ Doğru" : "❌ Yanlış"}
                      </button>
                    );
                  })}
                </div>

                {truthPick !== null ? (
                  <>
                    <div className={cn("lj-feedback", truthCorrect ? "is-right" : "is-off")} role="status" aria-live="polite">
                      <p className="lj-coach">{truthCorrect ? JOURNEY_TRUTH.rightLine : JOURNEY_TRUTH.wrongLine}</p>
                      <p>{JOURNEY_TRUTH.explanation}</p>
                    </div>
                    <div className="lj-result">
                      <span className="lj-ring" aria-hidden>
                        <svg viewBox="0 0 80 80" width="80" height="80">
                          <circle className="lj-ring-track" cx="40" cy="40" r="34" />
                          <circle
                            className="lj-ring-fill"
                            cx="40"
                            cy="40"
                            r="34"
                            strokeDasharray={RING}
                            strokeDashoffset={RING * (1 - (score.pct ?? 0) / 100)}
                          />
                        </svg>
                        <b>{score.pct === null ? "–" : `%${score.pct}`}</b>
                      </span>
                      <span className="lj-result-text">
                        <strong>🎯 {JOURNEY_TRUTH.doneTitle}</strong>
                        <span>{score.line}</span>
                        {streak ? <span className="lj-streak">{streak}</span> : null}
                      </span>
                    </div>
                    <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("plus")}>
                      {JOURNEY_TRUTH.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {step === "plus" ? (
              <div className="lj-plus">
                <ul className="lj-plus-grid">
                  {JOURNEY_PLUS_CARDS.map((card) => (
                    <li key={card.id} className="lj-plus-card">
                      <p className="lj-plus-head">
                        <span className="lj-plus-icon" aria-hidden>
                          {card.icon}
                        </span>
                        <strong>{card.title}</strong>
                        <span className="lj-plus-badge">
                          <Lock className="h-3 w-3" aria-hidden />
                          Plus
                        </span>
                      </p>
                      <p className="lj-plus-body">{card.body}</p>
                      {card.preview ? (
                        <div className="lj-wave" aria-label="Podcast önizlemesi">
                          <span className="lj-wave-bars" aria-hidden>
                            {Array.from({ length: 14 }, (_, bar) => (
                              <span key={bar} style={{ ["--lj-i" as string]: bar }} />
                            ))}
                          </span>
                          {card.preview.map((row) => (
                            <p key={row.line} className="lj-wave-line">
                              <b>{row.who}</b> {row.line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <div className="lj-final">
                  <p className="lj-final-title">{JOURNEY_FINAL.title}</p>
                  <p className="lj-final-body">{JOURNEY_FINAL.body}</p>
                  <Link href={journeySignupHref(segmentId)} className="lj-cta lj-cta--pulse lj-cta--hero">
                    🚀 {JOURNEY_FINAL.cta}
                    <ArrowRight className="h-5 w-5" aria-hidden />
                  </Link>
                  <p className="lj-final-fine">{JOURNEY_FINAL.fine}</p>
                  <button type="button" className="lj-link" onClick={restart}>
                    {JOURNEY_COPY.restart}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Ana düğme cevaba bağlıyken de yol açık: soruyu çözmeden sıradaki adıma geçilebilir. */}
            {following && ((step === "question" && !solved) || (step === "check" && truthPick === null)) ? (
              <button type="button" className="lj-skip" onClick={() => go(following)}>
                Bu adımı geç
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
