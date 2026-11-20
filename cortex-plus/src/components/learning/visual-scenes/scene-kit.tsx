"use client";

import { Fragment, useId, type CSSProperties, type ReactNode } from "react";
import type { SceneFrame, TextBox } from "@/lib/learning/visual-scenes/layout";

/**
 * Sahne bileşenlerinin ortak parçaları (Faz 1-B): SVG kabı, ok uçları, metin ve animasyon sınıfları.
 *
 * Animasyon: çizgiler `pathLength=1` + stroke-dashoffset 1→0 ile çizilerek gelir (`cp-vs-draw`), yazı ve
 * dolgu fade-in ile belirir (`cp-vs-fade`); gecikme `--d` değişkeniyle sıralanır. `animate`:
 * - `auto`: hemen oynar (ders ekranı),
 * - `sync`: oynatıcıyla birlikte durur/oynar (video),
 * - `none`: animasyonsuz, tam çizim (afiş, yazdırma, azaltılmış hareket).
 */

export type SceneAnimate = "auto" | "sync" | "none";

export type SceneCommonProps = {
  frame: SceneFrame;
  animate?: SceneAnimate;
  playing?: boolean;
  className?: string;
};

/** Gecikme stili: `--d` saniye. */
export function delay(seconds: number, duration?: number): CSSProperties {
  return {
    ["--d" as string]: `${seconds.toFixed(2)}s`,
    ...(duration ? { ["--dur" as string]: `${duration.toFixed(2)}s` } : {}),
  } as CSSProperties;
}

export function useSceneIds(prefix: string) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (name: string) => `${prefix}-${raw}-${name}`;
}

export function SceneSvg({
  frame,
  animate = "auto",
  playing = true,
  className,
  label,
  archetype,
  background,
  children,
}: SceneCommonProps & {
  label: string;
  archetype: string;
  background: string;
  children: ReactNode;
}) {
  const running = animate === "auto" || (animate === "sync" && playing);
  return (
    <svg
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      width="100%"
      preserveAspectRatio={frame.chrome === "video" ? "xMidYMax meet" : "xMidYMid meet"}
      role="img"
      aria-label={label}
      data-archetype={archetype}
      data-mode={frame.mode}
      data-safe-bottom={frame.safeBottomMargin}
      className={[
        "cp-vs",
        `cp-vs--${archetype.toLowerCase()}`,
        animate === "none" ? "is-static" : "is-animated",
        running ? "is-playing" : "is-paused",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ fontFamily: "var(--font-ui), var(--font-geist-sans), system-ui, sans-serif" }}
    >
      <title>{label}</title>
      <rect x={0} y={0} width={frame.width} height={frame.height} rx={frame.chrome === "lesson" ? 18 : 0} fill={background} />
      {children}
    </svg>
  );
}

/** Ok ucu tanımları: renge göre ayrı marker (SVG marker rengi miras almaz). */
export function ArrowDefs({ id, colors }: { id: (name: string) => string; colors: Record<string, string> }) {
  return (
    <defs>
      {Object.entries(colors).map(([name, color]) => (
        <marker
          key={name}
          id={id(`arrow-${name}`)}
          viewBox="0 0 10 10"
          refX={8}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      ))}
      <filter id={id("glow")} filterUnits="userSpaceOnUse" x="-100" y="-100" width="2000" height="2000">
        <feGaussianBlur stdDeviation="2.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={id("soft")} filterUnits="userSpaceOnUse" x="-100" y="-100" width="2000" height="2000">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
      </filter>
    </defs>
  );
}

/**
 * `X_y` → alt indis, `X^2` → üst indis. Yalnız tek kelimelik indis (harf/rakam) tanınır; geri kalan
 * metin olduğu gibi kalır.
 */
export function richTokens(line: string): { text: string; shift?: "sub" | "super" }[] {
  const out: { text: string; shift?: "sub" | "super" }[] = [];
  const pattern = /([_^])(\{[^}]{1,12}\}|[\p{L}\p{N}]{1,6})/gu;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at === 0 || /\s/.test(line[at - 1] ?? " ")) continue;
    if (at > last) out.push({ text: line.slice(last, at) });
    out.push({ text: match[2]!.replace(/^\{|\}$/g, ""), shift: match[1] === "_" ? "sub" : "super" });
    last = at + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.length ? out : [{ text: line }];
}

export function RichLine({ line }: { line: string }) {
  return (
    <>
      {richTokens(line).map((token, index) =>
        token.shift ? (
          <tspan key={index} baselineShift={token.shift} fontSize="70%">
            {token.text}
          </tspan>
        ) : (
          <Fragment key={index}>{token.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Yerleşimden gelen metin kutusunu çizer (satırlar tspan). */
export function SceneText({
  box,
  fill,
  className,
  style,
  rich = false,
}: {
  box: TextBox;
  fill: string;
  className?: string;
  style?: CSSProperties;
  rich?: boolean;
}) {
  // Harf aralığı bilerek yok: genişlik tahmini onu hesaba katmaz, gerçek tarayıcıda komşu yazıya taşırırdı.
  const ascent = box.fontSize * 0.92;
  return (
    <text
      x={box.x}
      y={box.y + ascent}
      fontSize={box.fontSize}
      fontWeight={box.weight}
      textAnchor={box.anchor}
      fill={fill}
      className={className}
      style={style}
      data-text-id={box.id}
    >
      {box.lines.map((line, index) => (
        <tspan key={index} x={box.x} dy={index === 0 ? 0 : box.lineHeightPx}>
          {rich ? <RichLine line={line} /> : line}
        </tspan>
      ))}
    </text>
  );
}

/** Arketip rozeti: disiplin + arketip adı (yerleşimde `placeBadge` kutuyu dolgusuyla birlikte ölçer). */
export function SceneBadge({ box, color, textColor }: { box: TextBox; color: string; textColor: string }) {
  return (
    <g className="cp-vs-fade" style={delay(0.05)}>
      <rect
        x={box.rect.x}
        y={box.rect.y}
        width={box.rect.w}
        height={box.rect.h}
        rx={Math.min(box.rect.h / 2, 13)}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={1}
      />
      <SceneText box={box} fill={textColor} />
    </g>
  );
}
