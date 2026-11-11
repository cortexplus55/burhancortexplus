"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent } from "react";
import { ArrowRight, Check, FileText, Lock } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import type { TourScreenProps } from "@/components/landing/tour/product-screens";
import { streakBadge } from "@/lib/learning/coach-reactions";
import {
  JOURNEY_COPY,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_PLUS_CARDS,
  JOURNEY_RESULT,
  JOURNEY_ROADMAP,
  JOURNEY_STEPS,
  isProductStep,
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
import "@/styles/tour-product.css";

/** Halkanın çevresi (r = 34). */
const RING = 2 * Math.PI * 34;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

type ScreenState = { status: "idle" | "loading" | "failed" } | { status: "ready"; Screen: ComponentType<TourScreenProps> };

/**
 * Ana sayfanın 7 adımlı tanıtım turu (11 Kasım 2026). Misafir örnek notu tarama alanına bırakır ve ürünü kendi
 * tıklamasıyla sırayla gezer: yol haritası, ilk ders, konu testi, kartlar, doğru/yanlış, Plus vitrini.
 *
 * İkinci kurgu (aynı gün; ürün sahibi: "Sistemde nasıl bir ekranla karşılaşacaklar, onu göstermemiz lazım; görsel
 * olarak da sisteme uysun"): ders, soru, kart ve doğru/yanlış adımlarında tur kendi çizimini göstermez. O adımlarda
 * **ürünün kendi ekranı** çalışır (`tour/product-screens.tsx`: `ExamLessonSteps`, `ExamQuizPlay`, `FlashCard`,
 * `TrueFalseFocusCard`), örnek veriyle (`lib/demo/guest-tour.ts`) ve bir uygulama çerçevesinin içinde. Tur yalnız
 * sırayı, ilerleme rayını ve sonucu tutar.
 *
 * Ürün ekranları ayrı bir parçadır ve ilk yükte yoktur: tur ekrana yaklaşınca ya da ilk dokunuşta yüklenir
 * (uygulamanın stil dosyası büyük). Yükleme düz `import()` ile yapılır; Suspense sınırı yok (bu projede sayfayı
 * boşaltıyor). Tamamen tarayıcıda çalışır: ağ isteği, model çağrısı ve dosya yükleme yok. Hareket yalnız CSS'te ve
 * `prefers-reduced-motion`da durur; tarama beklemesi de o zaman atlanır.
 */
export function FuturisticGuidedJourney({ segmentId }: { segmentId: AudienceSegmentId }) {
  const [step, setStep] = useState<JourneyStepId>("upload");
  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Konu testi sorusu ilk kilitlendiğinde doğru muydu; cevaplanmadıysa null. */
  const [questionCorrect, setQuestionCorrect] = useState<boolean | null>(null);
  /** Doğru/yanlış önermelerinin sonucu; bitmediyse null. */
  const [truth, setTruth] = useState<{ right: number; total: number } | null>(null);
  /** Her "baştan oyna"da ürün ekranları sıfırdan kurulsun. */
  const [run, setRun] = useState(0);
  const [screens, setScreens] = useState<ScreenState>({ status: "idle" });
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const loading = useRef(false);

  const index = journeyStepIndex(step);
  const score = journeyScore({ questionCorrect, truth });
  const product = isProductStep(step);
  /** Doğru/yanlış bitti: çerçevenin yerinde sonuç durur. */
  const showResult = step === "check" && truth !== null;

  const loadScreens = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setScreens((current) => (current.status === "ready" ? current : { status: "loading" }));
    import("@/components/landing/tour/product-screens")
      .then((module) => setScreens({ status: "ready", Screen: module.TourProductScreen }))
      .catch(() => {
        loading.current = false;
        setScreens({ status: "failed" });
      });
  }, []);

  const go = useCallback((next: JourneyStepId) => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    setScanning(false);
    setDragOver(false);
    setStep(next);
  }, []);

  // Ürün ekranları tur ekrana yaklaşınca yüklenir; ziyaretçi adıma geldiğinde hazır olur.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadScreens();
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [loadScreens]);

  // Adıma doğrudan gelindiyse (raydan) ve parça henüz istenmediyse şimdi istenir.
  useEffect(() => {
    if (product) loadScreens();
  }, [product, loadScreens]);

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
    loadScreens();
    setScanning(true);
    setDragOver(false);
    const wait = prefersReducedMotion() ? 0 : JOURNEY_FILE.scanMs;
    scanTimer.current = setTimeout(() => go("roadmap"), wait);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    startScan();
  }

  function restart() {
    setQuestionCorrect(null);
    setTruth(null);
    setRun((current) => current + 1);
    go("upload");
  }

  const allRight = score.answered >= 2 && score.correct === score.answered;
  const streak = allRight ? streakBadge(score.correct) : null;
  const following = nextJourneyStep(step);

  return (
    <section ref={sectionRef} id="nasil" className="lj" aria-labelledby="lj-title">
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

            {/* Ürünün kendi ekranı: ders, konu testi, kartlar, doğru/yanlış. */}
            {product && !showResult ? (
              <div className="lj-product">
                <p className="lj-real">{JOURNEY_COPY.real}</p>
                {screens.status === "ready" ? (
                  <screens.Screen
                    key={`${run}:${step}`}
                    screen={step}
                    onDone={() => {
                      if (step !== "check" && following) go(following);
                    }}
                    onExit={() => go("roadmap")}
                    onQuestion={(correct) => setQuestionCorrect((current) => (current === null ? correct : current))}
                    onTruth={(right, total) => setTruth({ right, total })}
                  />
                ) : (
                  <div className="tp-frame">
                    <div className="tp-loading" role="status" aria-live="polite">
                      {screens.status === "failed" ? (
                        <>
                          <span>{JOURNEY_COPY.failed}</span>
                          <button type="button" className="lj-ghost" onClick={loadScreens}>
                            {JOURNEY_COPY.retry}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="tp-loading-dot" aria-hidden />
                          <span>{JOURNEY_COPY.loading}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {showResult ? (
              <div className="lj-check">
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
                    <strong>🎯 {JOURNEY_RESULT.doneTitle}</strong>
                    <span>{score.line}</span>
                    {streak ? <span className="lj-streak">{streak}</span> : null}
                  </span>
                </div>
                <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("plus")}>
                  {JOURNEY_RESULT.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
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

            {/* Ürün ekranı cevaba bağlıyken de yol açık: adımı oynamadan sıradakine geçilebilir. */}
            {following && product && !showResult ? (
              <button type="button" className="lj-skip" onClick={() => go(following)}>
                {JOURNEY_COPY.skip}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
