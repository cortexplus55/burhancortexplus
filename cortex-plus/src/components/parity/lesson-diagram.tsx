import {
  diagramViewBox,
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
  ink: "var(--ap-text, #fff)",
  muted: "var(--ap-muted, #a3a3a3)",
  accent: "var(--ap-gold, #f4ae0b)",
  surface: "var(--ap-surface-2, #242424)",
  line: "var(--ap-border, #2e2e2e)",
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

export function LessonDiagramView({
  diagram,
  id,
}: {
  diagram: LessonDiagram;
  id: string;
}) {
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
