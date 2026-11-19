"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  layoutHeader,
  placeText,
  segment,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import type { BlueprintData } from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * ARCHITECTURE_SPATIAL_BLUEPRINT (Mimarlık, İç Mimarlık, İnşaat, Sanat Tarihi): gece mavisi ya da temiz
 * teknik pafta ızgarası üstünde ince kesit / cephe çizgileri, mimari akslar (A-B-C balonları), ölçü oku
 * (↔), ışık ya da yük taşıma yön okları. Yapı elemanlarının üstünde yuvarlak numaralı callout pinleri
 * (1-4) ve yanında mimari işlev listesi.
 */

export const BLUEPRINT_THEMES = {
  night: { bg: "#0a1f44", grid: "#14306a", gridMajor: "#1b3d82", line: "#dbe8ff", soft: "#8fb0e8", pin: "#ffd166", pinText: "#0a1f44", text: "#f1f6ff", muted: "#a9c1ea", light: "#ffd166", load: "#ff8fa3", panel: "#0e2754" },
  paper: { bg: "#f5f8fc", grid: "#e1e9f5", gridMajor: "#cdd9ec", line: "#1d3b8b", soft: "#5a77bd", pin: "#e8590c", pinText: "#ffffff", text: "#0f1f44", muted: "#3d4f78", light: "#d97706", load: "#c2255c", panel: "#eaf0f9" },
} as const;

const PIN_R = 10;

export type BlueprintLayout = SceneLayout & {
  drawing: Rect;
  building: { left: number; right: number; ground: number; roof: number; floors: number[]; axes: number[]; facadeX: number };
  opening: Rect;
  dimension: { y: number; label: TextBox | null };
  pins: { n: number; x: number; y: number }[];
  legend: { n: number; pinX: number; pinY: number; label: TextBox; role: TextBox }[];
};

export function layoutBlueprint(data: BlueprintData, frame: SceneFrame, domain?: AcademicDomain): BlueprintLayout {
  const { content } = frame;
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Mimarlık"} · ${ARCHETYPE_LABEL.ARCHITECTURE_SPATIAL_BLUEPRINT}`;
  const header = layoutHeader(frame, data.title, badge);
  const texts: TextBox[] = [...header.texts];
  const segments: SceneLayout["segments"] = [];
  const markers: SceneLayout["markers"] = [];
  const top = header.bottom + 12;
  const bottom = content.y + content.h;

  // Lejant ölçümü (önce yüksekliği bilinsin).
  const legendW = frame.portrait ? content.w : Math.round(content.w * 0.4);
  const legendX = frame.portrait ? content.x : content.x + content.w - legendW;
  const textX = legendX + PIN_R * 2 + 10;
  const textW = legendW - PIN_R * 2 - 10;
  const measureLegend = (roleLines: number) => {
    let y = 0;
    const rows = data.elements.map((element, index) => {
      const label = placeText(`legend${index}-label`, element.label, textX, y, { maxWidth: textW, maxLines: 1, fontSize: 12.5, minFontSize: 10, weight: 700, single: true });
      const role = placeText(`legend${index}-role`, element.role, textX, y + label.rect.h + 1, { maxWidth: textW, maxLines: roleLines, fontSize: 10.5, minFontSize: 9 });
      const h = Math.max(PIN_R * 2 + 2, label.rect.h + role.rect.h + 1);
      const row = { y, h };
      y += h + 8;
      return row;
    });
    return { height: y - 8, rows };
  };
  const available = frame.portrait ? (bottom - top) * 0.42 : bottom - top;
  let roleLines = 3;
  let measured = measureLegend(roleLines);
  while (measured.height > available && roleLines > 1) {
    roleLines -= 1;
    measured = measureLegend(roleLines);
  }
  const legendTop = frame.portrait ? bottom - measured.height : top + Math.max(0, (bottom - top - measured.height) / 2);
  const legend = data.elements.map((element, index) => {
    const y = legendTop + measured.rows[index]!.y;
    const label = placeText(`legend${index}-label`, element.label, textX, y, { maxWidth: textW, maxLines: 1, fontSize: 12.5, minFontSize: 10, weight: 700, single: true });
    const role = placeText(`legend${index}-role`, element.role, textX, y + label.rect.h + 1, { maxWidth: textW, maxLines: roleLines, fontSize: 10.5, minFontSize: 9 });
    texts.push(label, role);
    markers.push({ id: `legend-pin${index}`, rect: { x: legendX, y: y, w: PIN_R * 2, h: PIN_R * 2 } });
    return { n: index + 1, pinX: legendX + PIN_R, pinY: y + PIN_R, label, role };
  });

  const drawing: Rect = frame.portrait
    ? { x: content.x, y: top, w: content.w, h: legendTop - 14 - top }
    : { x: content.x, y: top, w: legendX - 16 - content.x, h: bottom - top };

  // Yapı geometrisi
  const dimY = drawing.y + drawing.h - 6;
  const dimLabel = data.dimension
    ? placeText("dimension", data.dimension.label, drawing.x + drawing.w / 2, 0, { maxWidth: drawing.w * 0.5, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "middle", single: true })
    : null;
  const dimLabelH = dimLabel ? dimLabel.rect.h : 0;
  const ground = dimY - dimLabelH - 10;
  const dimension = {
    y: dimY,
    label: dimLabel ? { ...dimLabel, y: dimY - 4 - dimLabelH, rect: { ...dimLabel.rect, y: dimY - 4 - dimLabelH } } : null,
  };
  if (dimension.label) texts.push(dimension.label);
  const left = drawing.x + 24;
  const right = drawing.x + drawing.w - 30;
  const roof = drawing.y + 34;
  const floors = [roof, roof + (ground - roof) * 0.5];
  const axes = [left + (right - left) * 0.12, left + (right - left) * 0.5, left + (right - left) * 0.88];
  const facadeX = right;
  const floorH = (ground - roof) / 2;
  const opening: Rect =
    data.view === "section"
      ? { x: left - 4, y: floors[1]! + floorH * 0.22, w: 8, h: floorH * 0.5 }
      : { x: axes[0]! + (axes[1]! - axes[0]!) * 0.25, y: floors[1]! + floorH * 0.22, w: (axes[1]! - axes[0]!) * 0.5, h: floorH * 0.5 };

  // Ölçü çizgisi ve uzatma çizgileri yazının engelidir.
  segments.push(segment("dim-line", left, dimY, right, dimY));
  segments.push(segment("dim-ext-left", left, ground + 3, left, dimY + 4));
  segments.push(segment("dim-ext-right", right, ground + 3, right, dimY + 4));
  segments.push(segment("ground", drawing.x + 4, ground, drawing.x + drawing.w - 4, ground));

  // Pin yerleri: taşıyıcı aks, cephe katmanı, açıklık, kesit (döşeme).
  const anchors = [
    { x: axes[1]!, y: floors[1]! + floorH * 0.55 },
    { x: facadeX, y: roof + floorH * 0.5 },
    { x: opening.x + opening.w / 2, y: opening.y + opening.h / 2 },
    { x: (axes[1]! + axes[2]!) / 2, y: floors[1]! },
  ];
  const pins = data.elements.map((_, index) => ({ n: index + 1, ...anchors[index]! }));
  pins.forEach((pin) => markers.push({ id: `pin${pin.n}`, rect: { x: pin.x - PIN_R, y: pin.y - PIN_R, w: PIN_R * 2, h: PIN_R * 2 } }));

  return {
    frame,
    texts,
    segments,
    markers,
    drawing,
    building: { left, right, ground, roof, floors, axes, facadeX },
    opening,
    dimension,
    pins,
    legend,
  };
}

export function ArchitecturalBlueprintScene({ data, domain, ...common }: SceneCommonProps & { data: BlueprintData; domain?: AcademicDomain }) {
  const layout = layoutBlueprint(data, common.frame, domain);
  const theme = BLUEPRINT_THEMES[data.theme];
  const id = useSceneIds("arch");
  const [badge, title] = layout.texts;
  const { drawing, building: b, opening } = layout;
  const minor = 12;
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let i = 0, x = drawing.x; x <= drawing.x + drawing.w; x += minor, i += 1) gridLines.push({ x1: x, y1: drawing.y, x2: x, y2: drawing.y + drawing.h, major: i % 5 === 0 });
  for (let i = 0, y = drawing.y; y <= drawing.y + drawing.h; y += minor, i += 1) gridLines.push({ x1: drawing.x, y1: y, x2: drawing.x + drawing.w, y2: y, major: i % 5 === 0 });
  const slab = 5;
  const showLoad = data.flow === "load" || data.flow === "both";
  const showLight = data.flow === "light" || data.flow === "both";
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${data.elements.map((element, index) => `${index + 1}. ${element.label}`).join(", ")}`}
      archetype="ARCHITECTURE_SPATIAL_BLUEPRINT"
      background={theme.bg}
    >
      <ArrowDefs id={id} colors={{ line: theme.line, light: theme.light, load: theme.load }} />
      <SceneBadge box={badge!} color={theme.pin} textColor={theme.pin} />
      <SceneText box={title!} fill={theme.text} className="cp-vs-fade" style={delay(0.1)} />

      {/* Teknik pafta ızgarası */}
      <g className="cp-vs-fade" style={delay(0.12)}>
        {gridLines.map((line, index) => (
          <line key={index} {...line} stroke={line.major ? theme.gridMajor : theme.grid} strokeWidth={line.major ? 1 : 0.6} />
        ))}
        <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} fill="none" stroke={theme.gridMajor} strokeWidth={1.2} />
      </g>

      {/* Mimari akslar ve balonlar */}
      {b.axes.map((x, index) => (
        <g key={`axis${index}`}>
          <line x1={x} y1={drawing.y + 22} x2={x} y2={b.ground} stroke={theme.soft} strokeWidth={0.8} strokeDasharray="6 3 1.5 3" className="cp-vs-fade" style={delay(0.2 + index * 0.08)} />
          <circle cx={x} cy={drawing.y + 12} r={8} fill={theme.bg} stroke={theme.soft} strokeWidth={1.2} className="cp-vs-fade" style={delay(0.25 + index * 0.08)} />
          <text x={x} y={drawing.y + 15.5} fontSize={9.5} fontWeight={700} textAnchor="middle" fill={theme.soft} className="cp-vs-fade" style={delay(0.25 + index * 0.08)}>
            {String.fromCharCode(65 + index)}
          </text>
        </g>
      ))}

      {/* Zemin, temel */}
      <line x1={drawing.x + 4} y1={b.ground} x2={drawing.x + drawing.w - 4} y2={b.ground} stroke={theme.line} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(0.3, 0.6)} />
      {b.axes.map((x, index) => (
        <rect key={`footing${index}`} x={x - 10} y={b.ground} width={20} height={6} fill="none" stroke={theme.line} strokeWidth={1.2} className="cp-vs-fade" style={delay(0.45)} />
      ))}

      {/* Kesit / cephe çizgileri: kolonlar, döşemeler, cephe katmanı */}
      {b.axes.map((x, index) => (
        <line key={`col${index}`} x1={x} y1={b.roof} x2={x} y2={b.ground} stroke={theme.line} strokeWidth={data.view === "section" ? 4 : 2} pathLength={1} className="cp-vs-draw" style={delay(0.5 + index * 0.12, 0.6)} />
      ))}
      {b.floors.map((y, index) => (
        <rect key={`slab${index}`} x={b.left} y={y - slab / 2} width={b.right - b.left} height={slab} fill={data.view === "section" ? theme.line : "none"} fillOpacity={0.25} stroke={theme.line} strokeWidth={1.2} pathLength={1} className="cp-vs-draw" style={delay(0.85 + index * 0.15, 0.6)} />
      ))}
      <path
        d={`M${b.left},${b.ground} L${b.left},${b.roof - 8} L${(b.left + b.right) / 2},${b.roof - 22} L${b.right},${b.roof - 8} L${b.right},${b.ground}`}
        fill="none"
        stroke={theme.line}
        strokeWidth={1.4}
        pathLength={1}
        className="cp-vs-draw"
        style={delay(1.1, 0.8)}
      />
      {/* Cephe katmanı: dış kabuk çift çizgi */}
      <line x1={b.facadeX + 5} y1={b.roof - 6} x2={b.facadeX + 5} y2={b.ground} stroke={theme.soft} strokeWidth={1} strokeDasharray="2 2" className="cp-vs-fade" style={delay(1.3)} />
      {/* Açıklık */}
      <g className="cp-vs-fade" style={delay(1.4)}>
        <rect x={opening.x} y={opening.y} width={opening.w} height={opening.h} fill={theme.bg} stroke={theme.line} strokeWidth={1.2} />
        <line x1={opening.x + opening.w / 2} y1={opening.y} x2={opening.x + opening.w / 2} y2={opening.y + opening.h} stroke={theme.soft} strokeWidth={0.8} />
        {data.view === "elevation" ? (
          <line x1={opening.x} y1={opening.y + opening.h / 2} x2={opening.x + opening.w} y2={opening.y + opening.h / 2} stroke={theme.soft} strokeWidth={0.8} />
        ) : null}
      </g>

      {/* Yük ve ışık yön okları */}
      {showLoad
        ? [0.25, 0.5, 0.75].map((t, index) => {
            const x = b.left + (b.right - b.left) * t;
            return (
              <line key={`load${index}`} x1={x} y1={b.roof - 30} x2={x} y2={b.roof - 12 - (t === 0.5 ? 10 : 4)} stroke={theme.load} strokeWidth={2} markerEnd={`url(#${id("arrow-load")})`} pathLength={1} className="cp-vs-draw" style={delay(1.6 + index * 0.1, 0.4)} />
            );
          })
        : null}
      {showLoad
        ? b.axes.map((x, index) => (
            <line key={`loadcol${index}`} x1={x + 8} y1={b.floors[1]! + 10} x2={x + 8} y2={b.ground - 8} stroke={theme.load} strokeWidth={1.4} strokeOpacity={0.8} markerEnd={`url(#${id("arrow-load")})`} pathLength={1} className="cp-vs-draw" style={delay(1.9 + index * 0.1, 0.5)} />
          ))
        : null}
      {showLight
        ? [0, 1, 2].map((index) => (
            <line
              key={`light${index}`}
              x1={drawing.x + 8 + index * 10}
              y1={drawing.y + 26 + index * 4}
              x2={opening.x + opening.w / 2 - 4 + index * 3}
              y2={opening.y + 4 + index * (opening.h / 3)}
              stroke={theme.light}
              strokeWidth={1.4}
              strokeDasharray="5 3"
              markerEnd={`url(#${id("arrow-light")})`}
              className="cp-vs-fade"
              style={delay(1.6 + index * 0.12)}
            />
          ))
        : null}

      {/* Ölçü oku (↔) */}
      <g className="cp-vs-fade" style={delay(1.5)}>
        <line x1={b.left} y1={b.ground + 3} x2={b.left} y2={layout.dimension.y + 4} stroke={theme.soft} strokeWidth={0.8} />
        <line x1={b.right} y1={b.ground + 3} x2={b.right} y2={layout.dimension.y + 4} stroke={theme.soft} strokeWidth={0.8} />
        <line x1={b.left + 2} y1={layout.dimension.y} x2={b.right - 2} y2={layout.dimension.y} stroke={theme.line} strokeWidth={1.2} markerStart={`url(#${id("arrow-line")})`} markerEnd={`url(#${id("arrow-line")})`} />
        {layout.dimension.label ? <SceneText box={layout.dimension.label} fill={theme.text} /> : null}
      </g>

      {/* Numaralı callout pinleri */}
      {layout.pins.map((pin, index) => (
        <g key={`pin${pin.n}`} className="cp-vs-fade" style={delay(2.1 + index * 0.25)} data-pin={pin.n}>
          <circle cx={pin.x} cy={pin.y} r={PIN_R + 4} fill={theme.pin} fillOpacity={0.25} />
          <circle cx={pin.x} cy={pin.y} r={PIN_R} fill={theme.pin} stroke={theme.bg} strokeWidth={1.5} />
          <text x={pin.x} y={pin.y + 4} fontSize={11} fontWeight={800} textAnchor="middle" fill={theme.pinText}>
            {pin.n}
          </text>
        </g>
      ))}

      {/* İşlev listesi */}
      {layout.legend.map((row, index) => (
        <g key={`legend${row.n}`} className="cp-vs-fade" style={delay(2.2 + index * 0.25)}>
          <circle cx={row.pinX} cy={row.pinY} r={PIN_R} fill={theme.pin} />
          <text x={row.pinX} y={row.pinY + 4} fontSize={11} fontWeight={800} textAnchor="middle" fill={theme.pinText}>
            {row.n}
          </text>
          <SceneText box={row.label} fill={theme.text} />
          <SceneText box={row.role} fill={theme.muted} />
        </g>
      ))}
    </SceneSvg>
  );
}
