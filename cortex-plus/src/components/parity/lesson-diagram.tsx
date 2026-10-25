import {
  diagramViewBox,
  isStructuredDiagram,
  layoutStructuredDiagram,
  type DiagramShape,
  type DiagramTone,
  type LessonDiagram,
  placeLabel,
} from "@/lib/learning/lesson-diagram";

/**
 * Ders şemasını çizer.
 *
 * Model çizimin tarifini veriyor — sayılar ve etiketler — SVG'yi burası
 * kuruyor. Modelden gelen hiçbir metin işaretleme olarak yorumlanmıyor;
 * yalnızca sayılar ve <text> içeriği geçiyor.
 *
 * Renkler tema jetonlarından okunuyor, çizimin kendisinden değil: şema
 * açık ve koyu temada aynı şekilde okunur kalıyor.
 */

const TONE_VAR: Record<DiagramTone, string> = {
  ink: "var(--cp-text, #fff)",
  muted: "var(--cp-muted, #a3a3a3)",
  accent: "var(--cp-gold, #f4ae0b)",
  surface: "var(--cp-surface-2, #242424)",
  line: "var(--cp-border, #2e2e2e)",
};

function color(tone: DiagramTone | undefined, fallback: DiagramTone): string {
  return TONE_VAR[tone ?? fallback];
}

function Shape({ shape, id }: { shape: DiagramShape; id: string }) {
  switch (shape.kind) {
    case "rect":
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={4}
          fill={color(shape.fill, "surface")}
          stroke={color(shape.stroke, "line")}
          strokeWidth={1}
        />
      );
    case "circle":
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.fill ? TONE_VAR[shape.fill] : "none"}
          stroke={color(shape.stroke, "line")}
          strokeWidth={1.5}
        />
      );
    case "line":
      return (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={color(shape.stroke, "muted")}
          strokeWidth={1.5}
          strokeDasharray={shape.dashed ? "4 3" : undefined}
          markerEnd={shape.arrow ? `url(#${id}-arrow)` : undefined}
        />
      );
    case "text": {
      // Yerleştirmeyi biz yapıyoruz: modelin verdiği x kutudan taşabiliyor
      // ve yazı ekranda ortadan kesiliyor.
      const placed = placeLabel(shape);
      return (
        <text
          x={placed.x}
          y={placed.y}
          fill={color(shape.tone, "ink")}
          textAnchor={placed.anchor}
          fontSize={shape.size === "sm" ? 9 : 11}
          dominantBaseline="middle"
          textLength={placed.fitWidth}
          lengthAdjust={placed.fitWidth ? "spacingAndGlyphs" : undefined}
        >
          {shape.text}
        </text>
      );
    }
  }
}

const CELL_FILL = ["rgba(67,83,243,0.28)", "rgba(244,174,11,0.22)", "rgba(34,197,94,0.2)"];

function StructuredDiagram({ diagram, id }: { diagram: LessonDiagram; id: string }) {
  if (!isStructuredDiagram(diagram)) return null;
  const layout = layoutStructuredDiagram(diagram);
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={diagram.caption}>
      <defs>
        <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill={TONE_VAR.muted} />
        </marker>
      </defs>
      {layout.cells?.map((cell, index) => (
        <g key={`cell-${index}`}>
          <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx={4} fill={CELL_FILL[cell.tone] ?? CELL_FILL[0]} />
          <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2} fill={TONE_VAR.ink} fontSize={10} textAnchor="middle" dominantBaseline="middle">
            {cell.label}
          </text>
        </g>
      ))}
      {layout.edges.map((edge, index) => (
        <line
          key={`edge-${index}`}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          stroke={TONE_VAR.muted}
          strokeWidth={1.5}
          markerEnd={`url(#${id}-arrow)`}
        />
      ))}
      {layout.headers?.map((header) => (
        <text key={header.label + header.x} x={header.x} y={header.y} fill={TONE_VAR.muted} fontSize={10} textAnchor={header.x < 40 ? "start" : "middle"}>
          {header.label}
        </text>
      ))}
      {layout.nodes.map((node) => {
        const filled = node.filled === true;
        const fill = filled ? TONE_VAR.ink : TONE_VAR.surface;
        const ink = filled ? TONE_VAR.surface : TONE_VAR.ink;
        if (node.shape === "circle") {
          return (
            <g key={node.id ?? node.label}>
              <ellipse cx={node.x} cy={node.y} rx={18} ry={14} fill={fill} stroke={TONE_VAR.line} />
              <text x={node.x} y={node.y + 4} fill={ink} fontSize={10} textAnchor="middle">
                {node.label}
              </text>
            </g>
          );
        }
        if (node.shape === "square") {
          return (
            <g key={node.id ?? node.label}>
              <rect x={node.x - 16} y={node.y - 16} width={32} height={32} rx={2} fill={fill} stroke={TONE_VAR.line} />
              <text x={node.x} y={node.y + 4} fill={ink} fontSize={10} textAnchor="middle">
                {node.label}
              </text>
            </g>
          );
        }
        return (
          <g key={node.id ?? node.label}>
            <rect x={node.x - 42} y={node.y - 14} width={84} height={28} rx={8} fill={TONE_VAR.surface} stroke={TONE_VAR.line} />
            <text x={node.x} y={node.y + 4} fill={TONE_VAR.ink} fontSize={10} textAnchor="middle">
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LessonDiagramView({
  diagram,
  id,
}: {
  diagram: LessonDiagram;
  id: string;
}) {
  if (isStructuredDiagram(diagram)) {
    return (
      <figure className="als-diagram">
        <StructuredDiagram diagram={diagram} id={id} />
        <figcaption>{diagram.caption}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="als-diagram">
      <svg
        // Çerçeve çizilene daralıyor: model çoğu zaman alanın üst şeridine
        // çiziyor ve kalan boşluk ekranda kocaman bir delik bırakıyordu.
        viewBox={diagramViewBox(diagram.shapes)}
        role="img"
        aria-label={diagram.caption}
      >
        <defs>
          <marker
            id={`${id}-arrow`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L8 4 L0 8 z" fill={TONE_VAR.muted} />
          </marker>
        </defs>
        {diagram.shapes.map((shape, i) => (
          <Shape key={i} shape={shape} id={id} />
        ))}
      </svg>
      {/* Başlık görünür de duruyor: şekli okuyamayan öğrenci ne
          anlatıldığını yazıdan alsın. */}
      <figcaption>{diagram.caption}</figcaption>
    </figure>
  );
}
