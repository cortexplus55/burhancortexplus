import { CORTEX_GOLD, NETWORK_MARK, SMALL_MARK } from "@/components/brand/cortex-geometry";

/**
 * Cortex Plus marka işareti — tek kaynak (19 Ekim 2026: sinir ağı).
 *
 * 40 pikselin altında küçük çizim (altı düğüm + artı; menü, sekme, sohbet), üstünde ağın sabit hali.
 * Hareketli hali `cortex-logo-motion.tsx`te; burada hareket yok — küçük yerde dikkat dağıtır.
 *
 * Gradyan kimliği sabit. Sayaç ya da `useId` denenmedi çünkü ikisi de yanlış olurdu: sayaç
 * sunucuyla tarayıcıda farklı değer üretip hidrasyonu bozar, `useId` ise bileşeni istemciye taşır.
 * Aynı sayfada birden çok işaret olsa da tanımlar birebir aynı olduğundan görüntü değişmez.
 */
export function CortexMark({
  size = 20,
  className,
}: {
  /** Piksel. Uygulama çubuğu 20, pazarlama menüsü 24, sohbet 14. */
  size?: number;
  className?: string;
}) {
  const detailed = size >= 40;
  return (
    <svg
      width={size}
      height={size}
      viewBox={detailed ? NETWORK_MARK.viewBox : SMALL_MARK.viewBox}
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={detailed ? "cortex-mark-net" : "cortex-mark-small"}
          gradientUnits="userSpaceOnUse"
          x1={detailed ? 10 : 6}
          y1={detailed ? 14 : 8}
          x2={detailed ? 110 : 44}
          y2={detailed ? 106 : 40}
        >
          <stop offset="0" stopColor={CORTEX_GOLD.light} />
          <stop offset="0.5" stopColor={CORTEX_GOLD.mid} />
          <stop offset="1" stopColor={CORTEX_GOLD.deep} />
        </linearGradient>
      </defs>
      {detailed ? <NetworkStatic /> : <SmallStatic />}
    </svg>
  );
}

function SmallStatic() {
  const { nodes, nodeR, chainWidth, plus } = SMALL_MARK;
  const paint = "url(#cortex-mark-small)";
  return (
    <>
      <polyline
        points={nodes.map((point) => point.join(",")).join(" ")}
        stroke={paint}
        strokeWidth={chainWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {nodes.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={nodeR} fill={paint} />
      ))}
      <path
        d={`M${plus.x} ${plus.y - plus.arm}V${plus.y + plus.arm}M${plus.x - plus.arm} ${plus.y}H${plus.x + plus.arm}`}
        stroke={paint}
        strokeWidth={plus.width}
        strokeLinecap="round"
      />
    </>
  );
}

function NetworkStatic() {
  const { outer, inner, links, outerR, innerR, plus } = NETWORK_MARK;
  const paint = "url(#cortex-mark-net)";
  return (
    <>
      {links.map(({ from, to }) => (
        <line
          key={`${from.join()}-${to.join()}`}
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke={paint}
          strokeWidth={1.6}
          strokeOpacity={0.5}
          strokeLinecap="round"
        />
      ))}
      {outer.map(([x, y]) => (
        <circle key={`o${x}-${y}`} cx={x} cy={y} r={outerR} fill={paint} />
      ))}
      {inner.map(([x, y]) => (
        <circle key={`i${x}-${y}`} cx={x} cy={y} r={innerR} fill={paint} />
      ))}
      <path
        d={`M${plus.x} ${plus.y - plus.arm}V${plus.y + plus.arm}M${plus.x - plus.arm} ${plus.y}H${plus.x + plus.arm}`}
        stroke={paint}
        strokeWidth={plus.width}
        strokeLinecap="round"
      />
    </>
  );
}
