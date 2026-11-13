"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent } from "react";
import { ArrowRight, Check, FileText, Lock, Upload } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import type { TourPlusPreviewProps } from "@/components/landing/tour/plus-previews";
import type { TourScreenProps } from "@/components/landing/tour/product-screens";
import {
  clearGuestDocuments,
  formatFileSize,
  holdGuestDocuments,
  pickGuestFiles,
  purgeStaleGuestDocuments,
  readGuestMarker,
  type GuestMarker,
} from "@/lib/documents/guest-handoff";
import { DOCUMENT_UPLOAD_ACCEPT } from "@/lib/documents/upload-accept";
import { streakBadge } from "@/lib/learning/coach-reactions";
import {
  JOURNEY_COPY,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_NEXT_LABEL,
  JOURNEY_OWN,
  JOURNEY_PLUS_ALSO,
  JOURNEY_PLUS_PREVIEWS,
  JOURNEY_RESULT,
  JOURNEY_ROADMAP,
  JOURNEY_STEPS,
  isProductStep,
  journeyGoals,
  journeyGuideLine,
  journeyScanFindings,
  journeyScore,
  journeySignupHref,
  journeyStepIndex,
  nextJourneyStep,
  ownReadyTitle,
  type JourneyPlusPreviewId,
  type JourneyStepId,
} from "@/lib/marketing/landing-journey";
import { audienceSegment, type AudienceSegmentId } from "@/lib/marketing/landing-showcase";
import { prefersReducedMotion, startMoment, type MomentHandle } from "@/lib/ui/moment";
import { cn } from "@/lib/utils";
import "@/styles/landing-journey.css";
import "@/styles/tour-product.css";

/** Sahne: sabit menüyle ray arasında ve ekranın altında bırakılan boşluk; en küçük ve en büyük yükseklik (px). */
const STAGE_GAP = 8;
const STAGE_MIN = 420;
/** En uzun adımın (telefonda Plus, ~1150 px) üstü: büyük ekranda sahne gereksiz uzamasın. */
const STAGE_MAX = 1160;
/** Yumuşak hizalama bitmiş olmalı: kontrol bu süre sonra yapılır. */
const ALIGN_SETTLE_MS = 700;

/** Pazarlama sayfasının sabit üst menüsü; yoksa (test, başka sayfa) 64 px. */
function headerHeight(): number {
  const header = typeof document === "undefined" ? null : document.querySelector("header.mkh");
  return header ? header.getBoundingClientRect().height : 64;
}

/** Halkanın çevresi (r = 34). */
const RING = 2 * Math.PI * 34;

/** Bu genişlikten itibaren üç Plus önizlemesi yan yana durur; altında seçiciyle tek tek gösterilir. */
const WIDE_QUERY = "(min-width: 1024px)";

/** Sürüklenen şey işletim sisteminden bir dosya mı (örnek not kartı değil)? */
function isFileDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

type Lazy<Props> = { status: "idle" | "loading" | "failed" } | { status: "ready"; View: ComponentType<Props> };

/**
 * Ana sayfanın canlı kokpiti: kahramanın içinde, ilk ekranda çalışan 7 adımlı tur (11 Kasım 2026).
 *
 * Misafir ürünü kendi tıklamasıyla sırayla gezer: not, yol haritası, ilk ders, konu testi, kartlar, doğru/yanlış,
 * Plus önizlemeleri. Ders, soru, kart ve doğru/yanlış adımlarında tur kendi çizimini göstermez; **ürünün kendi
 * ekranı** çalışır (`tour/product-screens.tsx`), örnek veriyle (`lib/demo/guest-tour.ts`) ve bir uygulama
 * çerçevesinin içinde. Plus adımında ürünün kendi parçalarıyla üç canlı önizleme durur (`tour/plus-previews.tsx`).
 * Tur yalnız sırayı, ilerleme rayını ve sonucu tutar.
 *
 * Birinci adım iki kapılıdır. A: hazır örnek not; kart tarama çekirdeğine sürüklenir ya da dokunulur. B: misafirin
 * kendi dosyası; sunucuya gönderilmez, tarayıcıda bekler (`guest-handoff.ts`) ve kayıt bağlantısı onu kuruluma
 * taşır. Seçili hedef kitle sekmesi turun bağlam satırını ve yol haritasındaki sınav sözünü değiştirir.
 *
 * Ürün ekranları ve önizlemeler ayrı parçalardır ve ilk yükte yoktur: ziyaretçi kokpite dokununca (ya da adıma
 * gelince) yüklenir; uygulamanın stil dosyası büyük. Yükleme düz `import()` ile yapılır; Suspense sınırı yok (bu
 * projede sayfayı boşaltıyor). `import()` bir geçişin içinde çağrılır: stil dosyaları inerken tıklamalar donmasın
 * (aşağıdaki `loadScreens` notu). Tur model çağırmaz, sunucuya istek atmaz. Hareket yalnız CSS'te ve
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
  const [screens, setScreens] = useState<Lazy<TourScreenProps>>({ status: "idle" });
  const [previews, setPreviews] = useState<Lazy<TourPlusPreviewProps>>({ status: "idle" });
  const [preview, setPreview] = useState<JourneyPlusPreviewId>("podcast");
  const [wide, setWide] = useState(false);
  /** Misafirin bu sekmede beklettiği kendi dosyası (B kapısı); yoksa null. */
  const [guest, setGuest] = useState<GuestMarker | null>(null);
  const [holding, setHolding] = useState(false);
  const [ownProblems, setOwnProblems] = useState<string[]>([]);
  /**
   * Tek ana düğme (A3): ürün ekranındaki iş bu ziyarette bittiyse adımın kimliği. Bitene kadar çerçevedeki ürün
   * düğmesi tek ana düğmedir, alttaki tur düğmesi soluk durur; iş bitince tur düğmesi ana düğmeye döner.
   */
  const [actedStep, setActedStep] = useState<JourneyStepId | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const scanMoment = useRef<MomentHandle | null>(null);
  const mounted = useRef(false);
  /** Bileşen sayfada mı: sayfadan çıkılınca biten an yolu açmaya çalışmasın. */
  const alive = useRef(true);
  const loadingScreens = useRef(false);
  const loadingPreviews = useRef(false);

  const segment = audienceSegment(segmentId);
  const index = journeyStepIndex(step);
  const score = journeyScore({ questionCorrect, truth });
  const product = isProductStep(step);
  /** Birinci adımda misafirin kendi dosyası bekliyor: örnek not ve çekirdek yerine onay kartı durur. */
  const ownReady = step === "upload" && guest !== null && !scanning;
  /** Doğru/yanlış bitti: çerçevenin yerinde sonuç durur. */
  const showResult = step === "check" && truth !== null;
  const acted = actedStep === step;

  /*
    Parçalar bir geçişin (transition) içinde istenir; bu bir süs değil, tıklamaların donmaması için şart.
    Next, sonradan yüklenen parçanın stil dosyalarını kökteki bir bileşenle çizer ve React bu dosyalar inene kadar
    o güncellemeyi ekrana işlemez. `import()` olağan bir olayın içinde çağrılırsa o bekleyiş acil güncellemelerle
    aynı kümeye girer: stil dosyaları inene kadar (soğuk bağlantıda 1-2 sn) sayfadaki HİÇBİR tıklama ekrana
    yansımaz; sekme değişmez, tarama başlamaz (12 Kasım 2026, önizleme yayınında ölçüldü: tıklama → ekran 1,8 sn).
    Geçişin içinde çağrılınca bekleyiş geçiş şeridinde kalır, tıklamalar anında işlenir. Hazır ekran da geçişle
    yazılır: stil dosyalarıyla aynı kümede işlenir, ekran stilsiz görünmez.
  */
  const loadScreens = useCallback(() => {
    if (loadingScreens.current) return;
    loadingScreens.current = true;
    setScreens((current) => (current.status === "ready" ? current : { status: "loading" }));
    startTransition(() => {
      void import("@/components/landing/tour/product-screens")
        .then((module) => startTransition(() => setScreens({ status: "ready", View: module.TourProductScreen })))
        .catch(() => {
          loadingScreens.current = false;
          setScreens({ status: "failed" });
        });
    });
  }, []);

  const loadPreviews = useCallback(() => {
    if (loadingPreviews.current) return;
    loadingPreviews.current = true;
    setPreviews((current) => (current.status === "ready" ? current : { status: "loading" }));
    startTransition(() => {
      void import("@/components/landing/tour/plus-previews")
        .then((module) => startTransition(() => setPreviews({ status: "ready", View: module.TourPlusPreview })))
        .catch(() => {
          loadingPreviews.current = false;
          setPreviews({ status: "failed" });
        });
    });
  }, []);

  const go = useCallback((next: JourneyStepId) => {
    setScanning(false);
    setDragOver(false);
    setActedStep(null);
    setStep(next);
  }, []);

  // Bu sekmede bekleyen dosya varsa (kayıttan dönen ziyaretçi) kart yeniden görünür; süresi geçmiş kayıt silinir.
  useEffect(() => {
    setGuest(readGuestMarker());
    void purgeStaleGuestDocuments();
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Adıma doğrudan gelindiyse (raydan) ve parça henüz istenmediyse şimdi istenir.
  useEffect(() => {
    if (product) loadScreens();
    // Önizlemeler Plus adımından iki adım önce yüklenmeye başlar: ziyaretçi geldiğinde hazır olur.
    if (step === "cards" || step === "check" || step === "plus") loadPreviews();
  }, [product, step, loadScreens, loadPreviews]);

  /*
    Sabit sahne (A1, 13 Kasım 2026): sahne yüksekliği adımdan adıma değişmez. Yükseklik ekrandan hesaplanır: sabit
    menünün altında ilerleme rayı ve sahne birlikte ekrana sığar, alttaki ilerleme düğmesi hiçbir adımda ekran
    dışında kalmaz. Uzun adımda sayfa değil yalnız sahnenin gövdesi kayar. CSS'te ekran birimiyle bir ilk değer var
    (`--lj-stage-h`); burada sabit menü ve rayın gerçek yüksekliğiyle düzeltilir.
  */
  useEffect(() => {
    const fit = () => {
      const consoleBox = consoleRef.current;
      const rail = railRef.current;
      const stage = stageRef.current;
      if (!consoleBox || !rail || !stage) return;
      const header = headerHeight();
      const railBottom = stage.getBoundingClientRect().top - rail.getBoundingClientRect().top;
      const available = window.innerHeight - header - STAGE_GAP * 2 - railBottom;
      consoleBox.style.setProperty("--lj-stage-h", `${Math.max(STAGE_MIN, Math.min(STAGE_MAX, Math.round(available)))}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Adım değişince: sahne odağa gelir, gövde başa döner ve ilerleme rayının üstü sabit menünün hemen altına hizalanır
  // (ilk çizimde değil: sayfa kendi kendine kaymasın). Yumuşak kayma başka bir kaydırmayla yarıda kalırsa (ör. kayma
  // sürerken yapılan dokunuş) kısa süre sonra tam yerine oturur; ziyaretçi kendisi kaydırdıysa dokunulmaz.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const stage = stageRef.current;
    const rail = railRef.current;
    if (!stage || !rail || typeof window.scrollBy !== "function") return;
    stage.focus({ preventScroll: true });
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const offset = () => rail.getBoundingClientRect().top - (headerHeight() + STAGE_GAP);
    const delta = offset();
    if (Math.abs(delta) <= 2) return;
    const reduced = prefersReducedMotion();
    window.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
    if (reduced) return;
    let userScrolled = false;
    const mark = () => {
      userScrolled = true;
    };
    const intents = ["wheel", "touchstart", "keydown"] as const;
    for (const intent of intents) window.addEventListener(intent, mark, { passive: true });
    const settle = window.setTimeout(() => {
      const rest = offset();
      if (!userScrolled && Math.abs(rest) > 2) window.scrollBy({ top: rest, behavior: "auto" });
    }, ALIGN_SETTLE_MS);
    return () => {
      window.clearTimeout(settle);
      for (const intent of intents) window.removeEventListener(intent, mark);
    };
  }, [step]);

  useEffect(
    () => {
      alive.current = true;
      return () => {
        // Sayfadan çıkılırsa an sessizce kapanır (yol açılmaz).
        alive.current = false;
        scanMoment.current?.end();
        scanMoment.current = null;
      };
    },
    [],
  );

  /*
    Tarama anı (A2): not çekirdeğe kayar, halkalar bir kez atar, örnek notun bulguları sırayla belirir, sonra yol açılır.
    Bir an (depo kararı 11): en çok 2,5 sn; tıklama ya da Enter / Space / Escape hemen yolu açar; hareket azaltmada
    beklenmez.
  */
  function startScan() {
    if (scanning) return;
    loadScreens();
    setDragOver(false);
    setScanning(true);
    const handle = startMoment(JOURNEY_FILE.scanMs, () => {
      scanMoment.current = null;
      if (alive.current) go("roadmap");
    });
    if (!handle.instant) scanMoment.current = handle;
  }

  /** B kapısı: dosya sunucuya gitmez; tarayıcıda bekletilir ve onay kartı açılır. */
  const takeOwn = useCallback(async (list: readonly File[]) => {
    if (!list.length) return;
    const { accepted, problems } = pickGuestFiles(list);
    setOwnProblems(problems);
    if (!accepted.length) return;
    setHolding(true);
    try {
      setGuest(await holdGuestDocuments(accepted));
    } finally {
      setHolding(false);
    }
  }, []);

  function removeOwn() {
    setGuest(null);
    setOwnProblems([]);
    void clearGuestDocuments();
  }

  function onZoneDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) void takeOwn(files);
    else startScan();
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
  const signupHref = journeySignupHref(segmentId, { withDocument: Boolean(guest) });
  const shownPreviews = JOURNEY_PLUS_PREVIEWS.filter((item) => wide || item.id === preview);

  return (
    <section id="nasil" className="lj" aria-labelledby="lj-title">
      <div className="lj-wrap">
        <div
          ref={consoleRef}
          className="lj-console"
          onPointerEnter={loadScreens}
          onPointerDown={loadScreens}
          onFocusCapture={loadScreens}
          onDragOver={(event) => {
            // Dosya kokpitin neresine bırakılırsa bırakılsın tarayıcı onu açmaya kalkmasın.
            if (isFileDrag(event)) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            void takeOwn(Array.from(event.dataTransfer.files));
            if (step !== "upload") go("upload");
          }}
        >
          <div className="lj-console-head">
            <p className="lj-live">
              <span className="lj-live-dot" aria-hidden />
              {JOURNEY_COPY.live}
              <span className="lj-live-sep" aria-hidden>
                ·
              </span>
              {JOURNEY_COPY.kicker}
            </p>
            <h2 id="lj-title" className="lj-title">
              {JOURNEY_COPY.title}
            </h2>
            {/* Seçili sekmenin bağlamı: örnek not aynı kalır, cümle sekmeyle değişir (anahtar animasyonu yeniden başlatır). */}
            <p key={segmentId} className="lj-context" data-segment={segmentId}>
              {segment.tourContext}
            </p>
          </div>

          {/* İlerleme rayı: logonun şeridi. Her durak tıklanır; dolan kısım geçilen adımlardır. */}
          <ol ref={railRef} className="lj-rail" style={{ ["--lj-progress" as string]: index / (JOURNEY_STEPS.length - 1) }}>
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
                <span aria-hidden>{ownReady ? "👇" : step === "upload" || step === "cards" ? "👆" : "👉"}</span>{" "}
                {journeyGuideLine(step, { ownDocument: ownReady })}
              </p>
            </div>

            {/* Sahnenin gövdesi: uzun adımda yalnız burası kayar (A1). */}
            <div ref={bodyRef} className="lj-stage-body">

            {/* 1. Not, B kapısı sonrası: misafirin kendi dosyası tarayıcıda bekliyor. */}
            {ownReady && guest ? (
              <div className="lj-ready" data-guest-document>
                <p className="lj-ready-title">
                  <span aria-hidden>✅</span> {ownReadyTitle(guest.names)}
                </p>
                <ul className="lj-ready-files" aria-label="Seçilen dosyalar">
                  {guest.names.slice(0, 3).map((name, at) => (
                    <li key={`${name}-${at}`}>
                      <FileText className="h-4 w-4" aria-hidden />
                      <span>{name}</span>
                      <span className="lj-ready-size">{formatFileSize(guest.sizes[at] ?? 0)}</span>
                    </li>
                  ))}
                  {guest.names.length > 3 ? <li>ve {guest.names.length - 3} dosya daha</li> : null}
                </ul>
                <p className="lj-ready-body">{JOURNEY_OWN.body}</p>
                <p className="lj-ready-kept">{guest.stored ? JOURNEY_OWN.kept : JOURNEY_OWN.notKept}</p>
                <Link href={signupHref} className="lj-cta lj-cta--pulse lj-cta--hero">
                  {JOURNEY_OWN.cta}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
                <p className="lj-final-fine">{JOURNEY_OWN.fine}</p>
                <div className="lj-ready-row">
                  <button type="button" className="lj-ghost" onClick={startScan}>
                    {JOURNEY_OWN.playSample}
                  </button>
                  <button type="button" className="lj-link" onClick={removeOwn}>
                    {JOURNEY_OWN.remove}
                  </button>
                </div>
                {ownProblems.length ? (
                  <ul className="lj-own-problems" role="alert">
                    {ownProblems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {/* 1. Not: iki kapı. A: hazır örnek not çekirdeğe gider. B: misafirin kendi dosyası. */}
            {step === "upload" && !ownReady ? (
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
                    <span className="lj-file-go">
                      {JOURNEY_FILE.sampleCta}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
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
                  onDrop={onZoneDrop}
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
                      <span className="lj-scan-line">{JOURNEY_FILE.scanning[0]}</span>
                      <span className="lj-scan-finds" data-scan-findings>
                        {journeyScanFindings().map((finding, at) => (
                          <span
                            key={finding.id}
                            className="lj-scan-find"
                            data-finding={finding.id}
                            style={{ ["--lj-i" as string]: at }}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            {finding.text}
                          </span>
                        ))}
                      </span>
                    </span>
                  ) : (
                    <span className="lj-zone-copy">
                      <strong>{JOURNEY_FILE.zoneTitle}</strong>
                      <span>{JOURNEY_FILE.zoneHint}</span>
                    </span>
                  )}
                </button>

                <div className="lj-own">
                  <p className="lj-own-title">{JOURNEY_OWN.title}</p>
                  <p className="lj-own-hint">{JOURNEY_OWN.hint}</p>
                  <button
                    type="button"
                    className="lj-ghost lj-own-pick"
                    disabled={scanning || holding}
                    onClick={() => ownInput.current?.click()}
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    {JOURNEY_OWN.pick}
                  </button>
                  {ownProblems.length ? (
                    <ul className="lj-own-problems" role="alert">
                      {ownProblems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* B kapısının dosya seçicisi: görünmez; düğme açar. Dosya yalnız tarayıcıda tutulur. */}
            {step === "upload" ? (
              <input
                ref={ownInput}
                type="file"
                multiple
                accept={DOCUMENT_UPLOAD_ACCEPT}
                className="lj-own-input"
                tabIndex={-1}
                aria-hidden
                data-guest-input
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void takeOwn(files);
                }}
              />
            ) : null}

            {step === "roadmap" ? (
              <div className="lj-road">
                <ul className="lj-goals" aria-label="Hedef">
                  {journeyGoals(segment.examWord).map((goal) => (
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
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* Ürünün kendi ekranı: ders, konu testi, kartlar, doğru/yanlış. */}
            {product && !showResult ? (
              <div className="lj-product" data-acted={acted ? "" : undefined}>
                <p className="lj-real">{JOURNEY_COPY.real}</p>
                {screens.status === "ready" ? (
                  <screens.View
                    key={`${run}:${step}`}
                    screen={step}
                    onDone={() => {
                      if (step !== "check" && following) go(following);
                    }}
                    onExit={() => go("roadmap")}
                    onQuestion={(correct) => {
                      setQuestionCorrect((current) => (current === null ? correct : current));
                      // Cevap kontrol edildi: ürünün kendi "Testi bitir" düğmesi çekilir, tur düğmesi ana düğme olur.
                      setActedStep("question");
                    }}
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
              </div>
            ) : null}

            {/* 7. Plus: ürünün kendi parçalarıyla üç canlı önizleme. Dar ekranda seçiciyle tek tek. */}
            {step === "plus" ? (
              <div className="lj-plus">
                {wide ? null : (
                  <div className="lj-plus-tabs" role="tablist" aria-label="Plus önizlemeleri">
                    {/* Seçici aşağıdaki kart listesini yönetir. */}
                    {JOURNEY_PLUS_PREVIEWS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={item.id === preview}
                        aria-controls="lj-plus-previews"
                        className={cn("lj-plus-tab", item.id === preview && "is-on")}
                        onClick={() => setPreview(item.id)}
                      >
                        <span aria-hidden>{item.icon}</span>
                        {item.tab}
                      </button>
                    ))}
                  </div>
                )}
                <ul id="lj-plus-previews" className={cn("lj-plus-grid", wide && "is-wide")}>
                  {shownPreviews.map((item) => (
                    <li key={item.id} className="lj-plus-card" data-plus-preview={item.id}>
                      <p className="lj-plus-head">
                        <span className="lj-plus-icon" aria-hidden>
                          {item.icon}
                        </span>
                        <strong>{item.title}</strong>
                        <span className="lj-plus-badge">
                          <Lock className="h-3 w-3" aria-hidden />
                          Plus
                        </span>
                      </p>
                      <p className="lj-plus-body">{item.body}</p>
                      {previews.status === "ready" ? (
                        <previews.View key={`${run}:${item.id}`} preview={item.id} />
                      ) : (
                        <div className="lj-plus-wait">
                          {previews.status === "failed" ? (
                            <>
                              <span>{JOURNEY_COPY.failed}</span>
                              <button type="button" className="lj-ghost" onClick={loadPreviews}>
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
                      )}
                      <p className="lj-plus-note">{item.note}</p>
                    </li>
                  ))}
                </ul>
                <p className="lj-plus-also">{JOURNEY_PLUS_ALSO}</p>

                <div className="lj-final">
                  <p className="lj-final-title">{JOURNEY_FINAL.title}</p>
                  <p className="lj-final-body">{JOURNEY_FINAL.body}</p>
                  <p className="lj-final-fine">{JOURNEY_FINAL.fine}</p>
                  <button type="button" className="lj-link" onClick={restart}>
                    {JOURNEY_COPY.restart}
                  </button>
                </div>
              </div>
            ) : null}

            </div>

            {/*
              Sahnenin alt şeridi (A1): adımın ilerleme düğmesi gövdenin dışında durur, gövde kaysa da yerinde kalır.
              Not adımında yok (ilerleme taramayla). Ürün ekranında "sıradaki adım" düğmesi; adım oynanmadan da ilerlenir.
              Tek ana düğme (A3): ürün ekranındaki iş bitene kadar soluk, bitince 600 ms'de ana düğmeye döner.
            */}
            {step === "roadmap" ? (
              <div className="lj-stage-foot">
                <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("lesson")}>
                  <span aria-hidden>👉</span>
                  {JOURNEY_ROADMAP.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
            {following && product && !showResult ? (
              <div className="lj-stage-foot">
                <button type="button" className={cn("lj-next", acted && "is-primary")} onClick={() => go(following)}>
                  <span aria-hidden>👉</span>
                  {JOURNEY_NEXT_LABEL[step]}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
            {showResult ? (
              <div className="lj-stage-foot">
                <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("plus")}>
                  <span aria-hidden>👉</span>
                  {JOURNEY_RESULT.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
            {step === "plus" ? (
              <div className="lj-stage-foot">
                <Link href={signupHref} className="lj-cta lj-cta--pulse lj-cta--hero">
                  <span aria-hidden>🚀</span>
                  {guest ? JOURNEY_FINAL.ctaWithDocument : JOURNEY_FINAL.cta}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
