import type { ReactNode } from "react";
import type { DiagramKind, LessonBlock } from "@/lib/learning/lesson-v3";

/**
 * Parametrik ders şeması. Model etiket ve sayı yazar; SVG burada kurulur.
 * Modelden gelen metin işaretleme olarak yorumlanmaz.
 */

export type DiagramCardBlock = Extract<LessonBlock, { type: "diagram_card" }>;
type DiagramItem = DiagramCardBlock["items"][number];

const VB = "0 0 600 220";
const INK = "var(--cp-text, #f5f5f5)";
const MUTED = "var(--cp-muted, #a3a3a3)";
const LINE = "var(--cp-border, #3a3a3a)";
const ACCENT = "var(--cp-gold, #f4ae0b)";
const BLUE = "var(--cp-action, #4353ff)";

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

function NumberLine({ card, id }: { card: DiagramCardBlock; id: string }) {
  const values = card.items.map((item, index) => numericOf(item, index));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xs = values.map((value) => 48 + ((value - min) / span) * 504);
  return (
    <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="number_line">
      <ArrowDefs id={id} />
      <line x1="36" y1="148" x2="564" y2="148" stroke={INK} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
      <line x1="564" y1="148" x2="36" y2="148" stroke={INK} strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
      {card.items.map((item, index) => {
        const x = xs[index] ?? 300;
        const fill = item.highlight ? ACCENT : BLUE;
        return (
          <g key={`${item.label}-${index}`}>
            <line x1={x} y1="136" x2={x} y2="160" stroke={MUTED} strokeWidth="2" />
            <circle cx={x} cy="148" r={item.highlight ? 8 : 6} fill={fill} />
            <text x={x} y="112" fill={INK} fontSize="13" textAnchor="middle">
              {item.label}
            </text>
            {item.detail ? (
              <text x={x} y="186" fill={MUTED} fontSize="11" textAnchor="middle">
                {item.detail}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function BalanceScale({ card }: { card: DiagramCardBlock }) {
  const left = card.items[0];
  const right = card.items[1];
  return (
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
      {left ? (
        <text x="150" y="64" fill={left.highlight ? ACCENT : INK} fontSize="14" textAnchor="middle">
          {left.label}
        </text>
      ) : null}
      {right ? (
        <text x="450" y="64" fill={right.highlight ? ACCENT : INK} fontSize="14" textAnchor="middle">
          {right.label}
        </text>
      ) : null}
      <text x="300" y="214" fill={MUTED} fontSize="11" textAnchor="middle">
        {card.caption ?? "İki kefe eşitlenir"}
      </text>
    </svg>
  );
}

function FunctionCurve({ card }: { card: DiagramCardBlock }) {
  const values = card.items.map((item, index) => numericOf(item, index));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xs = spread(card.items.length, 70, 560);
  const points = card.items.map((item, index) => ({
    x: xs[index] ?? 300,
    y: 176 - ((numericOf(item, values[index] ?? index) - min) / span) * 130,
  }));
  return (
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
      {card.items.map((item, index) => {
        const point = points[index]!;
        return (
          <g key={`${item.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r={item.highlight ? 7 : 5} fill={item.highlight ? ACCENT : BLUE} />
            <text x={point.x} y={point.y - 12} fill={INK} fontSize="12" textAnchor="middle">
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Timeline({ card, id }: { card: DiagramCardBlock; id: string }) {
  const xs = spread(card.items.length, 70, 530);
  return (
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
            <text x={x} y="78" fill={INK} fontSize="12" textAnchor="middle">
              {item.value != null ? String(item.value) : item.label}
            </text>
            <text x={x} y="146" fill={MUTED} fontSize="11" textAnchor="middle">
              {item.detail ?? item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ProcessNetwork({ card, id }: { card: DiagramCardBlock; id: string }) {
  const count = card.items.length;
  const cols = Math.min(4, count);
  const boxW = 112;
  const gap = (560 - cols * boxW) / Math.max(1, cols - 1);
  return (
    <svg viewBox={VB} role="img" aria-label={card.title} data-diagram="process_network">
      <ArrowDefs id={id} />
      {card.items.map((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = 24 + col * (boxW + (cols > 1 ? gap : 0));
        const y = 36 + row * 96;
        const next = card.items[index + 1];
        const nextCol = (index + 1) % cols;
        const nextX = 24 + nextCol * (boxW + (cols > 1 ? gap : 0));
        return (
          <g key={`${item.label}-${index}`}>
            <rect
              x={x}
              y={y}
              width={boxW}
              height="52"
              rx="8"
              fill={item.highlight ? "rgba(244,174,11,0.18)" : "rgba(67,83,255,0.16)"}
              stroke={item.highlight ? ACCENT : BLUE}
              strokeWidth="1.5"
            />
            <text x={x + boxW / 2} y={y + 32} fill={INK} fontSize="12" textAnchor="middle">
              {item.label}
            </text>
            {next && nextCol !== 0 ? (
              <line
                x1={x + boxW}
                y1={y + 26}
                x2={nextX - 2}
                y2={y + 26}
                stroke={BLUE}
                strokeWidth="2"
                markerEnd={`url(#${id}-arrow)`}
              />
            ) : null}
            {item.detail && next && nextCol !== 0 ? (
              <text x={(x + boxW + nextX) / 2} y={y + 16} fill={MUTED} fontSize="10" textAnchor="middle">
                {item.detail}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

const PAINT: Record<DiagramKind, (card: DiagramCardBlock, id: string) => ReactNode> = {
  number_line: (card, id) => <NumberLine card={card} id={id} />,
  balance_scale: (card) => <BalanceScale card={card} />,
  function_curve: (card) => <FunctionCurve card={card} />,
  timeline: (card, id) => <Timeline card={card} id={id} />,
  process_network: (card, id) => <ProcessNetwork card={card} id={id} />,
};

export function DiagramCard({ card, id = "diagram" }: { card: DiagramCardBlock; id?: string }) {
  return (
    <figure className="als-diagram-card">
      <figcaption>
        <strong>{card.title}</strong>
        {card.caption ? <span>{card.caption}</span> : null}
      </figcaption>
      {PAINT[card.diagramKind](card, id)}
    </figure>
  );
}
