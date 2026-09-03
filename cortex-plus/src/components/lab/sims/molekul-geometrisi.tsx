"use client";

import { useState } from "react";
import { SimChips, SimReadout, SimShell, r2 } from "@/components/lab/sim-shell";

/**
 * Molekül geometrisi (VSEPR).
 *
 * Öğrenci su molekülünü düz çizip 180° sanıyor. Sebebi ortaklanmamış
 * elektron çiftlerinin görünmez olması. Burada çiftler AÇIK/KAPALI
 * yapılabiliyor: kapatınca şekil ideale dönüyor, açınca bağlar itiliyor ve
 * açı daralıyor. Yanılgının kaynağı doğrudan hedefleniyor.
 *
 * Açılar deneysel değerler (H₂O 104,5°, NH₃ 107°); ideal geometriden sapma
 * çiftlerin daha çok yer kaplamasından geliyor.
 */

type Shape = {
  id: string;
  name: string;
  formula: string;
  bonds: number;
  lonePairs: number;
  idealAngle: number;
  realAngle: number;
  geometry: string;
  electronGeometry: string;
  polar: boolean;
};

const SHAPES: Shape[] = [
  { id: "ch4", name: "Metan", formula: "CH₄", bonds: 4, lonePairs: 0, idealAngle: 109.5, realAngle: 109.5, geometry: "Düzgün dörtyüzlü", electronGeometry: "Dörtyüzlü", polar: false },
  { id: "nh3", name: "Amonyak", formula: "NH₃", bonds: 3, lonePairs: 1, idealAngle: 109.5, realAngle: 107, geometry: "Üçgen piramit", electronGeometry: "Dörtyüzlü", polar: true },
  { id: "h2o", name: "Su", formula: "H₂O", bonds: 2, lonePairs: 2, idealAngle: 109.5, realAngle: 104.5, geometry: "Açısal (V)", electronGeometry: "Dörtyüzlü", polar: true },
  { id: "co2", name: "Karbondioksit", formula: "CO₂", bonds: 2, lonePairs: 0, idealAngle: 180, realAngle: 180, geometry: "Doğrusal", electronGeometry: "Doğrusal", polar: false },
  { id: "bf3", name: "Bor triflorür", formula: "BF₃", bonds: 3, lonePairs: 0, idealAngle: 120, realAngle: 120, geometry: "Düzgün üçgen", electronGeometry: "Üçgen düzlem", polar: false },
  { id: "so2", name: "Kükürt dioksit", formula: "SO₂", bonds: 2, lonePairs: 1, idealAngle: 120, realAngle: 119, geometry: "Açısal (V)", electronGeometry: "Üçgen düzlem", polar: true },
];

const W = 420;
const H = 280;
const CX = W / 2;
const CY = H / 2;
const BOND = 78;

export function MolekulGeometrisiLab() {
  const [id, setId] = useState("h2o");
  const [showLone, setShowLone] = useState("acik");

  const s = SHAPES.find((x) => x.id === id)!;
  const lonesVisible = showLone === "acik" && s.lonePairs > 0;
  const angle = lonesVisible ? s.realAngle : s.idealAngle;

  // Bağları açının ortasına yerleştir: molekül simetrik dursun.
  const half = (angle * Math.PI) / 180 / 2;
  const bondPositions = bondLayout(s.bonds, half, s.idealAngle);
  const lonePositions = lonePairLayout(s.lonePairs, half);

  return (
    <SimShell
      id="molekul-geometrisi"
      title="Molekül geometrisi"
      subject="Kimya"
      summary="Su neden düz değil? Görünmeyen çiftleri aç, gör."
      help={{
        intro:
          "Merkez atomun etrafındaki elektron grupları birbirini iter ve mümkün olan en uzak konumu alır. Ortaklanmamış çiftler bağlardan daha fazla yer kaplar, bu yüzden bağ açısını daraltırlar.",
        steps: [
          "Suyu seç ve ortaklanmamış çiftleri kapat — açı ideal 109,5°'ye çıkar.",
          "Aç: çiftler bağları iter, açı 104,5°'ye düşer.",
          "CH₄, NH₃, H₂O sırasına bak — her çift açıyı biraz daha daraltıyor.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Bağ" },
          { color: "#7aa2f7", label: "Ortaklanmamış çift" },
        ],
      }}
      controls={
        <>
          <SimChips
            label="Molekül"
            value={id}
            options={SHAPES.map((x) => ({ id: x.id, label: x.formula }))}
            onChange={setId}
          />
          <SimChips
            label="Ortaklanmamış çiftler"
            value={showLone}
            options={[
              { id: "acik", label: "Göster" },
              { id: "kapali", label: "Gizle" },
            ]}
            onChange={setShowLone}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Bağ açısı"
            tone="highlight"
            rows={[
              { label: "Gerçek", value: `${s.realAngle}°` },
              { label: "İdeal", value: `${s.idealAngle}°` },
            ]}
          />
          <SimReadout
            label="Geometri"
            tone="accent"
            rows={[
              { label: "Molekül", value: s.geometry },
              { label: "Elektron", value: s.electronGeometry },
            ]}
          />
          <SimReadout
            label="Elektron grupları"
            rows={[
              { label: "Bağ", value: String(s.bonds) },
              { label: "Ortaklanmamış çift", value: String(s.lonePairs) },
            ]}
          />
          <SimReadout
            label="Polarlık"
            rows={[
              { label: "Molekül", value: s.polar ? "Polar" : "Apolar" },
              {
                label: "Sebep",
                value: s.polar ? "simetri bozuk" : "simetrik",
              },
            ]}
          />
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`${s.name}, ${s.geometry}, bağ açısı ${angle} derece`}
      >
        {/* Açı yayı */}
        {bondPositions.length >= 2 ? (
          <path
            d={arcBetween(bondPositions[0], bondPositions[1])}
            fill="none"
            stroke="#8a8a8a"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}

        {lonesVisible
          ? lonePositions.map((p, i) => (
              <g key={`l${i}`}>
                <line x1={CX} y1={CY} x2={r2(CX + p.x * BOND * 0.62)} y2={r2(CY + p.y * BOND * 0.62)} stroke="#7aa2f7" strokeWidth="1" opacity="0.3" />
                <ellipse
                  cx={r2(CX + p.x * BOND * 0.72)}
                  cy={r2(CY + p.y * BOND * 0.72)}
                  rx="17"
                  ry="11"
                  fill="rgba(122,162,247,0.22)"
                  stroke="#7aa2f7"
                  strokeWidth="1.5"
                  transform={`rotate(${r2((Math.atan2(p.y, p.x) * 180) / Math.PI)} ${r2(CX + p.x * BOND * 0.72)} ${r2(CY + p.y * BOND * 0.72)})`}
                />
              </g>
            ))
          : null}

        {bondPositions.map((p, i) => (
          <g key={`b${i}`}>
            <line x1={CX} y1={CY} x2={r2(CX + p.x * BOND)} y2={r2(CY + p.y * BOND)} stroke="#f4ae0b" strokeWidth="3" />
            <circle cx={r2(CX + p.x * BOND)} cy={r2(CY + p.y * BOND)} r="15" fill="#2a2a2a" stroke="#f4ae0b" strokeWidth="1.5" />
            <text x={r2(CX + p.x * BOND)} y={r2(CY + p.y * BOND + 4)} textAnchor="middle" fontSize="11" fill="#e4e4e7">
              {outerAtom(s.formula)}
            </text>
          </g>
        ))}

        <circle cx={CX} cy={CY} r="21" fill="#3a3a3a" stroke="#8a8a8a" strokeWidth="1.5" />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="600">
          {centerAtom(s.formula)}
        </text>

        <text x={CX} y={H - 12} textAnchor="middle" className="sim-axis">
          {angle}° · {s.geometry}
        </text>
      </svg>
    </SimShell>
  );
}

/** Bağları merkez etrafında, açıyı koruyacak biçimde dağıtır. */
function bondLayout(count: number, half: number, ideal: number) {
  if (count === 2) {
    return [
      { x: -Math.sin(half), y: -Math.cos(half) },
      { x: Math.sin(half), y: -Math.cos(half) },
    ];
  }
  if (count === 3 && ideal === 120) {
    return [0, 120, 240].map((a) => ({
      x: Math.cos(((a - 90) * Math.PI) / 180),
      y: Math.sin(((a - 90) * Math.PI) / 180),
    }));
  }
  if (count === 3) {
    // Üçgen piramit: düzlemde üç bağ, çift yukarıda.
    return [200, 270, 340].map((a) => ({
      x: Math.cos((a * Math.PI) / 180),
      y: Math.sin((a * Math.PI) / 180),
    }));
  }
  return [235, 305, 55, 125].map((a) => ({
    x: Math.cos((a * Math.PI) / 180),
    y: Math.sin((a * Math.PI) / 180),
  }));
}

function lonePairLayout(count: number, half: number) {
  if (count === 1) return [{ x: 0, y: -1 }];
  if (count === 2) {
    return [
      { x: -Math.sin(half), y: Math.cos(half) },
      { x: Math.sin(half), y: Math.cos(half) },
    ];
  }
  return [];
}

function arcBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  const r = BOND * 0.42;
  const ax = r2(CX + a.x * r);
  const ay = r2(CY + a.y * r);
  const bx = r2(CX + b.x * r);
  const by = r2(CY + b.y * r);
  return `M${ax},${ay} A${r},${r} 0 0 1 ${bx},${by}`;
}

function centerAtom(formula: string): string {
  return formula.replace(/[₀-₉]/g, "").charAt(0) === "H"
    ? formula.replace(/[₀-₉]/g, "").charAt(1)
    : formula.replace(/[₀-₉]/g, "").charAt(0);
}

function outerAtom(formula: string): string {
  const letters = formula.replace(/[₀-₉]/g, "");
  return letters.charAt(0) === "H" ? "H" : letters.slice(1) || "X";
}
