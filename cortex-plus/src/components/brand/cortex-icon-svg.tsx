import { NETWORK_MARK, SMALL_MARK } from "@/components/brand/cortex-geometry";

/**
 * Simge ve paylaşım görseli için işaret (`next/og`). Gradyan yok, düz altın: satori'nin SVG desteği
 * sınırlı ve 32 pikselde gradyan zaten görünmüyor. Geometri `cortex-geometry.ts`ten — uygulamadaki
 * `CortexMark` ile aynı noktalar.
 */
const GOLD = "#FDB300";

export function CortexIconSvg({ size, detailed }: { size: number; detailed: boolean }) {
  if (!detailed) {
    const { nodes, nodeR, chainWidth, plus } = SMALL_MARK;
    return (
      <svg width={size} height={size} viewBox={SMALL_MARK.viewBox} fill="none">
        <polyline
          points={nodes.map((point) => point.join(",")).join(" ")}
          stroke={GOLD}
          strokeWidth={chainWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {nodes.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={nodeR} fill={GOLD} />
        ))}
        <path
          d={`M${plus.x} ${plus.y - plus.arm}V${plus.y + plus.arm}M${plus.x - plus.arm} ${plus.y}H${plus.x + plus.arm}`}
          stroke={GOLD}
          strokeWidth={plus.width}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const { outer, inner, links, outerR, innerR, plus } = NETWORK_MARK;
  return (
    <svg width={size} height={size} viewBox={NETWORK_MARK.viewBox} fill="none">
      {links.map(({ from, to }) => (
        <line
          key={`${from.join()}-${to.join()}`}
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke={GOLD}
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {outer.map(([x, y]) => (
        <circle key={`o${x}-${y}`} cx={x} cy={y} r={outerR + 0.6} fill={GOLD} />
      ))}
      {inner.map(([x, y]) => (
        <circle key={`i${x}-${y}`} cx={x} cy={y} r={innerR + 0.4} fill="#E9A20A" />
      ))}
      <path
        d={`M${plus.x} ${plus.y - plus.arm}V${plus.y + plus.arm}M${plus.x - plus.arm} ${plus.y}H${plus.x + plus.arm}`}
        stroke="#FFD45C"
        strokeWidth={plus.width + 0.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
