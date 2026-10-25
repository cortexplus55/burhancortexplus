"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ToolField, ToolNumber, ToolShell } from "@/components/lab/tool-shell";
import { degToRad, quadrantSigns, trigAt, wrapDegrees } from "@/lib/lab/simulations";
import "@/styles/sim-lab.css";

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 118;

export function BirimCemberLab() {
  const [deg, setDeg] = useState(45);
  const t = useMemo(() => trigAt(deg), [deg]);
  const signs = quadrantSigns(t.quadrant);
  const x = CX + R * t.cos;
  const y = CY - R * t.sin;

  function fromPointer(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left - box.width / 2;
    const py = -(event.clientY - box.top - box.height / 2);
    setDeg(wrapDegrees((Math.atan2(py, px) * 180) / Math.PI));
  }

  return (
    <ToolShell
      title="Birim çember laboratuvarı"
      subject="Matematik"
      summary="Açıyı sürgüyle veya çember üzerinde sürükleyerek sin, cos, tan uzunluklarını ve bölge işaretlerini canlı gör."
      inputs={
        <>
          <ToolField label="Açı (θ)" hint={`${wrapDegrees(deg).toFixed(1)}°  ·  ${t.rad.toFixed(3)} rad`}>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={wrapDegrees(deg)}
              onChange={(e) => setDeg(Number(e.target.value))}
              aria-label="Açı"
            />
            <ToolNumber label="Derece" value={Number(wrapDegrees(deg).toFixed(0))} onChange={setDeg} min={0} max={360} />
          </ToolField>
          <dl className="sim-stats">
            <div>
              <dt>sin θ</dt>
              <dd>
                {signs.sin}
                {Math.abs(t.sin).toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>cos θ</dt>
              <dd>
                {signs.cos}
                {Math.abs(t.cos).toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>tan θ</dt>
              <dd>{t.tan == null ? "tanımsız" : `${signs.tan}${Math.abs(t.tan).toFixed(3)}`}</dd>
            </div>
            <div>
              <dt>Bölge</dt>
              <dd>{t.quadrant}. bölge</dd>
            </div>
          </dl>
        </>
      }
      result={
        <div className="sim-circle-wrap">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="sim-svg"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons) fromPointer(e);
            }}
            role="img"
            aria-label="Birim çember"
          >
            <circle cx={CX} cy={CY} r={R} className="sim-ring" />
            <line x1={16} y1={CY} x2={SIZE - 16} y2={CY} className="sim-axis" />
            <line x1={CX} y1={16} x2={CX} y2={SIZE - 16} className="sim-axis" />
            <text x={SIZE - 22} y={CY - 8} className="sim-label">
              cos
            </text>
            <text x={CX + 8} y={22} className="sim-label">
              sin
            </text>
            <line x1={CX} y1={CY} x2={x} y2={CY} className="sim-cos" />
            <line x1={x} y1={CY} x2={x} y2={y} className="sim-sin" />
            {t.tan != null && Math.abs(t.tan) < 8 ? (
              <line
                x1={CX + R}
                y1={CY}
                x2={CX + R}
                y2={CY - R * t.tan}
                className="sim-tan"
              />
            ) : null}
            <line x1={CX} y1={CY} x2={x} y2={y} className="sim-radius" />
            <path
              d={`M ${CX + 28} ${CY} A 28 28 0 ${wrapDegrees(deg) > 180 ? 1 : 0} 0 ${CX + 28 * Math.cos(degToRad(deg))} ${CY - 28 * Math.sin(degToRad(deg))}`}
              className="sim-arc"
            />
            <motion.circle cx={x} cy={y} r={8} className="sim-dot" layout />
          </svg>
          <p className="sim-caption">
            Mavi = cos θ, yeşil = sin θ, amber = tan θ. Noktayı çemberde sürükle.
          </p>
        </div>
      }
    />
  );
}
