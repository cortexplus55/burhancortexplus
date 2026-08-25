"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function LabFrame({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? (
        <p className="text-sm text-[var(--astra-muted)]">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

export function DenklemLab() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-5);
  const [c, setC] = useState(6);
  const roots = useMemo(() => {
    if (a === 0) return b === 0 ? "Tüm reel sayılar" : "Çözüm yok";
    const d = b * b - 4 * a * c;
    if (d < 0) return "Karmaşık kök (discriminant < 0)";
    if (d === 0) return `x = ${(-b / (2 * a)).toFixed(3)}`;
    const s = Math.sqrt(d);
    const x1 = (-b + s) / (2 * a);
    const x2 = (-b - s) / (2 * a);
    return `x₁ = ${x1.toFixed(3)}, x₂ = ${x2.toFixed(3)}`;
  }, [a, b, c]);

  return (
    <LabFrame title="ax² + bx + c = 0" hint="Kaydırıcılarla katsayıları değiştir.">
      {(["a", "b", "c"] as const).map((k, i) => {
        const val = [a, b, c][i];
        const set = [setA, setB, setC][i];
        return (
          <label key={k} className="block text-sm">
            {k}: {val}
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={val}
              onChange={(e) => set(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        );
      })}
      <div className="astra-pay-card p-4 text-center text-lg font-medium">{roots}</div>
    </LabFrame>
  );
}

export function GeometriLab() {
  const [base, setBase] = useState(8);
  const [height, setHeight] = useState(5);
  const area = (base * height) / 2;
  return (
    <LabFrame title="Üçgen alanı" hint="Alan = (taban × yükseklik) / 2">
      <label className="block text-sm">
        Taban: {base}
        <input type="range" min={1} max={20} value={base} onChange={(e) => setBase(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Yükseklik: {height}
        <input type="range" min={1} max={20} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <svg viewBox="0 0 200 120" className="w-full max-w-sm rounded-xl border border-[var(--astra-border)]">
        <polygon
          points={`20,100 ${20 + base * 8},100 20,${100 - height * 8}`}
          fill="rgba(110,231,183,0.25)"
          stroke="#6ee7b7"
          strokeWidth="2"
        />
      </svg>
      <p className="text-center font-semibold">Alan = {area} birim²</p>
    </LabFrame>
  );
}

export function RenkLab() {
  const [r, setR] = useState(110);
  const [g, setG] = useState(231);
  const [b, setB] = useState(183);
  const hex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  return (
    <LabFrame title="RGB renk modeli">
      <label className="block text-sm">
        Kırmızı: {r}
        <input type="range" min={0} max={255} value={r} onChange={(e) => setR(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Yeşil: {g}
        <input type="range" min={0} max={255} value={g} onChange={(e) => setG(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Mavi: {b}
        <input type="range" min={0} max={255} value={b} onChange={(e) => setB(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <div
        className="h-24 rounded-2xl border border-[var(--astra-border)]"
        style={{ backgroundColor: hex }}
      />
      <p className="text-center text-sm font-mono">{hex}</p>
    </LabFrame>
  );
}

export function DevreLab() {
  const [voltage, setVoltage] = useState(12);
  const [r1, setR1] = useState(4);
  const [r2, setR2] = useState(8);
  const rTotal = r1 + r2;
  const current = rTotal > 0 ? voltage / rTotal : 0;
  return (
    <LabFrame title="Seri devre" hint="I = V / (R₁ + R₂)">
      <label className="block text-sm">
        V (Volt): {voltage}
        <input type="range" min={1} max={24} value={voltage} onChange={(e) => setVoltage(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        R₁ (Ω): {r1}
        <input type="range" min={1} max={20} value={r1} onChange={(e) => setR1(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        R₂ (Ω): {r2}
        <input type="range" min={1} max={20} value={r2} onChange={(e) => setR2(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <div className="astra-pay-card p-4 text-center">
        <p>Akım I ≈ {current.toFixed(2)} A</p>
        <p className="text-xs text-[var(--astra-muted)]">V₁ = {(current * r1).toFixed(2)} V · V₂ = {(current * r2).toFixed(2)} V</p>
      </div>
    </LabFrame>
  );
}

export function GunesLab() {
  const [speed, setSpeed] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0c0c0c";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
      ctx.fill();
      const planets = [
        { r: 35, size: 4, color: "#94a3b8" },
        { r: 55, size: 6, color: "#f97316" },
        { r: 75, size: 5, color: "#38bdf8" },
      ];
      planets.forEach((p, i) => {
        const angle = t * 0.001 * speed * (1.2 - i * 0.2) + i;
        const x = w / 2 + Math.cos(angle) * p.r;
        const y = h / 2 + Math.sin(angle) * p.r * 0.6;
        ctx.strokeStyle = "#333";
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    [speed],
  );

  useEffect(() => {
    let id = 0;
    const loop = (t: number) => {
      draw(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  return (
    <LabFrame title="Güneş sistemi (basitleştirilmiş)">
      <label className="block text-sm">
        Yörünge hızı: {speed.toFixed(1)}×
        <input type="range" min={0.2} max={3} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <canvas ref={canvasRef} width={320} height={200} className="w-full max-w-md rounded-2xl border border-[var(--astra-border)]" />
    </LabFrame>
  );
}

export function DalgaLab() {
  const [freq, setFreq] = useState(2);
  const [amp, setAmp] = useState(40);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#6ee7b7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const y =
        canvas.height / 2 +
        Math.sin((x / canvas.width) * Math.PI * 2 * freq) * amp * 0.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [freq, amp]);

  return (
    <LabFrame title="Sinüs dalgası" hint="Frekans ve genlik değiştir.">
      <label className="block text-sm">
        Frekans: {freq}
        <input type="range" min={1} max={8} value={freq} onChange={(e) => setFreq(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Genlik: {amp}
        <input type="range" min={10} max={80} value={amp} onChange={(e) => setAmp(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <canvas ref={canvasRef} width={320} height={160} className="w-full max-w-md rounded-2xl border border-[var(--astra-border)]" />
    </LabFrame>
  );
}

export function MolekulLab() {
  const [molecule, setMolecule] = useState<"h2o" | "co2" | "ch4">("h2o");
  const labels = { h2o: "H₂O", co2: "CO₂", ch4: "CH₄" };
  return (
    <LabFrame title="Basit moleküller">
      <div className="flex gap-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMolecule(k)}
            className={
              molecule === k
                ? "astra-btn-primary rounded-full px-3 py-1 text-xs"
                : "rounded-full border border-[var(--astra-border)] px-3 py-1 text-xs"
            }
          >
            {labels[k]}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 200 140" className="mx-auto w-full max-w-xs">
        {molecule === "h2o" && (
          <>
            <circle cx={100} cy={70} r={22} fill="#ef4444" />
            <text x={100} y={75} textAnchor="middle" fill="#fff" fontSize={14}>O</text>
            <circle cx={60} cy={50} r={14} fill="#e2e8f0" />
            <text x={60} y={54} textAnchor="middle" fontSize={12}>H</text>
            <circle cx={140} cy={50} r={14} fill="#e2e8f0" />
            <text x={140} y={54} textAnchor="middle" fontSize={12}>H</text>
          </>
        )}
        {molecule === "co2" && (
          <>
            <circle cx={70} cy={70} r={14} fill="#e2e8f0" />
            <text x={70} y={74} textAnchor="middle" fontSize={12}>O</text>
            <circle cx={100} cy={70} r={18} fill="#64748b" />
            <text x={100} y={74} textAnchor="middle" fill="#fff" fontSize={12}>C</text>
            <circle cx={130} cy={70} r={14} fill="#e2e8f0" />
            <text x={130} y={74} textAnchor="middle" fontSize={12}>O</text>
          </>
        )}
        {molecule === "ch4" && (
          <>
            <circle cx={100} cy={70} r={18} fill="#64748b" />
            <text x={100} y={74} textAnchor="middle" fill="#fff" fontSize={12}>C</text>
            {[0, 1, 2, 3].map((i) => {
              const a = (i * Math.PI) / 2;
              const x = 100 + Math.cos(a) * 40;
              const y = 70 + Math.sin(a) * 40;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={12} fill="#e2e8f0" />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={10}>H</text>
                </g>
              );
            })}
          </>
        )}
      </svg>
    </LabFrame>
  );
}

export function TepkimeLab() {
  const [reactants, setReactants] = useState(2);
  const [products, setProducts] = useState(2);
  const balanced = reactants === products;
  return (
    <LabFrame title="Denklem denge" hint="Reaktant ve ürün sayılarını eşitle.">
      <label className="block text-sm">
        Reaktant tarafı: {reactants}
        <input type="range" min={1} max={6} value={reactants} onChange={(e) => setReactants(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        Ürün tarafı: {products}
        <input type="range" min={1} max={6} value={products} onChange={(e) => setProducts(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <p className="astra-pay-card p-4 text-center text-sm">
        {Array(reactants).fill("A").join(" + ")} → {Array(products).fill("B").join(" + ")}
        <br />
        <span className={balanced ? "text-emerald-400" : "text-amber-400"}>
          {balanced ? "Dengeli!" : "Atom sayısı eşit değil — katsayı ayarla."}
        </span>
      </p>
    </LabFrame>
  );
}

const ORGANELLES = [
  { id: "nuk", label: "Çekirdek", x: 100, y: 70 },
  { id: "mit", label: "Mitokondri", x: 160, y: 90 },
  { id: "er", label: "ER", x: 130, y: 50 },
  { id: "gol", label: "Golgi", x: 70, y: 95 },
];

export function HucreLab() {
  const [selected, setSelected] = useState<string | null>(null);
  const label = ORGANELLES.find((o) => o.id === selected)?.label;
  return (
    <LabFrame title="Hücre yapısı" hint="Organellere dokun.">
      <svg viewBox="0 0 220 160" className="mx-auto w-full max-w-sm">
        <ellipse cx={110} cy={80} rx={95} ry={65} fill="rgba(110,231,183,0.15)" stroke="#6ee7b7" strokeWidth={2} />
        {ORGANELLES.map((o) => (
          <g key={o.id} onClick={() => setSelected(o.id)} className="cursor-pointer">
            <circle cx={o.x} cy={o.y} r={selected === o.id ? 16 : 12} fill={selected === o.id ? "#6ee7b7" : "#334155"} />
          </g>
        ))}
      </svg>
      <p className="text-center text-sm">{label ?? "Bir organel seç"}</p>
    </LabFrame>
  );
}

export function EkosistemLab() {
  const chain = ["Güneş", "Ot", "Tavşan", "Kartal"];
  const [step, setStep] = useState(0);
  return (
    <LabFrame title="Besin zinciri">
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {chain.map((item, i) => (
          <span key={item} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={
                step === i
                  ? "astra-btn-primary rounded-full px-3 py-1"
                  : "rounded-full border border-[var(--astra-border)] px-3 py-1"
              }
            >
              {item}
            </button>
            {i < chain.length - 1 ? <span aria-hidden>→</span> : null}
          </span>
        ))}
      </div>
      <p className="text-center text-sm text-[var(--astra-muted)]">
        {step === 0 && "Enerji kaynağı"}
        {step === 1 && "Birincil üretici"}
        {step === 2 && "Birincil tüketici"}
        {step === 3 && "Apex avcı — zincirin tepesi"}
      </p>
    </LabFrame>
  );
}

export function IntegralLab() {
  const [n, setN] = useState(4);
  const approx = useMemo(() => {
    let sum = 0;
    const dx = 1 / n;
    for (let i = 0; i < n; i++) {
      const x = i * dx;
      sum += x * x * dx;
    }
    return sum;
  }, [n]);
  return (
    <LabFrame title="∫₀¹ x² dx — Riemann" hint="Dikdörtgen sayısı arttıkça 1/3'e yaklaşır.">
      <label className="block text-sm">
        Bölme n: {n}
        <input type="range" min={2} max={40} value={n} onChange={(e) => setN(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <p className="text-center font-semibold">Yaklaşık = {approx.toFixed(4)} (gerçek ≈ 0.333)</p>
    </LabFrame>
  );
}

export function OlasilikLab() {
  const [trials, setTrials] = useState(0);
  const [heads, setHeads] = useState(0);
  function flip() {
    setTrials((t) => t + 1);
    if (Math.random() > 0.5) setHeads((h) => h + 1);
  }
  return (
    <LabFrame title="Yazı-tura simülasyonu">
      <button type="button" className="astra-btn-primary w-full rounded-full py-2" onClick={flip}>
        At
      </button>
      <p className="text-center text-sm">
        {trials} deneme · {heads} yazı · Oran {(trials ? heads / trials : 0).toFixed(2)}
      </p>
    </LabFrame>
  );
}

export function MomentumLab() {
  const [m1, setM1] = useState(2);
  const [v1, setV1] = useState(5);
  const [m2, setM2] = useState(3);
  const [v2, setV2] = useState(-2);
  const pTotal = m1 * v1 + m2 * v2;
  return (
    <LabFrame title="Momentum korunumu (1D)">
      <label className="block text-sm">
        m₁: {m1}
        <input type="range" min={1} max={10} value={m1} onChange={(e) => setM1(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        v₁: {v1}
        <input type="range" min={-10} max={10} value={v1} onChange={(e) => setV1(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        m₂: {m2}
        <input type="range" min={1} max={10} value={m2} onChange={(e) => setM2(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <label className="block text-sm">
        v₂: {v2}
        <input type="range" min={-10} max={10} value={v2} onChange={(e) => setV2(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <p className="astra-pay-card p-3 text-center">Toplam p = {pTotal.toFixed(1)} kg·m/s</p>
    </LabFrame>
  );
}

export function AsitBazLab() {
  const [ph, setPh] = useState(7);
  const label =
    ph < 7 ? "Asidik" : ph > 7 ? "Bazik" : "Nötr";
  return (
    <LabFrame title="pH ölçeği">
      <input type="range" min={0} max={14} step={0.5} value={ph} onChange={(e) => setPh(Number(e.target.value))} className="w-full" />
      <p className="text-center text-2xl font-bold">pH {ph.toFixed(1)}</p>
      <p className="text-center text-sm text-[var(--astra-muted)]">{label}</p>
    </LabFrame>
  );
}

export function FotosentezLab() {
  const [light, setLight] = useState(50);
  const rate = Math.min(100, light * 0.8 + 10);
  return (
    <LabFrame title="Fotosentez hızı (model)">
      <label className="block text-sm">
        Işık şiddeti: {light}%
        <input type="range" min={0} max={100} value={light} onChange={(e) => setLight(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--astra-surface)]">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${rate}%` }} />
      </div>
      <p className="text-center text-xs text-[var(--astra-muted)]">O₂ üretim hızı (göreli): {rate.toFixed(0)}%</p>
    </LabFrame>
  );
}

export function TrigonometriLab() {
  const [deg, setDeg] = useState(30);
  const rad = (deg * Math.PI) / 180;
  return (
    <LabFrame title="Birim çember">
      <label className="block text-sm">
        Açı: {deg}°
        <input type="range" min={0} max={360} value={deg} onChange={(e) => setDeg(Number(e.target.value))} className="mt-1 w-full" />
      </label>
      <p className="text-center text-sm">
        sin = {Math.sin(rad).toFixed(3)} · cos = {Math.cos(rad).toFixed(3)}
      </p>
      <svg viewBox="0 0 200 200" className="mx-auto h-48 w-48">
        <circle cx={100} cy={100} r={80} fill="none" stroke="#444" strokeWidth={2} />
        <line x1={100} y1={100} x2={100 + Math.cos(rad) * 80} y2={100 - Math.sin(rad) * 80} stroke="#6ee7b7" strokeWidth={3} />
        <circle cx={100 + Math.cos(rad) * 80} cy={100 - Math.sin(rad) * 80} r={6} fill="#6ee7b7" />
      </svg>
    </LabFrame>
  );
}
