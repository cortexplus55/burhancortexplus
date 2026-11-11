"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { HERO_SCENE } from "@/lib/marketing/landing-content";

/**
 * Kahramandaki sahne (11 Kasım 2026, ikinci tur; ürün sahibi: "klasik yapay zekâ sitesi gibi olmasın; yenilikçi,
 * sinematik, fütüristik"). Bir ders notu (kâğıt, el yazısı, fosforlu satır) ve ondan çıkan ışık şeridi: şerit
 * logonun şerididir ve çalışma yolunun duraklarından geçer. Ürünün yaptığı işin resmi; ayrı bir maket değil.
 *
 * Ölçüler kabın genişliğine bağlı (`cqw`): sahne telefonda da masaüstünde de aynı kompozisyonu korur. Şeridin
 * yolu ile durakların yeri aynı koordinat düzleminde (500 × 600) elle verilir; ikisi birlikte değişir.
 * İmleç sahneyi birkaç derece eğer (yalnız fare ve hareket azaltma kapalıyken); açılışta şerit bir kez çizilir.
 * Sahne ekran okuyucuya tek cümleyle anlatılır (`role="img"`), içindeki parçalar gizlidir.
 */

const RIBBON = "M235 125 C330 110 395 150 385 215 S335 305 250 318 S110 340 125 418 S180 505 265 512 S410 520 430 455";

/** Durakların şerit üstündeki yeri (500 × 600 düzleminde). */
const STOP_AT = [
  { x: 385, y: 215 },
  { x: 250, y: 318 },
  { x: 125, y: 418 },
  { x: 265, y: 512 },
] as const;

const GOAL_AT = { x: 430, y: 455 };

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = ref.current;
    if (!scene || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = scene.getBoundingClientRect();
        const x = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
        const y = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
        scene.style.setProperty("--mx", String(Math.max(-1, Math.min(1, x))));
        scene.style.setProperty("--my", String(Math.max(-1, Math.min(1, y))));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={ref} className="hs" role="img" aria-label={HERO_SCENE.label}>
      <div className="hs-stage" aria-hidden>
        <svg className="hs-ribbon" viewBox="0 0 500 600" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="hs-grad" gradientUnits="userSpaceOnUse" x1="235" y1="110" x2="400" y2="530">
              <stop offset="0" stopColor="#ffb224" />
              <stop offset="0.36" stopColor="#ff4d8d" />
              <stop offset="0.68" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
            <filter id="hs-blur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>
          <path className="hs-r hs-r--glow" d={RIBBON} pathLength={1} stroke="url(#hs-grad)" filter="url(#hs-blur)" />
          <path className="hs-r hs-r--body" d={RIBBON} pathLength={1} stroke="url(#hs-grad)" />
          <path className="hs-r hs-r--shine" d={RIBBON} pathLength={1} />
          <path className="hs-r hs-r--spark" d={RIBBON} pathLength={1} />
        </svg>

        <div className="hs-paper">
          <span className="hs-paper-holes" />
          <p className="hs-note-title">{HERO_SCENE.note.title}</p>
          {HERO_SCENE.note.lines.map((line, at) => (
            <p key={line} className="hs-note-line">
              {at === HERO_SCENE.note.marked ? <mark>{line}</mark> : line}
              {at === HERO_SCENE.note.marked ? <span className="hs-note-margin">{HERO_SCENE.note.margin}</span> : null}
            </p>
          ))}
          <span className="hs-scan" />
        </div>

        {HERO_SCENE.stops.map((stop, at) => (
          <div
            key={stop.label}
            className="hs-stop"
            style={{ left: pct(STOP_AT[at]!.x, 500), top: pct(STOP_AT[at]!.y, 600), ["--hs-d" as string]: `${0.55 + at * 0.3}s` }}
          >
            <Icon3D name={stop.icon} size={64} className="hs-stop-icon" />
            <span>{stop.label}</span>
          </div>
        ))}

        <div className="hs-goal" style={{ left: pct(GOAL_AT.x, 500), top: pct(GOAL_AT.y, 600) }}>
          <span className="hs-goal-ring">
            <Check strokeWidth={3} />
          </span>
          <span className="hs-goal-label">{HERO_SCENE.goal}</span>
        </div>
      </div>
    </div>
  );
}
