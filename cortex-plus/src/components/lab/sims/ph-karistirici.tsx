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
 * pH karıştırıcı.
 *
 * pH'ın logaritmik olduğu söylenir ama sayı olarak hatırlanır. Burada
 * derişimi on kat değiştirince pH'ın yalnızca bir birim kaydığı görülüyor —
 * asıl anlaşılması gereken bu.
 *
 * Kuvvetli asit/baz için tam iyonlaşma varsayılıyor (lise modeli). Zayıf
 * asit için Ka üzerinden yaklaşık çözüm kullanılıyor; yardımda hangi
 * varsayımın yapıldığı yazıyor çünkü model sınırını gizlemek öğrenciyi
 * ileride yanıltıyor.
 */

type Kind = "kuvvetli-asit" | "zayif-asit" | "kuvvetli-baz";

const KW = 1e-14;

export function PhKaristiriciLab() {
  const [kind, setKind] = useState<Kind>("kuvvetli-asit");
  const [logC, setLogC] = useState(-2); // derişim üssü
  const [pKa, setPKa] = useState(4.76); // asetik asit
  const [dilution, setDilution] = useState(1);

  const c = Math.pow(10, logC) / dilution;

  let h: number;
  if (kind === "kuvvetli-asit") {
    // Suyun kendi iyonlaşması çok seyreltik çözeltide baskın olur.
    h = (c + Math.sqrt(c * c + 4 * KW)) / 2;
  } else if (kind === "kuvvetli-baz") {
    const oh = (c + Math.sqrt(c * c + 4 * KW)) / 2;
    h = KW / oh;
  } else {
    const ka = Math.pow(10, -pKa);
    // Ka küçük, x² + Ka·x − Ka·c = 0 tam çözümü.
    h = (-ka + Math.sqrt(ka * ka + 4 * ka * c)) / 2;
  }

  const ph = -Math.log10(h);
  const poh = 14 - ph;
  const nature = ph < 6.5 ? "Asidik" : ph > 7.5 ? "Bazik" : "Nötre yakın";

  // pH skalası çubuğu
  const W = 520;
  const H = 90;
  const pxOf = (p: number) => r2(30 + (Math.min(Math.max(p, 0), 14) / 14) * (W - 60));

  return (
    <SimShell
      id="ph-karistirici"
      title="pH karıştırıcı"
      subject="Kimya"
      summary="Derişimi 10 katına çıkar, pH neden sadece 1 birim kayıyor?"
      help={{
        intro:
          "pH, hidrojen iyonu derişiminin eksi logaritmasıdır. Logaritmik olduğu için derişim on katına çıktığında pH yalnızca bir birim değişir.",
        steps: [
          "Derişim kaydırıcısını bir basamak oynat — pH tam 1 birim kayar.",
          "Seyreltmeyi büyüt: kuvvetli asit bile 7'yi geçemez, suyun kendi iyonlaşması devreye girer.",
          "Zayıf aside geç: aynı derişimde pH çok daha yüksek çıkar, çünkü tamamı iyonlaşmaz.",
        ],
        legend: [
          { color: "#f0a08c", label: "Asidik" },
          { color: "#54c594", label: "Nötr" },
          { color: "#7aa2f7", label: "Bazik" },
        ],
      }}
      controls={
        <>
          <SimChips
            label="Çözelti"
            value={kind}
            options={[
              { id: "kuvvetli-asit" as Kind, label: "Kuvvetli asit" },
              { id: "zayif-asit" as Kind, label: "Zayıf asit" },
              { id: "kuvvetli-baz" as Kind, label: "Kuvvetli baz" },
            ]}
            onChange={setKind}
          />
          <SimSlider
            label="Derişim"
            value={logC}
            onChange={setLogC}
            min={-7}
            max={0}
            step={1}
            format={(v) => `10^${v} M`}
          />
          {kind === "zayif-asit" ? (
            <SimSlider
              label="pKa"
              value={pKa}
              onChange={setPKa}
              min={1}
              max={10}
              step={0.1}
              format={(v) => v.toFixed(2)}
            />
          ) : null}
          <SimSlider
            label="Seyreltme"
            value={dilution}
            onChange={setDilution}
            min={1}
            max={1000}
            step={1}
            format={(v) => `${v}×`}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="pH"
            tone="highlight"
            rows={[
              { label: "Değer", value: ph.toFixed(2) },
              { label: "Nitelik", value: nature },
            ]}
          />
          <SimReadout
            label="Derişimler"
            tone="accent"
            rows={[
              { label: "[H⁺]", value: `${h.toExponential(2)} M` },
              { label: "[OH⁻]", value: `${(KW / h).toExponential(2)} M` },
            ]}
          />
          <SimReadout
            label="pOH"
            rows={[
              { label: "Değer", value: poh.toFixed(2) },
              { label: "pH + pOH", value: (ph + poh).toFixed(2) },
            ]}
          />
          <SimReadout
            label="Etkin derişim"
            rows={[
              { label: "Başlangıç", value: `${c.toExponential(2)} M` },
              {
                label: "İyonlaşma",
                value:
                  kind === "zayif-asit"
                    ? `%${((h / c) * 100).toFixed(1)}`
                    : "%100",
              },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${labelOf(kind)}, 10^${logC} M ve ${dilution}× seyreltilmiş. pH kaç olur?`}
        hint="pH = −log[H⁺]. Zayıf asitte tamamı iyonlaşmaz."
        actual={ph}
        format={(v) => v.toFixed(2)}
        tolerance={0.1}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`pH ${ph.toFixed(2)}, ${nature}`}
      >
        <defs>
          <linearGradient id="ph-scale" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e05a4a" />
            <stop offset="35%" stopColor="#e0a44a" />
            <stop offset="50%" stopColor="#54c594" />
            <stop offset="65%" stopColor="#4aa8d0" />
            <stop offset="100%" stopColor="#7a5ae0" />
          </linearGradient>
        </defs>

        <rect x={30} y={34} width={W - 60} height={16} rx={8} fill="url(#ph-scale)" />

        {[0, 2, 4, 6, 7, 8, 10, 12, 14].map((p) => (
          <text key={p} x={pxOf(p)} y={70} textAnchor="middle" className="sim-axis">
            {p}
          </text>
        ))}

        {/* Göstergenin kendisi */}
        <polygon
          points={`${pxOf(ph)},${28} ${pxOf(ph) - 6},${16} ${pxOf(ph) + 6},${16}`}
          fill="#ffffff"
        />
        <text x={pxOf(ph)} y={12} textAnchor="middle" className="sim-axis" fill="#fff">
          {ph.toFixed(2)}
        </text>
      </svg>
    </SimShell>
  );
}

function labelOf(kind: Kind): string {
  if (kind === "kuvvetli-asit") return "Kuvvetli asit";
  if (kind === "kuvvetli-baz") return "Kuvvetli baz";
  return "Zayıf asit";
}
