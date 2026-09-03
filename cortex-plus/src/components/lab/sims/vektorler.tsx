"use client";

import { useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * Vektörler.
 *
 * Vektör toplamı "uç uca ekle" diye öğretiliyor ama öğrenci bunu sayıların
 * toplamı gibi düşünüp |a+b| = |a|+|b| sanıyor. Burada paralelkenar ve
 * bileşke aynı anda çiziliyor; iki vektör dikleşince bileşkenin boyunun
 * toplamdan küçük olduğu gözle görülüyor.
 *
 * Nokta çarpım işaretiyle birlikte veriliyor: negatif olduğunda açının
 * geniş olduğu, sıfır olduğunda dik olduğu okunabiliyor.
 */

type Op = "toplam" | "fark";

const W = 460;
const H = 300;
const CX = W / 2;
const CY = H / 2;
const UNIT = 22; // birim başına piksel

export function VektorlerLab() {
  const [ax, setAx] = useState(4);
  const [ay, setAy] = useState(1);
  const [bx, setBx] = useState(1);
  const [by, setBy] = useState(3);
  const [op, setOp] = useState<Op>("toplam");

  const sign = op === "toplam" ? 1 : -1;
  const rx = ax + sign * bx;
  const ry = ay + sign * by;

  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  const magR = Math.hypot(rx, ry);
  const dot = ax * bx + ay * by;
  // Düzlemde çapraz çarpım tek sayıya iner: paralelkenarın işaretli alanı.
  const cross = ax * by - ay * bx;
  const angle =
    magA > 1e-9 && magB > 1e-9
      ? (Math.acos(Math.max(-1, Math.min(1, dot / (magA * magB)))) * 180) /
        Math.PI
      : 0;

  const sx = (x: number) => r2(CX + x * UNIT);
  const sy = (y: number) => r2(CY - y * UNIT);

  return (
    <SimShell
      id="vektorler"
      title="Vektörler"
      subject="Matematik"
      summary="|a| + |b| neden bileşkenin boyu değil?"
      help={{
        intro:
          "İki vektörü toplamak, birini diğerinin ucuna eklemektir. Bileşkenin boyu ancak ikisi aynı yöndeyse boyların toplamına eşit olur; her açıda daha kısadır.",
        steps: [
          "a ve b'yi aynı yöne getir — bileşkenin boyu tam toplam olur.",
          "Dikleştir: nokta çarpım sıfırlanır, bileşke Pisagor'dan çıkar.",
          "Aralarındaki açıyı 90°'nin üstüne çıkar — nokta çarpım negatife döner.",
        ],
        legend: [
          { color: "#7aa2f7", label: "a" },
          { color: "#54c594", label: "b" },
          { color: "#f4ae0b", label: op === "toplam" ? "a + b" : "a − b" },
        ],
      }}
      controls={
        <>
          <SimSlider label="a — x" value={ax} onChange={setAx} min={-6} max={6} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="a — y" value={ay} onChange={setAy} min={-6} max={6} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="b — x" value={bx} onChange={setBx} min={-6} max={6} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="b — y" value={by} onChange={setBy} min={-6} max={6} step={0.5} format={(v) => v.toFixed(1)} />
          <SimChips
            label="İşlem"
            value={op}
            options={[
              { id: "toplam" as Op, label: "a + b" },
              { id: "fark" as Op, label: "a − b" },
            ]}
            onChange={setOp}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Bileşke"
            tone="highlight"
            rows={[
              { label: "Vektör", value: `(${rx.toFixed(1)}, ${ry.toFixed(1)})` },
              { label: "Boy", value: magR.toFixed(2) },
            ]}
          />
          <SimReadout
            label="Boylar"
            tone="accent"
            rows={[
              { label: "|a| , |b|", value: `${magA.toFixed(2)} , ${magB.toFixed(2)}` },
              { label: "|a| + |b|", value: (magA + magB).toFixed(2) },
            ]}
          />
          <SimReadout
            label="Nokta çarpım"
            rows={[
              { label: "a · b", value: dot.toFixed(2) },
              {
                label: "Açı",
                value: `${angle.toFixed(1)}°`,
              },
            ]}
          />
          <SimReadout
            label="Çapraz çarpım"
            rows={[
              { label: "a × b", value: cross.toFixed(2) },
              { label: "Paralelkenar alanı", value: Math.abs(cross).toFixed(2) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`a = (${ax}, ${ay}) ve b = (${bx}, ${by}). ${op === "toplam" ? "Toplamın" : "Farkın"} boyu kaç olur?`}
        hint={`|a| = ${magA.toFixed(2)}, |b| = ${magB.toFixed(2)}. Toplamları değil.`}
        actual={magR}
        format={(v) => v.toFixed(2)}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`Bileşke boyu ${magR.toFixed(2)}, açı ${angle.toFixed(0)} derece`}
      >
        <defs>
          <marker id="vek-ok" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Izgara */}
        {Array.from({ length: 13 }, (_, i) => i - 6).map((i) => (
          <g key={i}>
            <line x1={sx(i)} x2={sx(i)} y1={0} y2={H} stroke="#232323" strokeWidth="1" />
            <line x1={0} x2={W} y1={sy(i)} y2={sy(i)} stroke="#232323" strokeWidth="1" />
          </g>
        ))}
        <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke="#4a4a4a" strokeWidth="1.5" />
        <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} stroke="#4a4a4a" strokeWidth="1.5" />

        {/* Paralelkenar — bileşkenin nereden geldiğini gösteriyor. */}
        <polygon
          points={`${sx(0)},${sy(0)} ${sx(ax)},${sy(ay)} ${sx(rx)},${sy(ry)} ${sx(sign * bx)},${sy(sign * by)}`}
          fill="rgba(244,174,11,0.08)"
          stroke="#4a4a4a"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        <g color="#7aa2f7">
          <line x1={sx(0)} y1={sy(0)} x2={sx(ax)} y2={sy(ay)} stroke="#7aa2f7" strokeWidth="2.5" markerEnd="url(#vek-ok)" />
        </g>
        <g color="#54c594">
          <line x1={sx(0)} y1={sy(0)} x2={sx(sign * bx)} y2={sy(sign * by)} stroke="#54c594" strokeWidth="2.5" markerEnd="url(#vek-ok)" />
        </g>
        <g color="#f4ae0b">
          <line x1={sx(0)} y1={sy(0)} x2={sx(rx)} y2={sy(ry)} stroke="#f4ae0b" strokeWidth="3" markerEnd="url(#vek-ok)" />
        </g>
      </svg>
    </SimShell>
  );
}
