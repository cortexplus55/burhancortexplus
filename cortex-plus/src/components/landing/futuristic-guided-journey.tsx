"use client";

import Link from "next/link";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, Check, FileText, Lock, X } from "lucide-react";
import { isFileDrag, LessonCore, type CorePhase } from "@/components/landing/lesson-core";
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
import { warmMathFonts } from "@/lib/learning/math-fonts";
import { trackForSegment, type GuestTrackId } from "@/lib/marketing/guest-demo-tracks";
import {
  DEFAULT_EXAM_DAYS,
  JOURNEY_COPY,
  JOURNEY_DATE,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_NEXT_LABEL,
  JOURNEY_OWN,
  JOURNEY_PLUS_ALSO,
  JOURNEY_RESULT,
  JOURNEY_STEPS,
  JOURNEY_WARNING_STEPS,
  isProductStep,
  journeyDayPlan,
  journeyFile,
  journeyGoals,
  journeyGuideLine,
  journeyOutputs,
  journeyPlusPreviews,
  journeyRoadmap,
  journeyScanFindings,
  journeyScore,
  journeyLoginHref,
  journeySignupHref,
  journeyStepIndex,
  journeyWarning,
  nextJourneyStep,
  ownReadyTitle,
  type JourneyExamDays,
  type JourneyPlusPreviewId,
  type JourneyStepId,
} from "@/lib/marketing/landing-journey";
import { writeTourProgress } from "@/lib/marketing/guest-tour-progress";
import { audienceSegment, type AudienceSegmentId } from "@/lib/marketing/landing-showcase";
import { MOMENT_MS, startMoment, type MomentHandle } from "@/lib/ui/moment";
import { cn } from "@/lib/utils";
import "@/styles/landing-journey.css";
import "@/styles/tour-product.css";

/** Halkanın çevresi (r = 34). */
const RING = 2 * Math.PI * 34;

/** Stüdyoda içerik ekrana sığmazsa küçültülür; bunun altına inmez (çok kısa ekran). */
const FIT_MIN = 0.5;

/**
 * Turun kendi yazılarında (tarama bulguları, uyarı) alt simge: "d_sıvı" → d<sub>sıvı</sub>. Ürün ekranlarında aynı
 * gösterimi ürünün metin bileşeni kurar; tur çerçevesi KaTeX yüklemez.
 */
function withSubscripts(text: string): ReactNode {
  const parts = text.split(/(?<=\p{L})_([\p{L}\p{N}]{1,8})/u);
  if (parts.length === 1) return text;
  return parts.map((part, at) => (at % 2 ? <sub key={at}>{part}</sub> : <Fragment key={at}>{part}</Fragment>));
}

type Lazy<Props> = { status: "idle" | "loading" | "failed" } | { status: "ready"; View: ComponentType<Props> };

/**
 * Kaydırmasız sahne (13 Kasım 2026, ürün sahibinin kararı: "hiçbir adımda aşağı-yukarı kaydırma yok"). Adımın içeriği
 * sahneye sığmıyorsa orantılı küçültülür; sahne hiç kaymaz (taşan kısım kırpılmaz, küçülür). Sahne `overflow: clip`:
 * ürün ekranının kendi `scrollIntoView` çağrıları da sahneyi kaydıramaz. Ölçü değişince (cevap açılınca, ekran
 * değişince, pencere boyu değişince) yeniden hesaplanır. Kullanılabilir yükseklik `--lj-avail` olarak yayınlanır:
 * açıklama panelleri gibi parçalar en çok o kadar yer kaplasın.
 */
function FitStage({ children, fitKey }: { children: ReactNode; fitKey: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    let frame = 0;
    /** Son hesaplanan ölçüler: kendi genişlik değişikliğimizin tetiklediği gözlem yeniden hesap açmasın. */
    let settled = "";
    const set = (scale: number) => content.style.setProperty("--lj-fit", scale.toFixed(4));
    /*
      Küçültülen içerik aynı oranda genişletilir (`width: 100% / ölçek`): satırlar kısalır, yükseklik azalır, daha büyük
      bir ölçek sığar. En büyük sığan ölçek birkaç adımda aranır (her adım bir yerleşim ölçümü).
    */
    const apply = () => {
      const available = box.clientHeight;
      box.style.setProperty("--lj-avail", `${available}px`);
      let best = FIT_MIN;
      let scale = 1;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        set(scale);
        const height = content.offsetHeight;
        if (height * scale <= available + 1) {
          best = Math.max(best, scale);
          if (scale >= 1) break;
          const up = Math.min(1, available / height);
          if (up <= scale + 0.005) break;
          scale = up;
        } else {
          const down = Math.max(FIT_MIN, available / height);
          scale = down < scale - 0.005 ? down : Math.max(FIT_MIN, scale - 0.03);
          if (scale <= FIT_MIN && best <= FIT_MIN) break;
        }
      }
      set(best);
      content.toggleAttribute("data-scaled", best < 1);
      settled = `${box.clientWidth}x${available}:${content.offsetWidth}x${content.offsetHeight}`;
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const now = `${box.clientWidth}x${box.clientHeight}:${content.offsetWidth}x${content.offsetHeight}`;
      if (now === settled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(box);
    observer.observe(content);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fitKey]);
  return (
    <div ref={outer} className="lj-fit">
      <div ref={inner} className="lj-fit-inner">
        {children}
      </div>
    </div>
  );
}

/**
 * Ana sayfanın canlı turu (11 Kasım 2026; 13 Kasım 2026 tam ekran stüdyo).
 *
 * Ana sayfada yalnız birinci adım durur: iki kapı. A: hazır örnek not; kart tarama çekirdeğine sürüklenir ya da
 * dokunulur. B: misafirin kendi dosyası; sunucuya gönderilmez, tarayıcıda bekler (`guest-handoff.ts`) ve kayıt
 * bağlantısı onu kuruluma taşır. Ana sayfada iç kaydırmalı kutu yok: sayfa tek parça kayar.
 *
 * Örnek nota dokununca **tam ekran stüdyo** açılır (13 Kasım 2026, ürün sahibinin kararı): üstte 1-7 adım rayı,
 * hoca uyarısı ve kapatma; ortada adımın kendisi; altta tek ilerleme düğmesi. Hiçbir adımda kaydırma yok: sahne
 * ekrana sığar (`FitStage`). Sayfa arkada kilitli; Escape ya da ✕ ana sayfaya döner.
 *
 * Ders, soru, kart ve doğru/yanlış adımlarında tur kendi çizimini göstermez; **ürünün kendi ekranı** çalışır
 * (`tour/product-screens.tsx`), örnek veriyle (`lib/demo/guest-tour.ts`) ve bir uygulama çerçevesinin içinde. Plus
 * adımında ürünün kendi parçalarıyla üç canlı önizleme durur (`tour/plus-previews.tsx`). Tur yalnız sırayı, ilerleme
 * rayını ve sonucu tutar.
 *
 * Ürün ekranları ve önizlemeler ayrı parçalardır ve ilk yükte yoktur: ziyaretçi tura dokununca (ya da adıma gelince)
 * yüklenir; uygulamanın stil dosyası büyük. Yükleme düz `import()` ile yapılır; Suspense sınırı yok (bu projede
 * sayfayı boşaltıyor). `import()` bir geçişin içinde çağrılır: stil dosyaları inerken tıklamalar donmasın (aşağıdaki
 * `loadScreens` notu). Tur model çağırmaz, sunucuya istek atmaz. Hareket yalnız CSS'te ve `prefers-reduced-motion`da
 * durur; tarama beklemesi de o zaman atlanır.
 *
 * Faz 7 (20 Kasım 2026): tur seçilen branşın örnek notuyla oynanır. Branş değişince tur notun kendisinden, birinci
 * adımdan yeniden kurulur: cevaplar o notun sorularınındı.
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi: "birinci adımda üç kutu yarışıyor, iki seçici kafa karıştırıyor"): branş şeridi
 * kalktı; branş kahramanın tek seçicisinden gelir (`AudienceHero` → `trackId`). Canlı rozeti, konsol başlığı ve
 * bağlam satırı kalktı; bölümün başlığı ekran okuyucuda.
 *
 * Faz 9.1 (20 Kasım 2026, ürün sahibi Faz 9'un tek kartını geri çevirdi): birinci adım "Çekirdeğe bırak"
 * (`LessonCore`). Ziyaretçi seçili branşın örnek notunu ders çekirdeğine kendi eliyle götürür (sürükle ya da dokun);
 * tarama ana sayfada olur, "Sınavın ne zaman?" sorulur, gün seçilince çekirdekten ilk ders doğar (üç kart, günlere
 * yayılmış küçük yol) ve "İlk ekranı aç" stüdyoyu doğrudan dersin ilk ekranında açar. Ray yol haritasına (2. adım)
 * yine götürür. Seçilen gün stüdyodaki "Sınavına N gün var" çipine ve tur kaydına (`cp:guest-tour`) yazılır.
 */
/**
 * Uzun dosya adı telefonda kelimenin ortasından ("…Notu.pd / f") kırılıyordu: alt çizgilerden sonra kırılma fırsatı
 * (`<wbr>`) verilir, ".pdf" son parçada bütün kalır. Metin aynı (ekran okuyucu ve testler için).
 */
function breakableFileName(name: string): ReactNode {
  const parts = name.split("_");
  return parts.map((part, at) => (
    <Fragment key={`${part}-${at}`}>
      {part}
      {at < parts.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

export function FuturisticGuidedJourney({
  segmentId,
  trackId: trackProp,
}: {
  segmentId: AudienceSegmentId;
  /** Seçili branş; verilmezse profilin branşı. */
  trackId?: GuestTrackId;
}) {
  const trackId = trackProp ?? trackForSegment(segmentId);
  const [step, setStep] = useState<JourneyStepId>("upload");
  /** Tam ekran stüdyo açık mı. */
  const [studio, setStudio] = useState(false);
  /** Stüdyo `document.body`'ye çizilir; sunucuda ve ilk çizimde yok. */
  const [portalReady, setPortalReady] = useState(false);
  /** Ana sayfadaki birinci adımın hâli: not çekirdekte değil, tarama ve sınav günü, dersin doğuşu. */
  const [phase, setPhase] = useState<CorePhase>("idle");
  /** Birinci adımda seçilen sınav günü; seçilmediyse null (stüdyoda 7 gün yazılır). */
  const [examDays, setExamDays] = useState<JourneyExamDays | null>(null);
  /** Tarama bulgularının anı bitti mi (ya da atlandı). */
  const [findingsShown, setFindingsShown] = useState(false);
  /** Konu testi sorusu ilk kilitlendiğinde doğru muydu; cevaplanmadıysa null. */
  const [questionCorrect, setQuestionCorrect] = useState<boolean | null>(null);
  /** Doğru/yanlış önermelerinin sonucu; bitmediyse null. */
  const [truth, setTruth] = useState<{ right: number; total: number } | null>(null);
  /** Her "baştan oyna"da ürün ekranları sıfırdan kurulsun. */
  const [run, setRun] = useState(0);
  const [screens, setScreens] = useState<Lazy<TourScreenProps>>({ status: "idle" });
  const [previews, setPreviews] = useState<Lazy<TourPlusPreviewProps>>({ status: "idle" });
  const [preview, setPreview] = useState<JourneyPlusPreviewId>("podcast");
  /** Misafirin bu sekmede beklettiği kendi dosyası (B kapısı); yoksa null. */
  const [guest, setGuest] = useState<GuestMarker | null>(null);
  const [holding, setHolding] = useState(false);
  const [ownProblems, setOwnProblems] = useState<string[]>([]);
  /**
   * Tek ana düğme (A3): ürün ekranındaki iş bu ziyarette bittiyse adımın kimliği. Bitene kadar çerçevedeki ürün
   * düğmesi tek ana düğmedir, alttaki tur düğmesi soluk durur; iş bitince tur düğmesi ana düğmeye döner.
   */
  const [actedStep, setActedStep] = useState<JourneyStepId | null>(null);
  /** Hoca uyarısının izi (A4): uyarıdan çıkan adıma girilince etiketin çerçevesi bir kez parlar. */
  const [warningGlow, setWarningGlow] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  /** Tarama bulgularının anı (ana sayfada). */
  const findingsMoment = useRef<MomentHandle | null>(null);
  /** Stüdyoyu açan öğe: kapanınca odak ona döner. */
  const opener = useRef<HTMLElement | null>(null);
  /** Bileşen sayfada mı: sayfadan çıkılınca biten an yolu açmaya çalışmasın. */
  const alive = useRef(true);
  const loadingScreens = useRef(false);
  const loadingPreviews = useRef(false);
  /** Branş bu ziyarette en az bir kez değişti mi: örnek notun rozeti yalnız o zaman yeniden belirir (ilk yükte hareket yok). */
  const [switched, setSwitched] = useState(false);

  const segment = audienceSegment(segmentId);
  const file = journeyFile(trackId);
  const warning = journeyWarning(trackId);
  const roadmap = journeyRoadmap(trackId);
  const plusPreviews = journeyPlusPreviews(trackId);
  /** Branşın podcast kesiti yoksa seçici o kartı hiç göstermez; seçim ilk gösterilen önizlemeye düşer. */
  const activePreview = plusPreviews.some((item) => item.id === preview) ? preview : plusPreviews[0]!.id;
  const index = journeyStepIndex(step);
  /*
    Ana sayfadaki ray: ders doğunca birinci adım bitmiş, yol (2. adım) önünde sayılır; doğan dersin altındaki küçük
    yol o adımın ön izlemesidir. Stüdyoda ray adımın kendisini gösterir.
  */
  const homeIndex = !studio && step === "upload" && phase === "born" ? 1 : index;
  const score = journeyScore({ questionCorrect, truth });
  const product = isProductStep(step);
  /** Birinci adımda misafirin kendi dosyası bekliyor: örnek not ve çekirdek yerine onay kartı durur. */
  const ownReady = guest !== null && phase === "idle";
  const shownDays = examDays ?? DEFAULT_EXAM_DAYS;
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
    setActedStep(null);
    setStep(next);
  }, []);

  /** Birinci adım baştan: not yeniden çekirdeğin dışında, gün seçilmemiş. */
  const resetCore = useCallback(() => {
    findingsMoment.current?.end();
    findingsMoment.current = null;
    setPhase("idle");
    setExamDays(null);
    setFindingsShown(false);
  }, []);

  /** Stüdyoyu açar (birinci adım dışındaki her adım stüdyoda oynar). */
  const openStudio = useCallback(
    (at: JourneyStepId | null) => {
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
      if (at) go(at);
      setStudio(true);
    },
    [go],
  );

  /** Stüdyoyu kapatır: ana sayfa birinci adımla kalır, tur ilerlemesi (ray, cevaplar) korunur. */
  const closeStudio = useCallback(() => {
    setStudio(false);
  }, []);

  /*
    Branş değişince tur o branşın notundan yeniden kurulur: birinci adım (yeni not, yeni tarama), cevaplar ve
    sonuç sıfır, ürün ekranları baştan. Tur ortadaysa (stüdyo kapatılıp ilerleme korunmuşsa) ray da başa döner; eski
    notun cevapları yeni notun sonucuna karışmaz.
  */
  const shownTrack = useRef(trackId);
  useEffect(() => {
    if (shownTrack.current === trackId) return;
    shownTrack.current = trackId;
    resetCore();
    setQuestionCorrect(null);
    setTruth(null);
    setRun((current) => current + 1);
    setPreview("podcast");
    setStudio(false);
    setSwitched(true);
    go("upload");
  }, [trackId, go, resetCore]);

  // Bu sekmede bekleyen dosya varsa (kayıttan dönen ziyaretçi) kart yeniden görünür; süresi geçmiş kayıt silinir.
  useEffect(() => {
    setGuest(readGuestMarker());
    void purgeStaleGuestDocuments();
    setPortalReady(true);
  }, []);

  // Adıma doğrudan gelindiyse (raydan) ve parça henüz istenmediyse şimdi istenir.
  useEffect(() => {
    if (product) loadScreens();
    // Önizlemeler Plus adımından iki adım önce yüklenmeye başlar: ziyaretçi geldiğinde hazır olur.
    if (step === "cards" || step === "check" || step === "plus") loadPreviews();
  }, [product, step, loadScreens, loadPreviews]);

  /*
    Ürün ekranları hazır olunca (stil dosyaları, dolayısıyla KaTeX'in yazı tipi tanımları yüklendi) formül yazı tipleri
    hemen istenir: derste ilk formül kartı geldiğinde harfler görünmez kalıp yalnız √ çizilmesin (Faz 9, `math-fonts.ts`).
  */
  useEffect(() => {
    if (screens.status === "ready") warmMathFonts();
  }, [screens.status]);

  /*
    Stüdyo açıkken sayfa arkada kilitli (kaydırma yalnız stüdyoda da yok), odak stüdyoya gelir; Escape ve ✕ kapatır,
    odak açan öğeye döner. Tarama anı stüdyoda değil, ana sayfada (Faz 9.1).
  */
  useEffect(() => {
    if (!studio) return;
    const root = document.documentElement;
    const previousRoot = root.style.overflow;
    const previousBody = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    studioRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeStudio();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previousRoot;
      document.body.style.overflow = previousBody;
      opener.current?.focus({ preventScroll: true });
    };
  }, [studio, closeStudio]);

  // Turdan kayda süreklilik (C3): stüdyoda ulaşılan adım bu sekmenin oturumuna yazılır; kayıttan sonra ana ekran
  // "turda denemiştin" kartını yalnız buna bakarak gösterir. Sunucuya gitmez; cevaplar ölçüm sayılmaz. Kart turdaki
  // konuyu (Köklü Sayılar) resmî kurulumda açar: yalnız lise branşı yazar, öbür branşların notu o kurulumda yok.
  // Faz 9.1: birinci adımda seçilen sınav günü de yazılır; kurulum sihirbazı taslağı yoksa tarihi bugün + o gün açar.
  useEffect(() => {
    if (studio && step !== "upload" && trackId === "lise") writeTourProgress({ step, segment: segmentId, days: examDays });
  }, [studio, step, segmentId, trackId, examDays]);

  // Adım değişince sahne odağa gelir (ekran okuyucu yeni adımı okur); sayfa kaymaz.
  useEffect(() => {
    if (studio) stageRef.current?.focus({ preventScroll: true });
  }, [step, studio]);

  /*
    Hoca uyarısının izi (A4): uyarıdan çıkan adıma (ders, soru, kart, doğru/yanlış) girilince üst çubuktaki
    "Hoca uyarısı" etiketinin çerçevesi logonun şeridiyle bir kez (600 ms) parlar. Bir an (depo kararı 11): tıklama ya
    da tuş hemen bitirir; hareket azaltmada parlama yok, etiket durağan.
  */
  useEffect(() => {
    if (!studio || !JOURNEY_WARNING_STEPS.includes(step)) {
      setWarningGlow(false);
      return;
    }
    setWarningGlow(true);
    const handle = startMoment(MOMENT_MS.settle, () => setWarningGlow(false));
    return () => handle.end();
  }, [step, studio]);

  useEffect(
    () => {
      alive.current = true;
      return () => {
        // Sayfadan çıkılırsa an sessizce kapanır.
        alive.current = false;
        findingsMoment.current?.end();
        findingsMoment.current = null;
      };
    },
    [],
  );

  /*
    Tarama anı (A2, Faz 9.1'de ana sayfaya taşındı): not çekirdeğe girer, halkalardan bir dalga atar, örnek notun
    bulguları sırayla belirir; aynı anda "Sınavın ne zaman?" sorulur. Bir an (depo kararı 11): 1,2 sn; tıklama ya da
    Enter / Space / Escape hepsini hemen gösterir; hareket azaltmada beklenmez. Ürün ekranları şimdiden istenir: ders
    açılınca hazır olsun.
  */
  function absorbSample() {
    if (phase !== "idle") return;
    loadScreens();
    setFindingsShown(false);
    setPhase("scanning");
    const handle = startMoment(JOURNEY_FILE.findingsMs, () => {
      findingsMoment.current = null;
      if (alive.current) setFindingsShown(true);
    });
    if (!handle.instant) findingsMoment.current = handle;
  }

  // Bulgular görünüp sınav günü seçilince ders doğar (çip bulgulardan önce seçilirse bulgular bitince).
  useEffect(() => {
    if (phase === "scanning" && findingsShown && examDays) setPhase("born");
  }, [phase, findingsShown, examDays]);

  /** Dersin doğuşunun birincil düğmesi: stüdyo doğrudan dersin ilk ekranında açılır. */
  function openLesson() {
    loadScreens();
    openStudio("lesson");
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

  function restart() {
    setQuestionCorrect(null);
    setTruth(null);
    setRun((current) => current + 1);
    closeStudio();
    resetCore();
    go("upload");
  }

  /** Raydaki durak: birinci adım ana sayfada (not yeniden çekirdeğin dışında), öbürleri stüdyoda açılır. */
  function goStep(id: JourneyStepId) {
    if (id === "upload") {
      closeStudio();
      resetCore();
      go("upload");
      return;
    }
    if (studio) go(id);
    else openStudio(id);
  }

  const allRight = score.answered >= 2 && score.correct === score.answered;
  const streak = allRight ? streakBadge(score.correct) : null;
  const following = nextJourneyStep(step);
  const signupHref = journeySignupHref(segmentId, { withDocument: Boolean(guest) });
  const shownPreviews = plusPreviews.filter((item) => item.id === activePreview);

  /** İlerleme rayı: logonun şeridi. Her durak tıklanır; dolan kısım geçilen adımlardır. */
  function renderRail(at: number) {
    return (
      <ol className="lj-rail" style={{ ["--lj-progress" as string]: at / (JOURNEY_STEPS.length - 1) }}>
        {JOURNEY_STEPS.map((item, stop) => (
          <li key={item.id} className="lj-rail-item">
            <button
              type="button"
              className={cn("lj-stop", stop < at && "is-done", stop === at && "is-on")}
              aria-current={stop === at ? "step" : undefined}
              aria-label={`Adım ${stop + 1}: ${item.title}`}
              onClick={() => goStep(item.id)}
            >
              <span className="lj-stop-dot" aria-hidden>
                {stop < at ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : stop + 1}
              </span>
              <span className="lj-stop-label" aria-hidden>
                {item.short}
              </span>
            </button>
          </li>
        ))}
      </ol>
    );
  }

  /** Stüdyonun sahnesindeki adım (birinci adım ana sayfada; stüdyo yol haritasından başlar). */
  function renderStudioStep() {
    return (
      <>
        {step === "roadmap" ? (
          <div className="lj-road" data-track={trackId}>
            <ul className="lj-goals" aria-label="Hedef">
              {journeyGoals(segment.examWord, shownDays).map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
            <ol className="lj-days">
              {roadmap.days.map((day, at) => (
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
                key={`${run}:${trackId}:${step}`}
                screen={step}
                track={trackId}
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

        {/*
          7. Plus: ürünün kendi parçalarıyla üç canlı önizleme, seçiciyle tek tek (stüdyo kaydırmasız: üçü yan yana
          ekrana okunur boyutta sığmıyordu). Geniş ekranda son blok önizlemenin yanında.
        */}
        {step === "plus" ? (
          <div className="lj-plus">
            <div className="lj-plus-tabs" role="tablist" aria-label="Plus önizlemeleri">
              {/* Seçici aşağıdaki kart listesini yönetir. Branşın podcast kesiti yoksa podcast sekmesi yok. */}
              {plusPreviews.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === activePreview}
                  aria-controls="lj-plus-previews"
                  className={cn("lj-plus-tab", item.id === activePreview && "is-on")}
                  onClick={() => setPreview(item.id)}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.tab}
                </button>
              ))}
            </div>
            <ul id="lj-plus-previews" className="lj-plus-grid">
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
                    <previews.View key={`${run}:${trackId}:${item.id}`} preview={item.id} track={trackId} />
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
      </>
    );
  }

  /*
    Stüdyonun alt çubuğu: adımın ilerleme düğmesi hep ekranın altında. Not adımında yok (ilerleme taramayla). Ürün
    ekranında "sıradaki adım" düğmesi; adım oynanmadan da ilerlenir. Tek ana düğme (A3): ürün ekranındaki iş bitene
    kadar soluk, bitince 600 ms'de ana düğmeye döner.
  */
  function renderFoot() {
    if (step === "roadmap") {
      return (
        <div className="lj-stage-foot">
          <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("lesson")}>
            <span aria-hidden>👉</span>
            {roadmap.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      );
    }
    if (following && product && !showResult) {
      return (
        <div className="lj-stage-foot">
          <button type="button" className={cn("lj-next", acted && "is-primary")} onClick={() => go(following)}>
            <span aria-hidden>👉</span>
            {JOURNEY_NEXT_LABEL[step]}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      );
    }
    if (showResult) {
      return (
        <div className="lj-stage-foot">
          <button type="button" className="lj-cta lj-cta--pulse lj-cta--wide" onClick={() => go("plus")}>
            <span aria-hidden>👉</span>
            {JOURNEY_RESULT.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      );
    }
    if (step === "plus") {
      return (
        <div className="lj-stage-foot">
          <Link href={signupHref} className="lj-cta lj-cta--pulse lj-cta--hero">
            <span aria-hidden>🚀</span>
            {guest ? JOURNEY_FINAL.ctaWithDocument : JOURNEY_FINAL.cta}
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      );
    }
    return null;
  }

  const studioView =
    studio && portalReady
      ? createPortal(
          <div
            ref={studioRef}
            className="lj-studio"
            role="dialog"
            aria-modal="true"
            aria-label={JOURNEY_COPY.title}
            tabIndex={-1}
            data-step={step}
            onDragOver={(event) => {
              if (isFileDrag(event)) event.preventDefault();
            }}
          >
            <div className="lj-studio-top">
              {renderRail(index)}
              {/* Taramadan sonra (2-7. adımlar) örnek notun hoca uyarısı üst çubukta kalır (A4). */}
              {step !== "upload" ? (
                <span className={cn("lj-warn", warningGlow && "is-glow")} title={warning.line} data-warning data-track={trackId}>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {warning.label}
                  <span className="sr-only">{withSubscripts(warning.line.slice(warning.label.length))}</span>
                </span>
              ) : (
                <span className="lj-warn-slot" aria-hidden />
              )}
              <button type="button" className="lj-studio-close" aria-label={JOURNEY_COPY.close} onClick={closeStudio}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div ref={stageRef} className="lj-stage" tabIndex={-1} data-step={step}>
              <div className="lj-stage-head">
                <h2 className="lj-step-title">{JOURNEY_STEPS[index]!.title}</h2>
                <p className="lj-guide" role="status" aria-live="polite">
                  <span aria-hidden>{step === "cards" ? "👆" : "👉"}</span> {journeyGuideLine(step)}
                </p>
              </div>
              <FitStage fitKey={`${run}:${trackId}:${step}:${showResult ? "r" : ""}:${screens.status}:${previews.status}:${activePreview}`}>
                {renderStudioStep()}
              </FitStage>
              {renderFoot()}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section id="nasil" className="lj" aria-labelledby="lj-title" data-track={trackId}>
      <div className="lj-wrap" inert={studio || undefined} aria-hidden={studio || undefined}>
        {/* Birinci adım (Faz 9.1): ray ve ders çekirdeği. İç kaydırma yok; sayfa tek parça kayar. */}
        <div
          className="lj-console"
          data-segment={segmentId}
          onPointerEnter={loadScreens}
          onPointerDown={loadScreens}
          onFocusCapture={loadScreens}
          onDragOver={(event) => {
            // Dosya turun neresine bırakılırsa bırakılsın tarayıcı onu açmaya kalkmasın.
            if (isFileDrag(event)) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            void takeOwn(Array.from(event.dataTransfer.files));
          }}
        >
          <h2 id="lj-title" className="sr-only">
            {JOURNEY_COPY.card}
          </h2>

          {renderRail(homeIndex)}

          <div className="lj-door" data-step="upload" data-phase={phase}>
            {/* Adımın durumu ekran okuyucuda: yönlendirme, tarama sonrası soru, dersin doğuşu. */}
            <p className="sr-only" role="status" aria-live="polite">
              {phase === "scanning"
                ? JOURNEY_DATE.scanned
                : phase === "born" && examDays
                  ? JOURNEY_DATE.born(examDays)
                  : journeyGuideLine("upload", { ownDocument: ownReady })}
            </p>

            {/* Kendi dosyası seçildikten sonra: dosya tarayıcıda bekliyor. */}
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
                {/* Faz 5 §1.3: hesabı olan misafir de dosyasını kaybetmez; girişten sonra kurulum sihirbazına aktarılır. */}
                <Link href={journeyLoginHref()} className="lj-link lj-ready-login" data-guest-login>
                  {JOURNEY_OWN.login}
                </Link>
                <div className="lj-ready-row">
                  <button type="button" className="lj-ghost" onClick={absorbSample}>
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
            ) : (
              <LessonCore
                phase={phase}
                trackId={trackId}
                switched={switched}
                fileName={breakableFileName(file.name)}
                fileLabel={file.name}
                pagesLabel={file.pagesLabel}
                findings={journeyScanFindings(trackId).map((finding) => ({ id: finding.id, text: withSubscripts(finding.text) }))}
                findingsShown={findingsShown}
                examDays={examDays}
                outputs={journeyOutputs(trackId)}
                plan={examDays ? journeyDayPlan(examDays) : null}
                holding={holding}
                problems={ownProblems}
                onAbsorb={absorbSample}
                onOwnFiles={(files) => void takeOwn(files)}
                onPickOwn={() => ownInput.current?.click()}
                onDays={setExamDays}
                onOpenLesson={openLesson}
              />
            )}

            {/* Kendi dosyasının seçicisi: görünmez; "Kendi notunu bırak" yuvası açar. Dosya yalnız tarayıcıda tutulur. */}
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
          </div>
        </div>
      </div>
      {studioView}
    </section>
  );
}
