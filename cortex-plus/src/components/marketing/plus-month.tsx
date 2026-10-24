"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import {
  PLAN_WORK,
  PLAN_WORK_BY_ID,
  PODCAST_MINUTES,
  TEMPO_PRESETS,
  documentPagesFor,
  freeDaysFor,
  freeVsPlusRows,
  mixShare,
  perDayKurus,
  tempoMix,
  workCount,
  type PlanWorkId,
  type Tempo,
} from "@/lib/billing/plan-value";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { formatTry } from "@/lib/format";
import { possessiveSuffix } from "@/lib/text/number-suffix";
import { cn } from "@/lib/utils";
import "@/styles/plus-month.css";

const fmt = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

/** Kaydırıcıların ve enerji çubuğunun renkleri; altın yalnız Plus'ın kendisi için. */
const WORK_COLOR: Partial<Record<PlanWorkId, string>> = {
  lesson: "#6b78ff",
  quiz: "#22c55e",
  chat: "#38bdf8",
  podcast: "#ffb27a",
  written: "#c084fc",
  video: "#f472b6",
};

type Cta = { label: string; href: string };

export type PlusMonthProps = {
  /** "full": ana sayfa ve ödeme sayfası; "compact": ücretsiz öğrencinin ana ekranı. */
  variant: "full" | "compact";
  /** Plus aylık fiyatı (kuruş); okunamazsa günlük fiyat satırı yazılmaz. */
  monthlyKurus: number | null;
  primary: Cta;
  secondary?: Cta;
  /** Ödeme sayfasında başlık seviyesi düşer (sayfanın h1'i planlar). */
  headingLevel?: "h2" | "h3";
  id?: string;
};

/**
 * "Plus ile bir ayda" (20 Ekim 2026). Misafire ve ücretsiz öğrenciye Plus'ın değerini somut sayıyla
 * anlatır: her iş tek başına kaç tane, gerçek bir tempo hakkın ne kadarı, aynı tempo ücretsiz planla
 * kaç gün sürerdi. Sayılar `plan-value.ts`ten, kredi tablosundan hesaplanır; öğrenci kredi görmez.
 */
export function PlusMonth(props: PlusMonthProps) {
  return props.variant === "compact" ? <PlusMonthCompact {...props} /> : <PlusMonthFull {...props} />;
}

function PlusMonthFull({ monthlyKurus, primary, secondary, headingLevel = "h2", id = "plus-ay" }: PlusMonthProps) {
  const Heading = headingLevel;
  const plus = PLAN_ALLOWANCES.plusMonthly;
  const lessons = workCount(plus, PLAN_WORK_BY_ID.lesson);
  const quizzes = workCount(plus, PLAN_WORK_BY_ID.quiz);
  const podcasts = workCount(plus, PLAN_WORK_BY_ID.podcast);
  const docs = documentPagesFor(plus);
  return (
    <section className="pm" id={id} aria-labelledby={`${id}-title`}>
      <div className="pm-bg" aria-hidden>
        <div className="pm-aurora" />
        <div className="pm-floor" />
        <div className="pm-scan" />
      </div>
      <div className="pm-wrap">
        <div className="pm-head">
          <p className="pm-kicker">
            <span className="pm-live" aria-hidden />
            Plus · bir ayda
          </p>
          <Heading id={`${id}-title`} className="pm-title">
            Bir ayda <span className="pm-gold">{fmt(lessons)} ders</span>.{" "}
            <span className="pm-dim">Ya da {fmt(quizzes)} test. Ya da {fmt(podcasts)} podcast.</span>
          </Heading>
          <p className="pm-lead">
            Plus sana tek bir aylık hak verir; ders, test, podcast, deneme — istediğine harca. Aşağıdaki
            her sayı, hakkının tamamını o işe ayırırsan ulaşacağın miktar.
          </p>
        </div>

        <ul className="pm-grid">
          {PLAN_WORK.map((work, index) => (
            <li key={work.id} className={cn("pm-tile", work.plusOnly && "pm-tile--plus")} style={{ ["--pm-i" as string]: index }}>
              <div className="pm-tile-top">
                <Icon3D name={work.icon} size={40} />
                {work.plusOnly ? (
                  <span className="pm-lock">
                    <Lock className="h-3 w-3" aria-hidden />
                    <span className="pm-lock-text">Ücretsizde kapalı</span>
                  </span>
                ) : null}
              </div>
              <p className="pm-count">
                <CountUp value={workCount(plus, work)} />
              </p>
              <p className="pm-noun">{work.noun}</p>
              <p className="pm-blurb">{work.blurb}</p>
            </li>
          ))}
        </ul>

        <ul className="pm-extras">
          <li>
            <Check className="h-4 w-4" aria-hidden />
            <span>
              <strong>Sınırsız</strong> sınav hazırlığı
            </span>
          </li>
          <li>
            <Check className="h-4 w-4" aria-hidden />
            <span>
              <strong>{fmt(docs.pages)}</strong> sayfa not okuma
            </span>
          </li>
          <li>
            <Check className="h-4 w-4" aria-hidden />
            <span>
              Ayda <strong>{fmt(docs.scanned)}</strong> fotoğraf ve taranmış sayfa
            </span>
          </li>
          <li>
            <Check className="h-4 w-4" aria-hidden />
            <span>Hazır içerik yokken hızlı yazım</span>
          </li>
        </ul>

        <TempoMixer />

        <CompareStrip />

        <div className="pm-cta">
          <div className="pm-cta-buttons">
            <Link href={primary.href} className="pm-btn pm-btn--plus">
              <Sparkles className="h-4 w-4" aria-hidden />
              {primary.label}
            </Link>
            {secondary ? (
              <Link href={secondary.href} className="pm-btn pm-btn--ghost">
                {secondary.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </div>
          <TrustLine monthlyKurus={monthlyKurus} />
          <p className="pm-fine">
            Sayılar tek başına; hepsi aynı aylık haktan düşer. Podcast {PODCAST_MINUTES} dakikalık ve sesiyle
            birlikte sayıldı. Yapay zekâ modeli her planda aynı.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Ücretsiz öğrencinin ana ekranındaki kart: dört sayı, enerji halkası, tek düğme. */
function PlusMonthCompact({ monthlyKurus, primary, secondary }: PlusMonthProps) {
  const plus = PLAN_ALLOWANCES.plusMonthly;
  const preset = TEMPO_PRESETS.find((item) => item.id === "sinav-ayi") ?? TEMPO_PRESETS[0]!;
  const share = Math.round(mixShare(tempoMix(preset.tempo)) * 100);
  const items: PlanWorkId[] = ["lesson", "quiz", "podcast", "video"];
  return (
    <section className="pm-card" aria-labelledby="pm-card-title">
      <div className="pm-card-glow" aria-hidden />
      <div className="pm-card-ring" style={{ ["--pm-share" as string]: `${share}%` }} aria-hidden>
        <span>
          <b>%{share}</b>
          <small>sınav ayı temposu</small>
        </span>
      </div>
      <div className="pm-card-body">
        <p className="pm-kicker">
          <span className="pm-live" aria-hidden />
          Plus ile bu ay
        </p>
        <h2 id="pm-card-title" className="pm-card-title">
          Günde {preset.tempo.lessonsPerDay} ders, {preset.tempo.quizzesPerDay} test ve haftada {preset.tempo.podcastsPerWeek} podcast — hakkının <span className="pm-gold">%{share}</span>
          {possessiveSuffix(share)}.
        </h2>
        <ul className="pm-card-counts">
          {items.map((id) => {
            const work = PLAN_WORK_BY_ID[id];
            return (
              <li key={id}>
                <b>
                  <CountUp value={workCount(plus, work)} />
                </b>
                <span>{work.noun}</span>
              </li>
            );
          })}
        </ul>
        <div className="pm-card-actions">
          <Link href={primary.href} className="pm-btn pm-btn--plus">
            <Sparkles className="h-4 w-4" aria-hidden />
            {primary.label}
          </Link>
          {secondary ? (
            <Link href={secondary.href} className="pm-card-link">
              {secondary.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <TrustLine monthlyKurus={monthlyKurus} compact />
      </div>
    </section>
  );
}

/**
 * Fiyat ve güven: aylık fiyatın günlük karşılığı (yıllık plan 24 Ekim 2026'da kalktı), sonra gerçekten
 * tuttuğumuz iki söz — abonelik kendiliğinden yenilenmez (`AUTO_RENEW_SUPPORTED = false`), kart
 * bilgisi PayTR'de kalır.
 */
function TrustLine({
  monthlyKurus,
  compact = false,
}: {
  monthlyKurus: number | null;
  compact?: boolean;
}) {
  const monthlyDay = monthlyKurus ? perDayKurus(monthlyKurus) : null;
  return (
    <ul className={cn("pm-trust", compact && "pm-trust--compact")}>
      {monthlyDay ? (
        <li>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <span>
            Günde {formatTry(monthlyDay)}
          </span>
        </li>
      ) : null}
      <li>
        <Check className="h-4 w-4" aria-hidden />
        <span>Otomatik yenileme yok</span>
      </li>
      <li>
        <Check className="h-4 w-4" aria-hidden />
        <span>Kart bilgisi bize gelmez</span>
      </li>
    </ul>
  );
}

/** "Ayını kur": öğrenci temposunu seçer, hakkın ne kadarının gittiğini ve ücretsizle kaç gün süreceğini görür. */
function TempoMixer() {
  const [tempo, setTempo] = useState<Tempo>(() => ({ ...(TEMPO_PRESETS[1] ?? TEMPO_PRESETS[0]!).tempo }));
  const mix = useMemo(() => tempoMix(tempo), [tempo]);
  const share = mixShare(mix);
  const percent = Math.round(share * 100);
  const freeDays = freeDaysFor(mix);
  const sliders: { key: keyof Tempo; label: string; unit: string; max: number; work: PlanWorkId }[] = [
    { key: "lessonsPerDay", label: "Günde ders", unit: "ders", max: 10, work: "lesson" },
    { key: "quizzesPerDay", label: "Günde test", unit: "test", max: 15, work: "quiz" },
    { key: "questionsPerDay", label: "Günde soru (AI öğretmen)", unit: "soru", max: 40, work: "chat" },
    { key: "podcastsPerWeek", label: "Haftada podcast", unit: "podcast", max: 14, work: "podcast" },
    { key: "writtenPerWeek", label: "Haftada yazılı deneme", unit: "deneme", max: 7, work: "written" },
    { key: "videosPerMonth", label: "Ayda video ders", unit: "video", max: 25, work: "video" },
  ];
  const segments = sliders
    .map((slider) => {
      const work = PLAN_WORK_BY_ID[slider.work];
      const part = ((mix[slider.work] ?? 0) * work.credits) / PLAN_ALLOWANCES.plusMonthly;
      return { id: slider.work, part, color: WORK_COLOR[slider.work] ?? "#8e98ff", title: work.title };
    })
    .filter((segment) => segment.part > 0);
  const over = share > 1;
  return (
    <div className="pm-mixer" role="group" aria-labelledby="pm-mixer-title">
      <div className="pm-mixer-head">
        <h3 id="pm-mixer-title" className="pm-h3">
          Kendi ayını kur
        </h3>
        <div className="pm-presets" role="group" aria-label="Hazır tempolar">
          {TEMPO_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="pm-preset" onClick={() => setTempo({ ...preset.tempo })}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pm-mixer-grid">
        <div className="pm-sliders">
          {sliders.map((slider) => (
            <label key={slider.key} className="pm-slider" style={{ ["--pm-c" as string]: WORK_COLOR[slider.work] }}>
              <span className="pm-slider-row">
                <span>{slider.label}</span>
                <b>{tempo[slider.key]}</b>
              </span>
              <input
                type="range"
                min={0}
                max={slider.max}
                step={1}
                value={tempo[slider.key]}
                onChange={(event) => setTempo((current) => ({ ...current, [slider.key]: Number(event.target.value) }))}
              />
              <span className="pm-slider-month">
                ayda {fmt(mix[slider.work] ?? 0)} {slider.unit}
              </span>
            </label>
          ))}
        </div>
        <div className="pm-meter-box">
          <p className="pm-meter-label">Plus aylık hakkının</p>
          <p className={cn("pm-meter-value", over && "pm-meter-value--over")} aria-live="polite">
            %{percent}
          </p>
          <div className="pm-meter" aria-hidden>
            {segments.map((segment) => (
              <span
                key={segment.id}
                title={segment.title}
                style={{ width: `${Math.min(100, segment.part * 100)}%`, background: segment.color }}
              />
            ))}
          </div>
          <p className="pm-meter-note">
            {over
              ? "Bu tempo bir aylık Plus hakkını aşıyor: ek paket ya da Sigma ile sürer."
              : percent <= 0
                ? "Bir tempo seç; hakkının ne kadarının gittiğini gör."
                : `Ay biterken hakkının %${100 - percent}${possessiveSuffix(100 - percent)} hâlâ duruyor.`}
          </p>
          <p className="pm-meter-free">
            {freeDays == null
              ? "Ücretsiz planda podcast, yazılı deneme ve video ders kapalı."
              : freeDays > 0
                ? `Aynı tempo ücretsiz planla ${fmt(freeDays)} gün sürerdi.`
                : null}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompareStrip() {
  const rows = freeVsPlusRows(fmt);
  return (
    <div className="pm-compare" role="table" aria-label="Ücretsiz ve Plus, ayda">
      <div className="pm-compare-row pm-compare-row--head" role="row">
        <span role="columnheader" />
        <span role="columnheader">Ücretsiz</span>
        <span role="columnheader" className="pm-gold">
          Plus
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="pm-compare-row" role="row">
          <span role="rowheader">{row.label}</span>
          <span role="cell" className={row.free === "Kapalı" ? "pm-off" : undefined}>
            {row.free}
          </span>
          <span role="cell" className="pm-on">
            {row.plus}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Ekrana girince sıfırdan sayar. Sunucu son sayıyı yazar (arama motoru, ekran görüntüsü, betiksiz
 * tarayıcı tam sayıyı görür); hareket azaltma açıksa sayı hiç oynamaz.
 */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = () => {
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 1400);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <span ref={ref} className="pm-num">
      {fmt(shown)}
    </span>
  );
}

/**
 * Yükseltme kapısındaki kısa satır: hakkı dolan öğrenciye Plus'ın bir ayında ne olduğunu dört sayıyla
 * söyler (eskiden yalnız "ayda yaklaşık 2.400 mesaj ya da 1.200 ders" yazıyordu; sayılar kredi tablosundan).
 */
export function PlusCountsInline() {
  const plus = PLAN_ALLOWANCES.plusMonthly;
  const ids: PlanWorkId[] = ["lesson", "quiz", "podcast", "video"];
  return (
    <div className="pm-inline">
      <p className="pm-inline-label">Plus ile bir ayda · her biri tek başına</p>
      <ul>
        {ids.map((id) => {
          const work = PLAN_WORK_BY_ID[id];
          return (
            <li key={id}>
              <b>{fmt(workCount(plus, work))}</b>
              <span>{work.noun}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
