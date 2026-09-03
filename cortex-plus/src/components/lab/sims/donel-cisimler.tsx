"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import { SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";
import { FnInput } from "@/components/lab/fn-input";
import { fmt } from "@/components/lab/sims/turev-teget";
import { compile, integrate } from "@/lib/lab/expr";
import { makeScale } from "@/lib/lab/plot";

/**
 * Dönel cisimler.
 *
 * y = f(x) eğrisini x ekseni etrafında döndürünce çıkan cismin hacmi
 * ∫πf(x)²dx. Formül kolay, zor olan neden KARE alındığını görmek: dönen
 * her dilim bir daire ve dairenin alanı yarıçapın karesiyle büyüyor.
 *
 * Bu yüzden ekranda hem kesit eğrisi hem dilimlerin daireleri var; dilim
 * sayısı artınca cisim düzleşiyor ve integralin ne topladığı görünüyor.
 */

export function DonelCisimlerLab() {
  const [src, setSrc] = useState("sqrt(x)");
  const [a, setA] = useState(0);
  const [b, setB] = useState(4);
  const [slices, setSlices] = useState(12);

  const f = useMemo(() => compile(src), [src]);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  const volume = useMemo(() => {
    if (!f || hi <= lo) return 0;
    return Math.PI * integrate((x) => Math.pow(f(x), 2), lo, hi, 400);
  }, [f, lo, hi]);

  /**
   * Yanal yüzey alanı: 2π∫f√(1+f′²)dx.
   *
   * İki tuzak var. Birincisi: sqrt(x) gibi fonksiyonların türevi uçta
   * sonsuza gidiyor ve merkezi fark tanım aralığının dışını örnekliyor
   * (√(-h) = NaN). Bu yüzden uçlardan çok küçük bir pay içeri giriliyor ve
   * fark aralığa sıkıştırılıyor.
   *
   * İkincisi: türev sonsuz olsa bile ÇARPIM sonlu kalabiliyor —
   * √x için f·√(1+f′²) → 1/2. Yani türevi görüp pes etmek yanlış olurdu;
   * yalnızca tanımsız örnek atlanıyor.
   */
  const surface = useMemo(() => {
    if (!f || hi <= lo) return 0;
    const inset = (hi - lo) * 1e-6;
    const a0 = lo + inset;
    const b0 = hi - inset;

    const integrand = (x: number) => {
      const h = Math.min((hi - lo) * 1e-5, Math.max(Math.abs(x), 1) * 1e-5);
      const xr = Math.min(x + h, hi);
      const xl = Math.max(x - h, lo);
      const d = (f(xr) - f(xl)) / Math.max(xr - xl, 1e-12);
      const v = Math.abs(f(x)) * Math.sqrt(1 + d * d);
      return Number.isFinite(v) ? v : 0;
    };

    const s = 2 * Math.PI * integrate(integrand, a0, b0, 400);
    return Number.isFinite(s) ? s : 0;
  }, [f, lo, hi]);

  const maxR = useMemo(() => {
    if (!f) return 1;
    let m = 0;
    for (let i = 0; i <= 200; i++) {
      const v = Math.abs(f(lo + ((hi - lo) * i) / 200));
      if (Number.isFinite(v)) m = Math.max(m, v);
    }
    return Math.max(m, 0.5);
  }, [f, lo, hi]);

  if (!f) {
    return (
      <SimShell
        id="donel-cisimler"
        title="Dönel cisimler"
        subject="Matematik"
        summary="Eğriyi döndür, hacmini bul."
        help={{ intro: "Bir fonksiyon yaz.", steps: ["Örnek: sqrt(x), x^2"] }}
        controls={<FnInput value={src} onChange={setSrc} />}
      >
        <p className="sim-error">Bu ifadeyi anlayamadım.</p>
      </SimShell>
    );
  }

  const scale = makeScale(lo - 0.3, hi + 0.3, -maxR * 1.25, maxR * 1.25, 560, 300, 30);

  const curveUp = sample(f, lo, hi, scale, 1);
  const curveDown = sample(f, lo, hi, scale, -1);

  const disks = Array.from({ length: slices }, (_, i) => {
    const x = lo + ((hi - lo) * (i + 0.5)) / slices;
    const r = Math.abs(f(x));
    return { x, r };
  }).filter((d) => Number.isFinite(d.r));

  return (
    <SimShell
      id="donel-cisimler"
      title="Dönel cisimler"
      subject="Matematik"
      summary="Neden yarıçapın karesi? Dilimleri say, gör."
      help={{
        intro:
          "Bir eğriyi x ekseni etrafında döndürünce ortaya bir cisim çıkar. Cismi ince disklere böleriz; her diskin hacmi πr²·kalınlık ve r, o noktadaki f(x) değeridir.",
        steps: [
          "Dilim sayısını artır — diskler inceldikçe cisim pürüzsüzleşir.",
          "Fonksiyonu değiştir: sqrt(x) koni benzeri, x^2 çan benzeri bir cisim verir.",
          "Yarıçap iki katına çıkınca hacmin dört katına çıktığına dikkat et.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Kesit eğrisi" },
          { color: "#7aa2f7", label: "Diskler" },
        ],
      }}
      controls={
        <>
          <FnInput value={src} onChange={setSrc} label="Yarıçap f(x)" />
          <SimSlider label="Alt sınır a" value={a} onChange={setA} min={0} max={8} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="Üst sınır b" value={b} onChange={setB} min={0.5} max={10} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="Dilim sayısı" value={slices} onChange={setSlices} min={3} max={60} />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Hacim"
            tone="highlight"
            rows={[
              { label: "V = π∫f²dx", value: fmt(volume) },
              { label: "π cinsinden", value: `${fmt(volume / Math.PI)}π` },
            ]}
          />
          <SimReadout
            label="Yanal yüzey"
            tone="accent"
            rows={[
              { label: "S", value: fmt(surface) },
              { label: "Aralık", value: `[${lo}, ${hi}]` },
            ]}
          />
          <SimReadout
            label="Yarıçap"
            rows={[
              { label: "En büyük", value: fmt(maxR) },
              { label: "Uçta f(b)", value: fmt(f(hi)) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`y = ${src} eğrisi [${lo}, ${hi}] aralığında x ekseni etrafında döndürülürse hacim kaç olur?`}
        hint="Her dilim bir daire: alanı πr². Yarıçap f(x)."
        actual={volume}
        format={fmt}
        tolerance={0.25}
      />

      <svg
        viewBox={`0 0 ${scale.W} ${scale.H}`}
        className="sim-chart"
        role="img"
        aria-label={`Hacim ${fmt(volume)}`}
      >
        {/* Dönme ekseni */}
        <line
          x1={scale.PAD}
          x2={scale.W - scale.PAD}
          y1={scale.py(0)}
          y2={scale.py(0)}
          stroke="#4a4a4a"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />

        {/* Diskler — kesitte elips olarak görünüyorlar. */}
        {disks.map((d, i) => (
          <ellipse
            key={i}
            cx={scale.px(d.x)}
            cy={scale.py(0)}
            rx={r2(Math.max((scale.px(hi) - scale.px(lo)) / slices / 2.2, 1))}
            ry={r2(Math.abs(scale.py(d.r) - scale.py(0)))}
            fill="rgba(122,162,247,0.16)"
            stroke="#7aa2f7"
            strokeWidth="1"
          />
        ))}

        <path d={curveUp} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
        <path d={curveDown} fill="none" stroke="#f4ae0b" strokeWidth="1.5" opacity="0.5" />
      </svg>
    </SimShell>
  );
}

function sample(
  f: (x: number) => number,
  lo: number,
  hi: number,
  scale: ReturnType<typeof makeScale>,
  sign: 1 | -1,
): string {
  const parts: string[] = [];
  for (let i = 0; i <= 200; i++) {
    const x = lo + ((hi - lo) * i) / 200;
    const y = f(x);
    if (!Number.isFinite(y)) {
      parts.push("");
      continue;
    }
    parts.push(`${parts.length && parts[parts.length - 1] ? "L" : "M"}${scale.px(x)},${scale.py(sign * Math.abs(y))}`);
  }
  return parts.filter(Boolean).join(" ");
}
