import type { CSSProperties } from "react";
import { CORTEX_GOLD, NETWORK_MARK } from "@/components/brand/cortex-geometry";
import { cn } from "@/lib/utils";
import "@/styles/brand-motion.css";

/**
 * Hareketli Cortex Plus işareti (19 Ekim 2026). Hareketin kuralı:
 * - `intro`: düğümler tek tek yerine oturur, bağlar çizilir, artı belirir (~1,2 sn); sonra her
 *   3,2 saniyede bir sinyal C'nin bir ucundan öbürüne akar ve artıda parlar.
 * - `loop`: yalnız sinyal, sürekli ve hızlı (1,4 sn). İçerik hazırlanırken yükleniyor işareti.
 * Küçük yerlerde (menü, sekme) hareket yok: orada `CortexMark`. Hareket azaltma açıksa durur.
 *
 * Yalnız CSS; sunucuda çizilir. Gradyan ve parıltı kimlikleri sabit — sayfada birden çok kopya
 * olsa da tanımlar aynı.
 */
export function CortexLogoMotion({
  size = 120,
  mode = "intro",
  className,
}: {
  size?: number;
  mode?: "intro" | "loop";
  className?: string;
}) {
  const { outer, inner, links, outerR, innerR, plus } = NETWORK_MARK;
  const paint = "url(#cxl-gold)";
  const order = (value: number) => ({ "--k": value }) as CSSProperties;
  return (
    <svg
      width={size}
      height={size}
      viewBox={NETWORK_MARK.viewBox}
      fill="none"
      className={cn("cxl", mode === "loop" && "cxl--loop", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cxl-gold" gradientUnits="userSpaceOnUse" x1="10" y1="14" x2="110" y2="106">
          <stop offset="0" stopColor={CORTEX_GOLD.light} />
          <stop offset="0.5" stopColor={CORTEX_GOLD.mid} />
          <stop offset="1" stopColor={CORTEX_GOLD.deep} />
        </linearGradient>
        <filter id="cxl-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {links.map(({ from, to, order: k }) => (
        <line
          key={`${from.join()}-${to.join()}`}
          className="cxl-link"
          style={order(k)}
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke={paint}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ))}
      {outer.map(([x, y], i) => (
        <circle key={`o${i}`} className="cxl-node" style={order(i)} cx={x} cy={y} r={outerR} fill={paint} />
      ))}
      {inner.map(([x, y], i) => (
        <circle key={`i${i}`} className="cxl-node" style={order(i + 0.25)} cx={x} cy={y} r={innerR} fill={paint} />
      ))}
      <g className="cxl-plus" style={order(outer.length)} filter="url(#cxl-glow)">
        <path
          d={`M${plus.x} ${plus.y - plus.arm}V${plus.y + plus.arm}M${plus.x - plus.arm} ${plus.y}H${plus.x + plus.arm}`}
          stroke={paint}
          strokeWidth={plus.width}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
