"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, ChevronDown, ChevronUp, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { STUDIOS } from "@/lib/parity/studios";
import { needsPlusOutsideFirstLesson } from "@/lib/billing/free-meters";
import { SKETCH_REEL_LABEL } from "@/lib/learning/video-lesson-labels";
import { studySketchVideoHref } from "@/lib/learning/study-tools";
import type { ActionCode } from "@/lib/env";
import {
  RING_ARC_LIMIT,
  arcPath,
  initialCockpitIndex,
  ringArcs,
  sectorPath,
  type CockpitPrep,
} from "@/lib/learning/home-cockpit-model";
import { MOMENT_MS, easeSettle, startMoment } from "@/lib/ui/moment";
import { Gate } from "@/components/entitlements/gate";
import { useGate } from "@/components/entitlements/entitlement-ui";
import type { Action, GateContext } from "@/lib/entitlements/types";
import { isRingMemory, readMoment, ringMemoryKey, writeMoment, type RingMemory } from "@/lib/ui/moment-memory";
import "@/styles/home-cockpit.css";

/**
 * Ana ekran göstergesi (13 Kasım 2026, ürün sahibinin kararı): sol sınav şeridi, ortada konu halkası, sağda metin
 * bloğu. Seçim sayfa değiştirmez; yazma çubuğundaki araç tepsisi de aynı seçimi okur (bağlam).
 */

type Selection = {
  preps: CockpitPrep[];
  prepIndex: number;
  topicIndex: number;
  selectPrep: (index: number) => void;
  selectTopic: (index: number) => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function HomeSelectionProvider({ preps, children }: { preps: CockpitPrep[]; children: React.ReactNode }) {
  const [prepIndex, setPrepIndex] = useState(() => initialCockpitIndex(preps));
  const [topicByPrep, setTopicByPrep] = useState<Record<string, number>>({});
  const prep = preps[prepIndex];
  const topicIndex = prep ? (topicByPrep[prep.id] ?? prep.currentTopic) : 0;
  const selectPrep = useCallback((index: number) => setPrepIndex(Math.max(0, Math.min(preps.length - 1, index))), [preps.length]);
  const selectTopic = useCallback(
    (index: number) => {
      if (!prep) return;
      const bounded = Math.max(0, Math.min(prep.topics.length - 1, index));
      setTopicByPrep((current) => ({ ...current, [prep.id]: bounded }));
    },
    [prep],
  );
  const value = useMemo(
    () => ({ preps, prepIndex, topicIndex, selectPrep, selectTopic }),
    [preps, prepIndex, topicIndex, selectPrep, selectTopic],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection(): Selection {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("HomeSelectionProvider eksik");
  return value;
}

/* ---------------- Sınav şeridi ---------------- */

const STRIP_VISIBLE = 4;

function dayValue(daysLeft: number): string {
  return daysLeft < 0 ? `−${Math.abs(daysLeft)}` : String(daysLeft);
}

function ExamStrip() {
  const { preps, prepIndex, selectPrep } = useSelection();
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tip, setTip] = useState<{ index: number; top: number } | null>(null);
  const overflow = preps.length + 1 > STRIP_VISIBLE;

  // Açılışta seçili kutu görünür (geçmiş sınavlar yukarı kaydırınca görünür).
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[prepIndex];
    if (!list || !tab) return;
    // Masaüstünde dikey, telefonda yatay şerit [varsayım]: seçili kutu baştan görünür.
    const listBox = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    list.scrollTop += tabBox.top - listBox.top;
    list.scrollLeft += tabBox.left - listBox.left;
    // Yalnız ilk çizimde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showTip = (index: number) => {
    const strip = stripRef.current;
    const tab = tabRefs.current[index];
    if (!strip || !tab) return;
    const box = tab.getBoundingClientRect();
    setTip({ index, top: box.top - strip.getBoundingClientRect().top + box.height / 2 });
  };

  const move = (to: number) => {
    const bounded = Math.max(0, Math.min(preps.length - 1, to));
    selectPrep(bounded);
    const tab = tabRefs.current[bounded];
    tab?.focus();
    tab?.scrollIntoView?.({ block: "nearest" });
  };

  const scrollBy = (direction: 1 | -1) => {
    listRef.current?.scrollBy({ top: direction * 82, behavior: reduceMotion ? "auto" : "smooth" });
    setTip(null);
  };

  return (
    <div ref={stripRef} className="cx-strip" data-overflow={overflow || undefined}>
      {overflow ? (
        <button type="button" className="cx-strip-arrow" aria-label="Önceki" onClick={() => scrollBy(-1)}>
          <ChevronUp aria-hidden />
        </button>
      ) : null}
      <div
        ref={listRef}
        className="cx-strip-list"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Sınavlar"
        onScroll={() => setTip(null)}
      >
        {preps.map((prep, index) => {
          const selected = index === prepIndex;
          const days = prep.daysLeft;
          return (
            <button
              key={prep.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={prep.title}
              tabIndex={selected ? 0 : -1}
              className={cn("cx-strip-tab", selected && "is-selected")}
              onClick={() => selectPrep(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                  event.preventDefault();
                  move(index + 1);
                } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  move(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  move(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  move(preps.length - 1);
                }
              }}
              onPointerEnter={() => showTip(index)}
              onPointerLeave={() => setTip(null)}
              onFocus={() => showTip(index)}
              onBlur={() => setTip(null)}
            >
              {selected ? (
                <motion.span
                  layoutId="cx-strip-pill"
                  className="cx-strip-pill cx-glass"
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  aria-hidden
                />
              ) : null}
              {prep.behind ? <span className="cx-strip-dot" aria-hidden /> : null}
              {typeof days === "number" ? (
                <span className="cx-strip-day" aria-hidden>
                  <span className="cx-strip-num">{dayValue(days)}</span>
                  {days > 0 ? <span className="cx-strip-unit">gün sonra</span> : null}
                </span>
              ) : (
                <CalendarDays className="cx-strip-cal" aria-hidden />
              )}
            </button>
          );
        })}
        <Link href="/deneme-sinavlari/olustur" className="cx-strip-tab cx-strip-new" aria-label="Yeni sınav hazırlığı">
          <Plus aria-hidden />
        </Link>
      </div>
      {overflow ? (
        <button type="button" className="cx-strip-arrow" aria-label="Sonraki" onClick={() => scrollBy(1)}>
          <ChevronDown aria-hidden />
        </button>
      ) : null}
      {tip && preps[tip.index] ? (
        <span className="cx-strip-tip" style={{ top: tip.top }} aria-hidden>
          {preps[tip.index]!.title}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------- Konu halkası ---------------- */

const VIEW = 240;
const CENTER = VIEW / 2;
const RADIUS = 100;
/** Yay kalınlığının yarısı (CSS'teki stroke-width: 14). */
const ARC_HALF = 7;

function TopicSlider() {
  const { preps, prepIndex, topicIndex, selectTopic } = useSelection();
  const prep = preps[prepIndex]!;
  const count = prep.topics.length;
  const trackRef = useRef<HTMLDivElement>(null);
  if (count < 2) return null;
  const fromPointer = (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - box.top) / box.height));
    selectTopic(Math.round(ratio * (count - 1)));
  };
  return (
    <div className="cx-slider">
      <div
        ref={trackRef}
        className="cx-slider-track"
        role="slider"
        tabIndex={0}
        aria-label="Konular"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={topicIndex + 1}
        aria-valuetext={`${topicIndex + 1} / ${count}`}
        onKeyDown={(event) => {
          const steps: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 3, PageUp: -3 };
          if (event.key in steps) {
            event.preventDefault();
            selectTopic(topicIndex + steps[event.key]!);
          } else if (event.key === "Home") {
            event.preventDefault();
            selectTopic(0);
          } else if (event.key === "End") {
            event.preventDefault();
            selectTopic(count - 1);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event.clientY);
        }}
      >
        <span className="cx-slider-thumb" style={{ top: `${(topicIndex / (count - 1)) * 100}%` }} aria-hidden />
      </div>
      <span className="cx-slider-count" aria-hidden>
        {topicIndex + 1} / {count}
      </span>
    </div>
  );
}

type RingPlay = { prepId: string; from: number; fresh: string[]; t: number };

/**
 * Halkanın dolması (B1, 13 Kasım 2026): öğrenci ana ekrana döndüğünde hazırlığın tamamlama yüzdesi değiştiyse halka
 * eskiden yeniye 600 ms'de (`--cx-ease-settle`) dolar, ortadaki sayı sayar; az önce biten konunun yayı çizilir. İlk
 * ziyarette ya da değişiklik yokken hiçbir şey oynamaz. "Önce" değeri yalnız bu sekmenin oturumunda durur; yeni API yok.
 *
 * Sayfa sunucudan çizilip ilk kez canlanıyorsa (yeniden yükleme) an oynamaz: ekranda son değer zaten görünüyor, geri
 * sarıp yeniden saymak titreme olurdu. An, uygulamanın içinden ana ekrana dönüşte oynar.
 */
function useRingMoment(prepId: string, pct: number, doneIds: readonly string[]): RingPlay | null {
  const [play, setPlay] = useState<RingPlay | null>(null);
  // Her hazırlığın "önce" değeri bileşenin ömründe bir kez okunur: geliştirme modundaki çift etki çalıştırması anı silmesin.
  const [baseline] = useState(() => new Map<string, RingMemory | null>());
  const [hydrating] = useState(() => typeof document !== "undefined" && document.querySelector(".cx-ring") !== null);
  const doneKey = doneIds.join("|");
  useLayoutEffect(() => {
    const done = doneKey ? doneKey.split("|") : [];
    const now: RingMemory = { pct, done };
    if (!baseline.has(prepId)) baseline.set(prepId, hydrating ? null : readMoment(ringMemoryKey(prepId), isRingMemory));
    const before = baseline.get(prepId) ?? null;
    writeMoment(ringMemoryKey(prepId), now);
    if (!before) {
      baseline.set(prepId, now);
      return;
    }
    const fresh = done.filter((id) => !before.done.includes(id));
    if (before.pct === pct && fresh.length === 0) return;
    let disposed = false;
    let frame = 0;
    const started = performance.now();
    setPlay({ prepId, from: before.pct, fresh, t: 0 });
    const handle = startMoment(MOMENT_MS.settle, () => {
      cancelAnimationFrame(frame);
      if (!disposed) baseline.set(prepId, now);
      setPlay(null);
    });
    if (!handle.instant) {
      const tick = (time: number) => {
        const progress = Math.min(1, (time - started) / MOMENT_MS.settle);
        setPlay((current) => (current && current.prepId === prepId ? { ...current, t: easeSettle(progress) } : current));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      handle.end();
    };
  }, [prepId, pct, doneKey, baseline, hydrating]);
  return play && play.prepId === prepId ? play : null;
}

function TopicRing() {
  const { preps, prepIndex, topicIndex, selectTopic } = useSelection();
  const prep = preps[prepIndex]!;
  const gradientId = `cx-ring-${useId().replace(/:/g, "")}`;
  const topics = prep.topics;
  const sliced = topics.length > 0 && topics.length <= RING_ARC_LIMIT;
  const arcs = sliced ? ringArcs(topics.length) : [];
  const doneIds = useMemo(() => topics.filter((topic) => topic.done).map((topic) => topic.id), [topics]);
  const play = useRingMoment(prep.id, prep.progress.pct, doneIds);
  const pct = play ? Math.round(play.from + (prep.progress.pct - play.from) * play.t) : prep.progress.pct;
  const shownArc = play ? play.from + (prep.progress.pct - play.from) * play.t : prep.progress.pct;
  // 12'den fazla konuda seçili konunun halkadaki payı (en az 4°, görünür kalsın).
  const share = topics.length ? 360 / topics.length : 0;
  const markSpan = Math.max(4, share);
  const markStart = topicIndex * share + share / 2 - markSpan / 2;

  return (
    <div className="cx-ring">
      <svg className="cx-ring-svg" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--cx-brand)" }} />
            <stop offset="50%" style={{ stopColor: "var(--cx-violet)" }} />
            <stop offset="100%" style={{ stopColor: "var(--cx-cyan)" }} />
          </linearGradient>
        </defs>
        {sliced ? (
          arcs.map(([start, end], index) => {
            const selected = index === topicIndex;
            // Az önce biten konu (B1): yay önce boş çizilir, renkli yay üstünde 600 ms'de dolar.
            const drawing = play !== null && play.fresh.includes(topics[index]!.id);
            const done = topics[index]!.done && !drawing;
            return (
              <g key={topics[index]!.id}>
                <path
                  d={arcPath(CENTER, CENTER, RADIUS, start, end)}
                  className="cx-ring-arc"
                  stroke={done ? `url(#${gradientId})` : undefined}
                  data-done={done || undefined}
                  data-selected={selected || undefined}
                  onClick={() => selectTopic(index)}
                />
                {drawing ? (
                  <path
                    d={arcPath(CENTER, CENTER, RADIUS, start, end)}
                    className="cx-ring-arc cx-ring-draw"
                    stroke={`url(#${gradientId})`}
                    pathLength={1}
                    strokeDasharray="1 1"
                    strokeDashoffset={1 - play.t}
                    data-done
                  />
                ) : null}
                {/* Seçili yay: yayın kendisine yapışık 1.5 px beyaz çerçeve (halkanın dışında ayrı çizgi yok). */}
                {selected ? (
                  <path d={sectorPath(CENTER, CENTER, RADIUS - ARC_HALF, RADIUS + ARC_HALF, start, end)} className="cx-ring-selected" />
                ) : null}
              </g>
            );
          })
        ) : (
          <>
            <circle cx={CENTER} cy={CENTER} r={RADIUS} className="cx-ring-arc" />
            {shownArc > 0 ? (
              <path
                d={arcPath(CENTER, CENTER, RADIUS, 0, Math.min(359.99, (shownArc / 100) * 360))}
                className="cx-ring-arc"
                stroke={`url(#${gradientId})`}
                data-done
              />
            ) : null}
            {topics.length ? (
              <path
                d={sectorPath(CENTER, CENTER, RADIUS - ARC_HALF, RADIUS + ARC_HALF, markStart, markStart + markSpan)}
                className="cx-ring-selected"
              />
            ) : null}
          </>
        )}
      </svg>
      <div className="cx-ring-center">
        <span className="cx-t-num-l cx-ring-pct" data-counting={play ? "" : undefined}>
          %{pct}
        </span>
        <span className="cx-t-meta-s cx-ring-label">Tamamlandı</span>
        <Link href={prep.href} className="cx-ring-go cx-brand" aria-label="Devam et">
          <Play aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Metin bloğu ---------------- */

/**
 * Kalan haklar (Faz 3B): günlük sınırlı hak varken (ücretsiz hesap) metin bloğunun altında. Sayılar kapıdan; Plus,
 * Sigma ve Kurucu'da çizilmez. Ad ücretsiz sayaçların bugünkü adlarından ("sohbet mesajı", "fotoğraftan çözüm").
 */
function RemainingRights() {
  const message = useGate("teacher.message");
  const photo = useGate("photo.solve");
  const rows = [
    { gate: message, name: "sohbet mesajı" },
    { gate: photo, name: "fotoğraftan çözüm" },
  ].filter(({ gate }) => gate.period === "day" && typeof gate.remaining === "number" && typeof gate.limit === "number");
  if (!rows.length) return null;
  return (
    <section className="cx-rights" aria-label="Kalan haklar">
      <p className="cx-t-meta-xs cx-rights-title">Kalan haklar</p>
      <ul className="cx-rights-list">
        {rows.map(({ gate, name }) => (
          <li key={name} className="cx-t-label-13" data-low={gate.remaining! <= 1 ? "" : undefined}>
            <span className="cx-rights-count">
              {gate.remaining} / {gate.limit}
            </span>{" "}
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CockpitText() {
  const { preps, prepIndex, topicIndex } = useSelection();
  const prep = preps[prepIndex]!;
  const topic = prep.topics[topicIndex];
  const heading = topic?.label || prep.next?.heading || prep.title;
  const next = topic ? topic.next : prep.next;
  // Konu adımı: ücretsizde 1. konunun dışındaki adım kilitli (sunucunun kararı), içindeki adım ilk dersin döngüsü.
  const context: GateContext = next ? (next.locked ? { otherTopic: true } : { firstLessonCycle: true }) : {};
  const gate = useGate("lesson.create", context);
  return (
    <div className="cx-cockpit-text">
      <p className="cx-t-meta-l cx-cockpit-subject">{prep.title}</p>
      <h1 className="cx-t-heading-l cx-cockpit-heading">{heading}</h1>
      {next && gate.reason === "free_first_lesson_available" ? <span className="cx-t-meta-xs cx-free-lesson">Ücretsiz ders</span> : null}
      {next ? (
        <Gate action="lesson.create" context={context} asChild>
          <Link href={next.href} className="cx-t-meta-m cx-cockpit-next">
            <span>{next.heading}</span>
            <ArrowRight aria-hidden />
          </Link>
        </Gate>
      ) : null}
      <Link href={prep.href} className="cx-cockpit-details cx-glass">
        Ayrıntılar
      </Link>
      <RemainingRights />
    </div>
  );
}

/** Beş parçanın ortası: şerit, halka ve metin. Seçim değişince halka ve metin 160 ms solarak yenilenir. */
export function HomeCockpit() {
  const { preps, prepIndex } = useSelection();
  const prep = preps[prepIndex];
  if (!prep) return null;
  return (
    <section className="cx-cockpit" aria-label={prep.title}>
      <ExamStrip />
      {/* Halka + metin grubu sayfanın yatay merkezinde; kaydırıcı grubun en sağ ucunda (13 Kasım 2026). */}
      <div key={prep.id} className="cx-cockpit-body">
        <TopicRing />
        <CockpitText />
        <TopicSlider />
      </div>
    </section>
  );
}

/* ---------------- Çalışma araçları tepsisi ---------------- */

type TrayTool = { id: string; title: string; icon: Icon3DName; href: string; action?: ActionCode; plusOnly?: boolean };

/** Tepsideki aracın hak eylemi (Faz 3B). Ders sayacına düşen araçlar (test, kart, doğru/yanlış) eylem listesinde yok: bugünkü rozet. */
const TRAY_ACTION: Partial<Record<string, Action>> = {
  podcast: "podcast.create",
  video: "video.create",
  sozlu: "oral.start",
  yazili: "written.start",
  cram: "cram.export",
};

function TrayItem({ tool, freeAccount }: { tool: TrayTool; freeAccount: boolean }) {
  const action = TRAY_ACTION[tool.id];
  if (action) {
    return (
      <li>
        <Gate action={action} asChild>
          <Link href={tool.href} className="cx-tray-item">
            <Icon3D name={tool.icon} size={32} className="cx-tray-icon" />
            <span className="cx-t-label-13 cx-tray-label">{tool.title}</span>
          </Link>
        </Gate>
      </li>
    );
  }
  const locked = freeAccount && (tool.plusOnly || (tool.action ? needsPlusOutsideFirstLesson(tool.action) : false));
  return (
    <li>
      <Link href={tool.href} className={cn("cx-tray-item", locked && "is-locked")}>
        <Icon3D name={tool.icon} size={32} className="cx-tray-icon" />
        <span className="cx-t-label-13 cx-tray-label">{tool.title}</span>
        {locked ? <span className="cx-tray-plus">Plus</span> : null}
      </Link>
    </li>
  );
}

function studio(id: string): TrayTool {
  const found = STUDIOS.find((item) => item.id === id)!;
  return { id, title: found.title, icon: found.icon, href: found.href, action: found.action };
}

/** Yazma çubuğundaki ok düğmesinin açtığı tepsi: sekiz araç (4×2), adlar depodaki gibi. */
export function HomeToolsTray({ freeAccount }: { freeAccount: boolean }) {
  const { preps, prepIndex, topicIndex } = useSelection();
  const prep = preps[prepIndex];
  const topic = prep?.topics[topicIndex];
  const tools: TrayTool[] = [
    studio("flashcard"),
    studio("dogru-yanlis"),
    studio("quiz"),
    studio("podcast"),
    ...(prep
      ? [
          {
            id: "video",
            title: SKETCH_REEL_LABEL,
            icon: "video" as Icon3DName,
            href: studySketchVideoHref(
              prep.id,
              topic?.label ?? null,
              prep.topics.map((item) => ({ id: item.id, label: item.label })),
            ),
            action: "SKETCH_VIDEO_GENERATE" as ActionCode,
          },
        ]
      : []),
    studio("sozlu"),
    studio("yazili"),
    ...(prep
      ? [
          {
            id: "cram",
            title: "Sınav Sabahı Kağıdı",
            icon: "tekrar" as Icon3DName,
            href: `/deneme-sinavlari/${prep.id}/sinav-sabahi`,
            plusOnly: true,
          },
        ]
      : []),
  ];
  return (
    <ul className="cx-tray-grid">
      {tools.map((tool) => (
        <TrayItem key={tool.id} tool={tool} freeAccount={freeAccount} />
      ))}
    </ul>
  );
}
