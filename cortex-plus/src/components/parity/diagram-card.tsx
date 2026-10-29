import type { ReactNode } from "react";
import type { DiagramKind, LessonBlock } from "@/lib/learning/lesson-v3";

/**
 * Parametrik ders şeması. Model etiket ve sayı yazar; çizim burada kurulur.
 * Modelden gelen metin işaretleme olarak yorumlanmaz.
 *
 * Çizgi, ok, eğri ve nokta SVG'de; ETİKETLER HTML'de (29 Ekim 2026). SVG `<text>` sarmıyor ve
 * görüntüyle birlikte küçülüyordu: 375 px'te komşu etiketler üst üste biniyordu. HTML rozet kendi
 * yazı boyutunda kalır, uzun metni satır sarar ve yakın komşular ayrı katlara (kademe) dizilir.
 */

export type DiagramCardBlock = Extract<LessonBlock, { type: "diagram_card" }>;
type DiagramItem = DiagramCardBlock["items"][number];

/** Çizim alanı (viewBox birimi). Etiket konumları bu alana göre yüzdeyle yerleşir. */
export const STAGE_W = 600;
export const STAGE_H = 220;
const VB = `0 0 ${STAGE_W} ${STAGE_H}`;
const INK = "var(--cp-text, #f5f5f5)";
const MUTED = "var(--cp-muted, #a3a3a3)";
const LINE = "var(--cp-border, #3a3a3a)";
const ACCENT = "var(--cp-gold, #f4ae0b)";
const BLUE = "var(--cp-action, #4353ff)";

/**
 * Bir karakterin çizim birimi cinsinden genişliği, telefon ölçüsünde (375 px'te alan ~343 px,
 * 12 px yazıda harf ~7 px ≈ 12 birim). Kademe hesabı en dar ekrana göre yapılır; masaüstünde
 * etiketler daha dar düşer, çakışma yine olmaz.
 */
export const CHAR_W = 12;
const LABEL_MAX_W = 150;
const TIER_GAP = 10;

export function estimateLabelWidth(text: string): number {
  return Math.min(LABEL_MAX_W, Math.max(24, text.trim().length * CHAR_W));
}

/**
 * Etiketleri katlara dizer: soldan sağa, her etiket çakışmadığı en alçak kata iner. Çıkış her
 * etiketin kat numarası (0 = eksenin dibi). Saf fonksiyon; test bunu doğrular.
 */
export function labelTiers(xs: readonly number[], widths: readonly number[], gap = TIER_GAP): number[] {
  const order = xs.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x);
  const rightEdge: number[] = [];
  const tiers = new Array<number>(xs.length).fill(0);
  for (const { x, index } of order) {
    const half = (widths[index] ?? 24) / 2;
    const left = x - half;
    let tier = 0;
    while (tier < rightEdge.length && rightEdge[tier]! + gap > left) tier += 1;
    rightEdge[tier] = x + half;
    tiers[index] = tier;
  }
  return tiers;
}

type Tone = "ink" | "muted" | "accent";
type Label = { key: string; x: number; y: number; text: string; tone: Tone; size?: "s" | "m" | "l"; maxW?: number };

function numericOf(item: DiagramItem, fallback: number): number {
  if (typeof item.value === "number" && Number.isFinite(item.value)) return item.value;
  if (typeof item.value === "string") {
    const parsed = Number(item.value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  const fromLabel = Number(item.label.replace(",", "."));
  return Number.isFinite(fromLabel) ? fromLabel : fallback;
}

function spread(count: number, start: number, end: number): number[] {
  if (count <= 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[index + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8 z" fill={BLUE} />
      </marker>
    </defs>
  );
}

type Painted = { svg: ReactNode; labels: Label[] };

function numberLine(card: DiagramCardBlock, id: string): Painted {
  const values = card.items.map((item, index) => numericOf(item, index));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xs = values.map((value) => 48 + ((value - min) / span) * 504);
  const above = labelTiers(xs, card.items.map((item) => estimateLabelWidth(item.label)));
  const below = labelTiers(xs, card.items.map((item) => estimateLabelWidth(item.detail ?? "")));
  const labels: Label[] = [];
  card.items.forEach((item, index) => {
    const x = xs[index] ?? 300;
    labels.push({ key: `l-${index}`, x, y: 112 - above[index]! * 22, text: item.label, tone: item.highlight ? "accent" : "ink" });
    if (item.detail) labels.push({ key: `d-${index}`, x, y: 184 + below[index]! * 20, text: item.detail, tone: "muted", size: "s" });
  });
  return {
    labels,
    svg: (
      <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="number_line">
        <ArrowDefs id={id} />
        <line x1="36" y1="148" x2="564" y2="148" stroke={INK} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
        <line x1="564" y1="148" x2="36" y2="148" stroke={INK} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
        {card.items.map((item, index) => {
          const x = xs[index] ?? 300;
          return (
            <g key={`${item.label}-${index}`}>
              <line x1={x} y1="136" x2={x} y2="160" stroke={MUTED} strokeWidth="2" />
              <circle cx={x} cy="148" r={item.highlight ? 8 : 6} fill={item.highlight ? ACCENT : BLUE} />
            </g>
          );
        })}
      </svg>
    ),
  };
}

function balanceScale(card: DiagramCardBlock): Painted {
  const left = card.items[0];
  const right = card.items[1];
  const labels: Label[] = [];
  if (left) labels.push({ key: "left", x: 150, y: 52, text: left.label, tone: left.highlight ? "accent" : "ink", size: "l", maxW: 220 });
  if (right) labels.push({ key: "right", x: 450, y: 52, text: right.label, tone: right.highlight ? "accent" : "ink", size: "l", maxW: 220 });
  labels.push({ key: "caption", x: 300, y: 210, text: card.caption ?? "İki kefe eşitlenir", tone: "muted", size: "s", maxW: 400 });
  return {
    labels,
    svg: (
      <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="balance_scale">
        <polygon points="300,168 274,198 326,198" fill={LINE} stroke={INK} strokeWidth="1.5" />
        <line x1="90" y1="78" x2="510" y2="78" stroke={INK} strokeWidth="3" />
        <line x1="300" y1="78" x2="300" y2="168" stroke={INK} strokeWidth="3" />
        <line x1="150" y1="78" x2="150" y2="108" stroke={MUTED} strokeWidth="2" />
        <path d="M110 108 Q150 148 190 108" fill="none" stroke={BLUE} strokeWidth="2.5" />
        <line x1="110" y1="108" x2="190" y2="108" stroke={BLUE} strokeWidth="2" />
        <line x1="450" y1="78" x2="450" y2="108" stroke={MUTED} strokeWidth="2" />
        <path d="M410 108 Q450 148 490 108" fill="none" stroke={BLUE} strokeWidth="2.5" />
        <line x1="410" y1="108" x2="490" y2="108" stroke={BLUE} strokeWidth="2" />
      </svg>
    ),
  };
}

function functionCurve(card: DiagramCardBlock): Painted {
  const values = card.items.map((item, index) => numericOf(item, index));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xs = spread(card.items.length, 70, 560);
  const points = card.items.map((item, index) => ({
    x: xs[index] ?? 300,
    y: 176 - ((numericOf(item, values[index] ?? index) - min) / span) * 130,
  }));
  const tiers = labelTiers(xs, card.items.map((item) => estimateLabelWidth(item.label)));
  const labels: Label[] = card.items.map((item, index) => ({
    key: `p-${index}`,
    x: points[index]!.x,
    y: Math.max(12, points[index]!.y - 16 - tiers[index]! * 18),
    text: item.label,
    tone: item.highlight ? "accent" : "ink",
    size: "s",
  }));
  return {
    labels,
    svg: (
      <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="function_curve">
        {[0, 1, 2, 3, 4].map((row) => (
          <line key={`h-${row}`} x1="48" y1={36 + row * 36} x2="575" y2={36 + row * 36} stroke={LINE} strokeWidth="1" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((col) => (
          <line key={`v-${col}`} x1={70 + col * 98} y1="28" x2={70 + col * 98} y2="184" stroke={LINE} strokeWidth="1" />
        ))}
        <line x1="48" y1="184" x2="580" y2="184" stroke={INK} strokeWidth="1.5" />
        <line x1="48" y1="184" x2="48" y2="24" stroke={INK} strokeWidth="1.5" />
        <path d={smoothPath(points)} fill="none" stroke={BLUE} strokeWidth="2.5" />
        {card.items.map((item, index) => (
          <circle
            key={`${item.label}-${index}`}
            cx={points[index]!.x}
            cy={points[index]!.y}
            r={item.highlight ? 7 : 5}
            fill={item.highlight ? ACCENT : BLUE}
          />
        ))}
      </svg>
    ),
  };
}

function timeline(card: DiagramCardBlock, id: string): Painted {
  const xs = spread(card.items.length, 70, 530);
  const tops = card.items.map((item) => (item.value != null ? String(item.value) : item.label));
  const bottoms = card.items.map((item) => item.detail ?? item.label);
  const topTiers = labelTiers(xs, tops.map(estimateLabelWidth));
  const bottomTiers = labelTiers(xs, bottoms.map(estimateLabelWidth));
  const labels: Label[] = [];
  card.items.forEach((item, index) => {
    const x = xs[index] ?? 300;
    labels.push({ key: `t-${index}`, x, y: 76 - topTiers[index]! * 20, text: tops[index]!, tone: item.highlight ? "accent" : "ink" });
    labels.push({ key: `b-${index}`, x, y: 144 + bottomTiers[index]! * 20, text: bottoms[index]!, tone: "muted", size: "s" });
  });
  return {
    labels,
    svg: (
      <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="timeline">
        <ArrowDefs id={id} />
        <line x1="40" y1="108" x2="570" y2="108" stroke={INK} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
        {card.items.map((item, index) => {
          const x = xs[index] ?? 300;
          const next = xs[index + 1];
          return (
            <g key={`${item.label}-${index}`}>
              {next != null ? (
                <line x1={x + 14} y1="108" x2={next - 16} y2="108" stroke={BLUE} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
              ) : null}
              <circle cx={x} cy="108" r={item.highlight ? 9 : 7} fill={item.highlight ? ACCENT : BLUE} />
            </g>
          );
        })}
      </svg>
    ),
  };
}

function processNetwork(card: DiagramCardBlock, id: string): Painted {
  const count = card.items.length;
  const cols = Math.min(4, Math.max(1, count));
  const boxW = 112;
  const boxH = 56;
  const gap = cols > 1 ? (560 - cols * boxW) / (cols - 1) : 0;
  const labels: Label[] = [];
  const boxes = card.items.map((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 24 + col * (boxW + gap);
    const y = 36 + row * 96;
    labels.push({ key: `n-${index}`, x: x + boxW / 2, y: y + boxH / 2, text: item.label, tone: item.highlight ? "accent" : "ink", size: "s", maxW: boxW - 10 });
    const next = card.items[index + 1];
    const nextCol = (index + 1) % cols;
    const nextX = 24 + nextCol * (boxW + gap);
    const edge = next && nextCol !== 0;
    if (edge && item.detail) {
      labels.push({ key: `e-${index}`, x: (x + boxW + nextX) / 2, y: y + 8, text: item.detail, tone: "muted", size: "s", maxW: Math.max(40, gap - 6) });
    }
    return { item, x, y, nextX, edge };
  });
  return {
    labels,
    svg: (
      <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="process_network">
        <ArrowDefs id={id} />
        {boxes.map(({ item, x, y, nextX, edge }, index) => (
          <g key={`${item.label}-${index}`}>
            <rect
              x={x}
              y={y}
              width={boxW}
              height={boxH}
              rx="8"
              fill={item.highlight ? "rgba(244,174,11,0.18)" : "rgba(67,83,255,0.16)"}
              stroke={item.highlight ? ACCENT : BLUE}
              strokeWidth="1.5"
            />
            {edge ? (
              <line x1={x + boxW} y1={y + boxH / 2} x2={nextX - 2} y2={y + boxH / 2} stroke={BLUE} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
            ) : null}
          </g>
        ))}
      </svg>
    ),
  };
}

const PAINT: Record<DiagramKind, (card: DiagramCardBlock, id: string) => Painted> = {
  number_line: numberLine,
  balance_scale: (card) => balanceScale(card),
  function_curve: (card) => functionCurve(card),
  timeline,
  process_network: processNetwork,
};

/** Etiketin alan içindeki yüzde konumu; test bunu okur. */
export function labelStyle(label: Pick<Label, "x" | "y" | "maxW">): { left: string; top: string; maxWidth: string } {
  return {
    left: `${((label.x / STAGE_W) * 100).toFixed(2)}%`,
    top: `${((label.y / STAGE_H) * 100).toFixed(2)}%`,
    maxWidth: `${(((label.maxW ?? LABEL_MAX_W) / STAGE_W) * 100).toFixed(2)}%`,
  };
}

export function DiagramCard({ card, id = "diagram" }: { card: DiagramCardBlock; id?: string }) {
  const painted = PAINT[card.diagramKind](card, id);
  return (
    <figure className="als-diagram-card">
      <figcaption>
        <strong>{card.title}</strong>
        {card.caption && card.diagramKind !== "balance_scale" ? <span>{card.caption}</span> : null}
      </figcaption>
      <div className="als-diagram-stage" data-diagram-stage={card.diagramKind}>
        {painted.svg}
        <div className="als-diagram-labels" aria-hidden>
          {painted.labels.map((label) => (
            <span
              key={label.key}
              className={`als-diagram-label is-${label.tone} is-${label.size ?? "m"}`}
              style={labelStyle(label)}
            >
              {label.text}
            </span>
          ))}
        </div>
      </div>
      {/* Erişilebilirlik: etiketler görsel katmanda; metin burada bir kez okunur. */}
      <p className="sr-only">{painted.labels.map((label) => label.text).join(" · ")}</p>
    </figure>
  );
}
