"use client";

import { useId, type ReactNode } from "react";
import type { BadgeId } from "@/lib/gamification/badges";

/*
  Rozet çizimleri. Her çizim tek bir şekil tanımından iki hâlde çıkıyor:
  açıkken renkli, kilitliyken yalnızca ince gri çizgi. Kilitli hâlin boş
  bir kutu değil de "burada ne var" diyen bir taslak olması, referans
  üründeki gibi öğrenciyi bir sonraki durağa çekiyor.

  Görseller bizim çizimimiz; referans ürünün resimleri kullanılmıyor.
*/

type Mode = { locked: boolean; id: string };

const fill = (m: Mode, color: string) => (m.locked ? "none" : color);
const stroke = (m: Mode, color = "none") => (m.locked ? "currentColor" : color);
const LOCKED_WIDTH = 1.3;

function Shade({ m, cx, cy, r }: { m: Mode; cx: number; cy: number; r: number }) {
  if (m.locked) return null;
  return <circle cx={cx} cy={cy} r={r} fill={`url(#${m.id}-shade)`} />;
}

function Defs({ m }: { m: Mode }) {
  if (m.locked) return null;
  return (
    <defs>
      <radialGradient id={`${m.id}-shade`} cx="35%" cy="30%" r="75%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.38" />
      </radialGradient>
      <radialGradient id={`${m.id}-sun`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fffbe0" />
        <stop offset="0.35" stopColor="#ffd35a" />
        <stop offset="0.75" stopColor="#ff8a1f" />
        <stop offset="1" stopColor="#ff4d1a" />
      </radialGradient>
      <radialGradient id={`${m.id}-glow`} cx="50%" cy="50%" r="50%">
        <stop offset="0.5" stopColor="#ff9a2e" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ff9a2e" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** Gezegen gövdesi: taban rengi, kırpılmış bantlar, gölge, dış çizgi. */
function Planet({
  m,
  r,
  cx = 60,
  cy = 60,
  base,
  bands = [],
  children,
}: {
  m: Mode;
  r: number;
  cx?: number;
  cy?: number;
  base: string;
  bands?: { y: number; color: string; width?: number; wave?: number }[];
  children?: ReactNode;
}) {
  const clip = `${m.id}-clip-${cx}-${cy}`;
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={fill(m, base)} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <g clipPath={`url(#${clip})`}>
        {bands.map((band, i) => {
          const w = band.wave ?? 3;
          return (
            <path
              key={i}
              d={`M ${cx - r - 4} ${band.y} Q ${cx - r / 2} ${band.y - w} ${cx} ${band.y} T ${cx + r + 4} ${band.y}`}
              fill="none"
              stroke={m.locked ? "currentColor" : band.color}
              strokeWidth={m.locked ? LOCKED_WIDTH : (band.width ?? 5)}
              strokeLinecap="round"
            />
          );
        })}
        {children}
      </g>
      <Shade m={m} cx={cx} cy={cy} r={r} />
    </g>
  );
}

/** Eğik halka: arka yarısı gezegenin arkasında, ön yarısı önünde. */
function Ring({
  m,
  rx,
  ry,
  rotate,
  color,
  width = 3,
  front,
}: {
  m: Mode;
  rx: number;
  ry: number;
  rotate: number;
  color: string;
  width?: number;
  front: boolean;
}) {
  const d = front
    ? `M ${60 - rx} 60 A ${rx} ${ry} 0 0 0 ${60 + rx} 60`
    : `M ${60 - rx} 60 A ${rx} ${ry} 0 0 1 ${60 + rx} 60`;
  return (
    <path
      d={d}
      transform={`rotate(${rotate} 60 60)`}
      fill="none"
      stroke={m.locked ? "currentColor" : color}
      strokeWidth={m.locked ? LOCKED_WIDTH : width}
      strokeLinecap="round"
    />
  );
}

function Craters({ m, spots }: { m: Mode; spots: [number, number, number][] }) {
  return (
    <>
      {spots.map(([x, y, r], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          fill={fill(m, "#b3aea3")}
          stroke={m.locked ? "currentColor" : "#9d988d"}
          strokeWidth={m.locked ? LOCKED_WIDTH : 0.8}
        />
      ))}
    </>
  );
}

/** Yörüngedeki küçük roket noktası. */
function Craft({ m, x, y }: { m: Mode; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.2} fill={fill(m, "#f5f6fa")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      {m.locked ? null : <circle cx={x - 3.5} cy={y + 1.5} r={1.8} fill="#ff9a2e" />}
    </g>
  );
}

function Rocket({ m }: { m: Mode }) {
  const tower = m.locked ? "currentColor" : "#8a93a6";
  return (
    <g strokeLinejoin="round">
      {/* Fırlatma kulesi */}
      <g stroke={tower} strokeWidth={m.locked ? LOCKED_WIDTH : 1.6} fill="none">
        <path d="M30 104 L30 26 M38 104 L38 26 M30 26 L38 26" />
        {[34, 46, 58, 70, 82, 94].map((y) => (
          <path key={y} d={`M30 ${y} L38 ${y + 10} M38 ${y} L30 ${y + 10}`} />
        ))}
        <path d="M38 44 L47 44 M38 74 L47 74" />
      </g>
      <path d="M22 104 L98 104" stroke={tower} strokeWidth={m.locked ? LOCKED_WIDTH : 2} />
      {/* Alev */}
      {m.locked ? null : (
        <>
          <path d="M53 88 Q60 112 67 88 Z" fill="#ffb02e" />
          <path d="M56 88 Q60 102 64 88 Z" fill="#fff1b8" />
        </>
      )}
      {/* Kanatlar */}
      <path d="M50 70 L40 92 L50 88 Z" fill={fill(m, "#ff6b4a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <path d="M70 70 L80 92 L70 88 Z" fill={fill(m, "#ff6b4a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      {/* Gövde */}
      <path
        d="M60 14 C70 26 71 42 71 58 L71 88 L49 88 L49 58 C49 42 50 26 60 14 Z"
        fill={fill(m, "#eef0f5")}
        stroke={stroke(m, "#c9ceda")}
        strokeWidth={m.locked ? LOCKED_WIDTH : 1}
      />
      <path d="M60 14 C65 20 68 26 69.5 34 L50.5 34 C52 26 55 20 60 14 Z" fill={fill(m, "#ff6b4a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <circle cx={60} cy={52} r={6.5} fill={fill(m, "#4fb3ff")} stroke={stroke(m, "#2d6fb3")} strokeWidth={m.locked ? LOCKED_WIDTH : 1.5} />
      {m.locked ? null : <path d="M49 58 L49 88 L55 88 L55 58 Z" fill="#000" opacity="0.08" />}
    </g>
  );
}

function Earth({ m }: { m: Mode }) {
  return (
    <g>
      <Ring m={m} rx={48} ry={13} rotate={-18} color="#f4ae0b" width={2} front={false} />
      <Planet m={m} r={27} base="#2f7de1">
        <path
          d="M40 44 C48 38 58 40 60 47 C62 54 54 56 50 62 C46 68 40 64 38 56 Z"
          fill={fill(m, "#3fae5a")}
          stroke={stroke(m)}
          strokeWidth={LOCKED_WIDTH}
        />
        <path
          d="M64 60 C72 56 82 60 84 68 C80 78 70 82 64 76 C62 70 60 64 64 60 Z"
          fill={fill(m, "#3fae5a")}
          stroke={stroke(m)}
          strokeWidth={LOCKED_WIDTH}
        />
        <path d="M58 34 C64 32 70 34 72 38 C66 40 60 39 58 34 Z" fill={fill(m, "#f2f6ff")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      </Planet>
      <Ring m={m} rx={48} ry={13} rotate={-18} color="#f4ae0b" width={2} front />
      <Craft m={m} x={94} y={58} />
    </g>
  );
}

function MoonOrbit({ m }: { m: Mode }) {
  return (
    <g>
      <Ring m={m} rx={46} ry={12} rotate={-22} color="#f4ae0b" width={2} front={false} />
      <Planet m={m} r={25} base="#d9d6cf">
        <Craters m={m} spots={[[50, 50, 5], [68, 56, 7], [56, 72, 4], [72, 44, 3]]} />
      </Planet>
      <Ring m={m} rx={46} ry={12} rotate={-22} color="#f4ae0b" width={2} front />
      <Craft m={m} x={30} y={74} />
    </g>
  );
}

function Moon({ m }: { m: Mode }) {
  return (
    <g>
      <Planet m={m} r={31} cy={64} base="#dedbd3">
        <Craters m={m} spots={[[46, 56, 6], [68, 62, 8], [54, 80, 5], [76, 80, 4], [62, 44, 3.5]]} />
      </Planet>
      {/* Bayrak */}
      <path d="M60 33 L60 16" stroke={m.locked ? "currentColor" : "#c9ceda"} strokeWidth={m.locked ? LOCKED_WIDTH : 1.6} />
      <path d="M60 16 L74 19 L60 23 Z" fill={fill(m, "#ff6b4a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
    </g>
  );
}

function Venus({ m }: { m: Mode }) {
  return (
    <Planet
      m={m}
      r={31}
      base="#e8b86a"
      bands={[
        { y: 42, color: "#f3d39b", width: 6, wave: 5 },
        { y: 56, color: "#d99a4a", width: 7, wave: 4 },
        { y: 70, color: "#f0c985", width: 6, wave: 6 },
        { y: 82, color: "#cf8c3e", width: 6, wave: 3 },
      ]}
    />
  );
}

function Mars({ m }: { m: Mode }) {
  return (
    <Planet m={m} r={31} base="#d0532f">
      <ellipse cx={50} cy={58} rx={11} ry={6} fill={fill(m, "#9c3a22")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <ellipse cx={72} cy={72} rx={8} ry={4.5} fill={fill(m, "#a8432a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <ellipse cx={66} cy={48} rx={5} ry={3} fill={fill(m, "#b44a2c")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <ellipse cx={60} cy={30} rx={13} ry={4} fill={fill(m, "#f7efe9")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
    </Planet>
  );
}

function Jupiter({ m }: { m: Mode }) {
  return (
    <Planet
      m={m}
      r={33}
      base="#eab07a"
      bands={[
        { y: 36, color: "#f6d9b3", width: 5 },
        { y: 46, color: "#c9773f", width: 6 },
        { y: 56, color: "#f6d9b3", width: 5, wave: 4 },
        { y: 66, color: "#b8693a", width: 7 },
        { y: 78, color: "#f1c895", width: 5 },
        { y: 87, color: "#c9773f", width: 5 },
      ]}
    >
      <ellipse cx={71} cy={70} rx={7} ry={4} fill={fill(m, "#b5543a")} stroke={stroke(m, "#f6d9b3")} strokeWidth={m.locked ? LOCKED_WIDTH : 1} />
    </Planet>
  );
}

function Saturn({ m }: { m: Mode }) {
  return (
    <g>
      <Ring m={m} rx={50} ry={13} rotate={-14} color="#d8c08a" width={5} front={false} />
      <Ring m={m} rx={42} ry={10} rotate={-14} color="#b99c63" width={2} front={false} />
      <Planet
        m={m}
        r={25}
        base="#e6c98a"
        bands={[
          { y: 46, color: "#f3e1b5", width: 4 },
          { y: 56, color: "#cfa75e", width: 5 },
          { y: 67, color: "#f0d9a4", width: 4 },
          { y: 76, color: "#c49a52", width: 4 },
        ]}
      />
      <Ring m={m} rx={42} ry={10} rotate={-14} color="#b99c63" width={2} front />
      <Ring m={m} rx={50} ry={13} rotate={-14} color="#d8c08a" width={5} front />
    </g>
  );
}

function Uranus({ m }: { m: Mode }) {
  return (
    <g>
      <Ring m={m} rx={44} ry={9} rotate={-72} color="#cdeff3" width={2} front={false} />
      <Planet
        m={m}
        r={27}
        base="#8fd6e0"
        bands={[
          { y: 48, color: "#a9e2ea", width: 4, wave: 2 },
          { y: 62, color: "#7cc5d0", width: 5, wave: 2 },
          { y: 74, color: "#a9e2ea", width: 4, wave: 2 },
        ]}
      />
      <Ring m={m} rx={44} ry={9} rotate={-72} color="#cdeff3" width={2} front />
    </g>
  );
}

function Neptune({ m }: { m: Mode }) {
  return (
    <Planet
      m={m}
      r={31}
      base="#3f63d8"
      bands={[
        { y: 40, color: "#5b7ff0", width: 5 },
        { y: 52, color: "#2f4fb8", width: 6 },
        { y: 64, color: "#5b7ff0", width: 5 },
        { y: 76, color: "#2f4fb8", width: 6 },
        { y: 86, color: "#5b7ff0", width: 4 },
      ]}
    >
      <ellipse cx={48} cy={60} rx={6} ry={3.5} fill={fill(m, "#1f358a")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
    </Planet>
  );
}

function Probe({ m }: { m: Mode }) {
  const metal = m.locked ? "currentColor" : "#9aa3b8";
  return (
    <g strokeLinejoin="round">
      {/* Anten çanağı */}
      <g transform="rotate(-24 50 42)">
        <ellipse cx={50} cy={42} rx={26} ry={11} fill={fill(m, "#eef0f5")} stroke={stroke(m, "#c9ceda")} strokeWidth={m.locked ? LOCKED_WIDTH : 1.2} />
        <ellipse cx={50} cy={42} rx={17} ry={6.5} fill="none" stroke={m.locked ? "currentColor" : "#d7dbe6"} strokeWidth={m.locked ? LOCKED_WIDTH : 1} />
        <path d="M50 42 L50 24" stroke={metal} strokeWidth={m.locked ? LOCKED_WIDTH : 1.6} />
        <circle cx={50} cy={23} r={2.2} fill={fill(m, "#c9ceda")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      </g>
      {/* Gövde */}
      <path d="M54 54 L62 70" stroke={metal} strokeWidth={m.locked ? LOCKED_WIDTH : 2} />
      <rect x={52} y={68} width={22} height={16} rx={2} fill={fill(m, "#c9a24a")} stroke={stroke(m, "#9c7c2e")} strokeWidth={m.locked ? LOCKED_WIDTH : 1} />
      <circle cx={63} cy={76} r={4} fill={fill(m, "#8a6a22")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      {/* Kollar */}
      <path d="M74 76 L98 70 M52 80 L34 96 M68 84 L72 102" stroke={metal} strokeWidth={m.locked ? LOCKED_WIDTH : 1.6} />
      <rect x={96} y={64} width={10} height={10} rx={2} fill={fill(m, "#6b7385")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <circle cx={33} cy={97} r={3} fill={fill(m, "#6b7385")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
      <circle cx={72} cy={103} r={3} fill={fill(m, "#6b7385")} stroke={stroke(m)} strokeWidth={LOCKED_WIDTH} />
    </g>
  );
}

function Star({ m }: { m: Mode }) {
  if (m.locked) {
    return (
      <g fill="none" stroke="currentColor" strokeWidth={LOCKED_WIDTH} strokeLinecap="round">
        <circle cx={60} cy={60} r={24} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          const x1 = 60 + Math.cos(a) * 30;
          const y1 = 60 + Math.sin(a) * 30;
          const x2 = 60 + Math.cos(a) * 38;
          const y2 = 60 + Math.sin(a) * 38;
          return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`} />;
        })}
      </g>
    );
  }
  return (
    <g>
      <circle cx={60} cy={60} r={42} fill={`url(#${m.id}-glow)`} />
      <circle cx={60} cy={60} r={25} fill={`url(#${m.id}-sun)`} />
      <path d="M44 52 Q52 46 58 52 M62 70 Q70 66 76 72" stroke="#fff3b0" strokeWidth={1.5} fill="none" opacity={0.7} />
    </g>
  );
}

const ART: Record<BadgeId, (m: Mode) => ReactNode> = {
  roket: (m) => <Rocket m={m} />,
  dunya: (m) => <Earth m={m} />,
  "ay-yorunge": (m) => <MoonOrbit m={m} />,
  ay: (m) => <Moon m={m} />,
  venus: (m) => <Venus m={m} />,
  mars: (m) => <Mars m={m} />,
  jupiter: (m) => <Jupiter m={m} />,
  saturn: (m) => <Saturn m={m} />,
  uranus: (m) => <Uranus m={m} />,
  neptun: (m) => <Neptune m={m} />,
  yildizlararasi: (m) => <Probe m={m} />,
  "ilk-yildiz": (m) => <Star m={m} />,
};

export function BadgeArt({
  id,
  locked,
  className,
}: {
  id: BadgeId;
  locked: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const m: Mode = { locked, id: `ba${uid}` };
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden focusable="false">
      <Defs m={m} />
      {ART[id](m)}
    </svg>
  );
}
