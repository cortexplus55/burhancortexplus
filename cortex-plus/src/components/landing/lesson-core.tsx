"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ArrowRight, BookOpen, Check, Layers, ListChecks, Paperclip } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import {
  JOURNEY_DATE,
  JOURNEY_EXAM_DAYS,
  JOURNEY_FILE,
  JOURNEY_OWN,
  type JourneyDayRow,
  type JourneyExamDays,
  type JourneyOutput,
} from "@/lib/marketing/landing-journey";
import { prefersReducedMotion } from "@/lib/ui/moment";
import { cn } from "@/lib/utils";

/** Birinci adımın hâli: not çekirdeğe bırakılmadı, tarama ve sınav günü, dersin doğuşu. */
export type CorePhase = "idle" | "scanning" | "born";

/** Not çekirdeğin çemberine bu kadar yaklaşınca mıknatıs gibi oturur (px). */
export const CORE_MAGNET_PX = 60;
/** Bu kadar kımıldamadan sürükleme sayılmaz: dokunuş tıklamadır (px). */
const DRAG_START_PX = 6;

/** Sürüklenen şey işletim sisteminden bir dosya mı (örnek not kartı değil)? */
export function isFileDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

const OUTPUT_ICONS = { lesson: BookOpen, question: ListChecks, cards: Layers } as const;

type Offset = { x: number; y: number };

/**
 * Ana sayfanın birinci adımı (Faz 9.1, 20 Kasım 2026; ürün sahibinin seçimi "Çekirdeğe bırak"). Ziyaretçi seçili
 * branşın örnek notunu kendi eliyle tutup ders çekirdeğine götürür: başladığı şeyi kendisi başlatır.
 *
 * - Sürükleme işaretçi olaylarıyla (fare ve dokunma); `touch-action: none` yalnız kartta, sayfanın kaydırması başka
 *   hiçbir yerde engellenmez. Tutulan kart birkaç derece eğilir; çekirdeğin çemberine ~60 px yaklaşınca merkezine
 *   oturur (mıknatıs), çekirdek büyür, halkalar hızlanır, yazı "Bırak" olur. Çekirdeğin üstünde bırakılınca not içine
 *   çekilir; başka yerde bırakılınca yerine yaylanır.
 * - Erişilebilir eşdeğer: kart bir düğmedir ("Örnek notu çekirdeğe gönder"); karta ya da çekirdeğe dokunmak, Enter ve
 *   Space bırakmakla aynı işi yapar.
 * - Gerçek dosya çekirdeğe ya da "Kendi notunu bırak" yuvasına bırakılırsa misafirin kendi dosyasıdır (`onOwnFiles`):
 *   sunucuya gitmez, tarayıcıda bekler.
 * - Tarama: bulgular sırayla belirir, "Sınavın ne zaman?" sorulur (dört çip). Doğuş: çekirdekten üç kart açılır
 *   (sayılar stüdyonun göstereceği örnek veriden), altında seçilen güne göre küçük yol ve "İlk ekranı aç".
 *
 * Bileşen durum tutar ama yalnız elin hareketi için (konum, mıknatıs, çekilme); hangi hâlde olduğu ve seçimler
 * çağıranda (`FuturisticGuidedJourney`). Ağ isteği yok. Hareket azaltmada kendiliğinden hiçbir şey hareket etmez.
 */
export function LessonCore({
  phase,
  trackId,
  switched,
  fileName,
  fileLabel,
  pagesLabel,
  findings,
  findingsShown,
  examDays,
  outputs,
  plan,
  holding,
  problems,
  onAbsorb,
  onOwnFiles,
  onPickOwn,
  onDays,
  onOpenLesson,
}: {
  phase: CorePhase;
  trackId: string;
  /** Branş bu ziyarette değişti mi: kart yeniden belirir (ilk yükte hareket yok). */
  switched: boolean;
  /** Dosya adı (görünen hâli: alt çizgilerden kırılabilir). */
  fileName: ReactNode;
  /** Dosya adı düz metin (düğmenin ekran okuyucu adı için). */
  fileLabel: string;
  pagesLabel: string;
  findings: { id: string; text: ReactNode }[];
  /** Bulguların anı bitti mi (ya da atlandı): hepsi hemen görünür. */
  findingsShown: boolean;
  examDays: JourneyExamDays | null;
  outputs: JourneyOutput[];
  plan: JourneyDayRow[] | null;
  /** Misafirin dosyası tarayıcıya yazılırken: yuva ve kart beklemede. */
  holding: boolean;
  problems: string[];
  onAbsorb: () => void;
  onOwnFiles: (files: File[]) => void;
  onPickOwn: () => void;
  onDays: (days: JourneyExamDays) => void;
  onOpenLesson: () => void;
}) {
  const baseId = useId();
  const noteRef = useRef<HTMLButtonElement>(null);
  const coreRef = useRef<HTMLButtonElement>(null);
  const orbRef = useRef<HTMLSpanElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; moved: boolean; rest: DOMRect } | null>(null);
  const nearRef = useRef(false);
  const skipClick = useRef(false);
  const absorbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offset, setOffset] = useState<Offset | null>(null);
  const [dragging, setDragging] = useState(false);
  const [near, setNearState] = useState(false);
  const [absorbing, setAbsorbing] = useState(false);
  const [fileOver, setFileOver] = useState<"core" | "slot" | null>(null);
  const idle = phase === "idle";
  const magnet = near || fileOver === "core";

  function setNear(value: boolean) {
    nearRef.current = value;
    setNearState(value);
  }

  // Yeniden başa dönülünce (raydan 1. durak, "baştan oyna", branş değişimi) kart yerinde, sakin.
  useEffect(() => {
    if (phase !== "idle") return;
    drag.current = null;
    nearRef.current = false;
    setNearState(false);
    setOffset(null);
    setDragging(false);
    setAbsorbing(false);
  }, [phase, trackId]);

  useEffect(
    () => () => {
      if (absorbTimer.current) clearTimeout(absorbTimer.current);
    },
    [],
  );

  /*
    Mıknatıs anında halkalar hızlanır: CSS animasyonunun hızı Web Animations ile değişir (animasyon baştan başlamaz,
    halkalar sıçramaz). Tarayıcı desteklemezse halkalar aynı hızda döner; hareket azaltmada zaten dönmez.
  */
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || typeof orb.getAnimations !== "function") return;
    for (const animation of orb.getAnimations({ subtree: true })) {
      const name = (animation as Animation & { animationName?: string }).animationName;
      if (name === "lj-core-spin") animation.playbackRate = magnet ? 4 : 1;
    }
  }, [magnet]);

  /*
    Not çekirdeğe gönderilince kart kaybolur: odak sınav günü sorusuna, doğuşta "İlk ekranı aç"a geçer ve o öğe
    ekranda değilse görünür yere kayar (telefonda soru çekirdeğin altında kalıyordu; yalnız gerekiyorsa, en yakın
    kenara). Odak başka bir yerdeyse (ör. kahramanın seçicisi) alınmaz, sayfa kaymaz.
  */
  useEffect(() => {
    if (phase === "idle" || typeof document === "undefined") return;
    const active = document.activeElement;
    const inside = !active || active === document.body || Boolean(stageRef.current?.contains(active));
    if (!inside) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (phase === "scanning") {
      const chip = datesRef.current?.querySelector<HTMLElement>('[tabindex="0"]');
      chip?.focus({ preventScroll: true });
      chip?.scrollIntoView?.({ block: "nearest", behavior });
      return;
    }
    // Doğuş: gün seçimi klavyeyle sürüyorsa odak çiplerde kalır; düğme yine görünür yere gelir.
    const cta = ctaRef.current;
    if (!cta) return;
    if (!datesRef.current?.contains(document.activeElement)) cta.focus({ preventScroll: true });
    cta.scrollIntoView?.({ block: "nearest", behavior });
  }, [phase]);

  /** Kartın dinlenme yerinden çekirdeğin merkezine uzaklık ve çekirdeğin yarıçapı. */
  function coreTarget(rest: DOMRect): Offset & { radius: number } {
    const orb = orbRef.current?.getBoundingClientRect();
    if (!orb) return { x: 0, y: 0, radius: 0 };
    return {
      x: orb.left + orb.width / 2 - (rest.left + rest.width / 2),
      y: orb.top + orb.height / 2 - (rest.top + rest.height / 2),
      radius: orb.width / 2,
    };
  }

  /** Örnek not çekirdeğe: kart küçülerek içine girer (an), sonra çağıran taramayı başlatır. */
  function absorb() {
    if (!idle || absorbing || holding) return;
    const rest = noteRef.current?.getBoundingClientRect();
    if (!rest || prefersReducedMotion()) {
      onAbsorb();
      return;
    }
    const target = coreTarget(rest);
    setNear(true);
    setOffset({ x: target.x, y: target.y });
    setAbsorbing(true);
    absorbTimer.current = setTimeout(() => {
      absorbTimer.current = null;
      onAbsorb();
    }, JOURNEY_FILE.absorbMs);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!idle || absorbing || holding) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rest = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, x0: event.clientX, y0: event.clientY, moved: false, rest };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* yakalama desteklenmezse sürükleme yine kartın üstünde çalışır */
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.clientX - current.x0;
    const dy = event.clientY - current.y0;
    if (!current.moved) {
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      current.moved = true;
      setDragging(true);
    }
    const target = coreTarget(current.rest);
    const isNear = Math.hypot(target.x - dx, target.y - dy) < target.radius + CORE_MAGNET_PX;
    setNear(isNear);
    setOffset(isNear ? { x: target.x, y: target.y } : { x: dx, y: dy });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    drag.current = null;
    if (!current.moved) return;
    // Sürüklemenin sonundaki tıklama ikinci kez göndermesin.
    skipClick.current = true;
    setTimeout(() => {
      skipClick.current = false;
    }, 0);
    setDragging(false);
    if (!cancelled && nearRef.current) {
      absorb();
      return;
    }
    // Çekirdeğin dışında bırakıldı: kart yerine yaylanır.
    setNear(false);
    setOffset(null);
  }

  function onNoteClick() {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    absorb();
  }

  function fileHandlers(target: "core" | "slot") {
    return {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event) || !idle) return;
        event.preventDefault();
        setFileOver(target);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!isFileDrag(event) || !idle) return;
        event.preventDefault();
        if (fileOver !== target) setFileOver(target);
      },
      onDragLeave: () => setFileOver(null),
      onDrop: (event: DragEvent<HTMLElement>) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        setFileOver(null);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        onOwnFiles(files);
      },
    };
  }

  /** Sınav günü çipleri: tek seçimli grup; ok tuşları seçimi ve odağı birlikte kaydırır. */
  function onDatesKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const delta = keys[event.key];
    if (!delta) return;
    event.preventDefault();
    // Odaktaki çipten kayar (seçim yoksa odak ilk çipte durur; ilk ok tuşu ikinciye geçer).
    const focused = Number((document.activeElement as HTMLElement | null)?.dataset.days);
    const at = JOURNEY_EXAM_DAYS.indexOf((focused || focusDays) as JourneyExamDays);
    const next = JOURNEY_EXAM_DAYS[(at + delta + JOURNEY_EXAM_DAYS.length) % JOURNEY_EXAM_DAYS.length]!;
    onDays(next);
    datesRef.current?.querySelector<HTMLElement>(`[data-days="${next}"]`)?.focus();
  }

  const noteStyle = offset
    ? { transform: `translate(${offset.x}px, ${offset.y}px)${absorbing ? " scale(0.12)" : near ? " scale(0.82)" : ""}` }
    : undefined;
  const focusDays = examDays ?? JOURNEY_EXAM_DAYS[0];
  const titleId = `${baseId}-date`;
  const coreLabel = idle
    ? magnet
      ? JOURNEY_FILE.coreNear
      : JOURNEY_FILE.coreLabel
    : phase === "scanning"
      ? JOURNEY_FILE.coreScanned
      : JOURNEY_FILE.coreBorn;

  return (
    <>
      <div ref={stageRef} className="lj-core-stage" data-phase={phase} data-near={magnet ? "" : undefined} data-track={trackId}>
        {idle ? (
          <div className="lj-core-src">
            <button
              ref={noteRef}
              key={trackId}
              type="button"
              className={cn(
                "lj-note",
                switched && "is-switched",
                dragging && "is-dragging",
                near && "is-near",
                absorbing && "is-absorbing",
              )}
              style={noteStyle}
              disabled={holding}
              aria-label={`${JOURNEY_FILE.send}: ${fileLabel}, ${pagesLabel}`}
              data-sample-start
              data-track={trackId}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => endDrag(event, false)}
              onPointerCancel={(event) => endDrag(event, true)}
              onClick={onNoteClick}
            >
              <span className="lj-note-tag" aria-hidden>
                PDF
              </span>
              <span className="lj-note-name">{fileName}</span>
              <span className="lj-note-meta">
                <span>{pagesLabel}</span>
                <span className="lj-note-grip">{JOURNEY_FILE.grip}</span>
              </span>
            </button>
            <button
              type="button"
              className={cn("lj-own-slot", fileOver === "slot" && "is-over")}
              disabled={holding}
              onClick={onPickOwn}
              data-own-pick
              {...fileHandlers("slot")}
            >
              <Paperclip className="h-4 w-4" aria-hidden />
              <span className="lj-own-slot-text">
                <span>{JOURNEY_OWN.pick}</span>
                <span className="lj-own-types">{JOURNEY_OWN.types}</span>
              </span>
            </button>
            {problems.length ? (
              <ul className="lj-own-problems" role="alert">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {idle ? (
          <span className="lj-core-arc" aria-hidden>
            <svg viewBox="0 0 160 72" preserveAspectRatio="none" focusable="false">
              <defs>
                <linearGradient id={`${baseId}-arc`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#ffb224" />
                  <stop offset="0.36" stopColor="#ff4d8d" />
                  <stop offset="0.68" stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <path className="lj-core-arc-path" d="M4 52 C44 6 112 4 150 40" stroke={`url(#${baseId}-arc)`} />
              <path className="lj-core-arc-head" d="M140 30 L151 41 L136 44" stroke="#22d3ee" />
            </svg>
          </span>
        ) : null}

        <button
          ref={coreRef}
          type="button"
          className="lj-core"
          disabled={!idle || holding}
          onClick={absorb}
          aria-label={`${JOURNEY_FILE.coreName}: ${coreLabel}`}
          data-core
          {...fileHandlers("core")}
        >
          <span ref={orbRef} className="lj-core-orb" aria-hidden>
            <span className="lj-core-ring" />
            <span className="lj-core-ring lj-core-ring--b" />
            <span className="lj-core-wave" />
            <span className="lj-core-disc">
              <CortexMark size={64} />
            </span>
          </span>
          <span className="lj-core-label">{coreLabel}</span>
        </button>

        {/*
          Tarama: bulgular ve "Sınavın ne zaman?". Doğuş: gün seçimi yerinde kalır (fikir değişirse yol hemen yeniden
          dizilir; klavyede ok tuşları seçimi kaydırırken çipler kaybolmaz), altında üç kart, yol ve "İlk ekranı aç".
        */}
        {idle ? null : (
          <div className="lj-core-body" data-born={phase === "born" ? "" : undefined}>
            {phase === "scanning" ? (
              <ul className={cn("lj-scan-finds", findingsShown && "is-shown")} data-scan-findings>
                {findings.map((finding, at) => (
                  <li key={finding.id} className="lj-scan-find" data-finding={finding.id} style={{ ["--lj-i" as string]: at }}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                    <span>{finding.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="lj-date">
              <p id={titleId} className="lj-date-title">
                {JOURNEY_DATE.title}
              </p>
              <div ref={datesRef} className="lj-date-chips" role="radiogroup" aria-labelledby={titleId} onKeyDown={onDatesKey} data-exam-days>
                {JOURNEY_EXAM_DAYS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={examDays === days}
                    tabIndex={focusDays === days ? 0 : -1}
                    className="lj-date-chip"
                    data-days={days}
                    onClick={() => onDays(days)}
                  >
                    {JOURNEY_DATE.chip(days)}
                  </button>
                ))}
              </div>
            </div>
            {phase === "born" ? (
              <>
                <ul className="lj-outputs" aria-label="Notundan çıkan ilk ders">
                  {outputs.map((output, at) => {
                    const Icon = OUTPUT_ICONS[output.id];
                    return (
                      <li key={output.id} className="lj-output" data-output={output.id} style={{ ["--lj-i" as string]: at }}>
                        <strong>
                          <Icon className="h-4 w-4" aria-hidden />
                          {output.title}
                        </strong>
                        <span>{output.meta}</span>
                      </li>
                    );
                  })}
                </ul>
                {plan && examDays ? (
                  <div className="lj-plan">
                    <p className="lj-plan-title">{JOURNEY_DATE.planTitle(examDays)}</p>
                    <ol className="lj-plan-days" data-plan>
                      {plan.map((row) => (
                        <li key={row.when}>
                          <span className="lj-plan-when">{row.when}</span>
                          <span>{row.steps.join(" + ")}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <button ref={ctaRef} type="button" className="lj-cta lj-born-cta" onClick={onOpenLesson} data-open-lesson>
                  {JOURNEY_DATE.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {idle ? (
        <p className="lj-core-hint">
          <span className="lj-core-hint-wide">{JOURNEY_FILE.hintWide}</span>
          <span className="lj-core-hint-narrow">{JOURNEY_FILE.hintNarrow}</span>
        </p>
      ) : null}
    </>
  );
}
