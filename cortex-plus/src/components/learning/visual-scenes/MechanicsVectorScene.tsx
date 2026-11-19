"use client";

import { DOMAIN_LABEL, sceneArchetypeLabel, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import { withTrend } from "@/lib/learning/visual-scenes/direction-semantics";
import { measureText } from "@/lib/learning/visual-scenes/text-fit";
import {
  inflate,
  layoutHeader,
  placeText,
  rectsOverlap,
  segment,
  segmentHitsRect,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import type { MechanicsData, VectorDirection } from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, RichLine, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * ENGINEERING_PHYSICS_MECHANICS (Fizik, Mühendislik, Kimya): ızgaralı koordinat düzlemi üstünde serbest
 * cisim diyagramı, akışkan kabı ya da devre kesiti; büyüklüğüne göre kalınlığı ve uzunluğu değişen renkli
 * kuvvet vektörleri. Altında/yanında "Formülün Mantığı" paneli: değişken arttıkça ok kalınlaşır (ya da
 * incelir); formülde olmayan çeldirici değişken üstü çizili kırmızı rozetle gösterilir.
 */

export const MECHANICS_COLORS = {
  bg: "#0a1120",
  grid: "#16233a",
  axis: "#2b3d5c",
  body: "#1e293b",
  bodyStroke: "#94a3b8",
  fluid: "#0ea5e9",
  wire: "#cbd5e1",
  text: "#f1f5f9",
  muted: "#94a3b8",
  panel: "#111c30",
  panelStroke: "#25385a",
  up: "#22c55e",
  down: "#f97316",
  distractor: "#ef4444",
  vectors: ["#facc15", "#38bdf8", "#f472b6", "#a3e635", "#c084fc", "#fb923c"],
} as const;

const ANGLE: Record<VectorDirection, number> = {
  right: 0,
  up_right: -45,
  up: -90,
  up_left: -135,
  left: 180,
  down_left: 135,
  down: 90,
  down_right: 45,
};

export type VectorLayout = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: string;
  symbol: TextBox;
  label: TextBox;
};

export type LogicRow = {
  kind: "driver" | "distractor";
  y: number;
  h: number;
  chip: Rect;
  symbol: TextBox;
  label: TextBox;
  effect?: "up" | "down";
  tag?: TextBox;
};

export type MechanicsLayout = SceneLayout & {
  plane: Rect;
  body: Rect;
  bodyLabel: TextBox;
  vectors: VectorLayout[];
  panel: Rect;
  panelKicker: TextBox;
  formula: TextBox;
  rows: LogicRow[];
  container?: { left: number; right: number; top: number; bottom: number; surface: number };
  circuit?: Rect;
};

function rayToRect(cx: number, cy: number, hw: number, hh: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

function moveBox(box: TextBox, dx: number, dy: number): TextBox {
  return { ...box, x: box.x + dx, y: box.y + dy, rect: { ...box.rect, x: box.rect.x + dx, y: box.rect.y + dy } };
}

/** Okun etiketi: eğilim varsa "artar/azalır" yazıda da okunur. */
export function vectorCaption(vector: MechanicsData["vectors"][number]): string {
  return withTrend(vector.label, vector.trend);
}

/** Panel satırı: eğilim sahnesinde etkinin yönü kelimeyle de yazılır. */
function driverCaption(data: MechanicsData, driver: MechanicsData["logic"]["drivers"][number]): string {
  return data.setting === "trend" ? withTrend(driver.label, driver.effect === "up" ? "increase" : "decrease") : driver.label;
}

function layoutPanel(data: MechanicsData, rect: Rect, labelLines: number): { kicker: TextBox; formula: TextBox; rows: LogicRow[]; height: number } {
  const pad = 10;
  const x0 = rect.x + pad;
  const w = rect.w - pad * 2;
  const kicker = placeText("logic-kicker", data.setting === "trend" ? "EĞİLİMİN MANTIĞI" : "FORMÜLÜN MANTIĞI", x0, rect.y + pad, { maxWidth: w, maxLines: 1, fontSize: 10, weight: 800, single: true });
  const formula = placeText("logic-formula", data.logic.formula, x0, kicker.rect.y + kicker.rect.h + 4, {
    maxWidth: w,
    maxLines: 3,
    fontSize: 17,
    minFontSize: 11,
    weight: 800,
  });
  let y = formula.rect.y + formula.rect.h + 8;
  const rows: LogicRow[] = [];
  // Simge çipi en geniş simgeye göre (8 karaktere kadar simge kesilmeden sığsın).
  const symbols = [...data.logic.drivers.map((driver) => driver.symbol), ...data.logic.distractors.map((item) => item.symbol)];
  const chipW = Math.max(38, Math.min(76, Math.max(0, ...symbols.map((symbol) => measureText(symbol, 11, 800))) + 12));
  const labelX = x0 + chipW + 30;
  const miniW = 44;
  const labelW = w - chipW - 30 - miniW - 8;
  data.logic.drivers.forEach((driver, index) => {
    const label = placeText(`driver${index}-label`, driverCaption(data, driver), labelX, y + 4, { maxWidth: labelW, maxLines: labelLines, fontSize: 10.5, minFontSize: 8.5 });
    const h = Math.max(26, label.rect.h + 8);
    const symbol = placeText(`driver${index}-symbol`, driver.symbol, x0 + chipW / 2, y + h / 2 - 8, {
      maxWidth: chipW - 6,
      maxLines: 1,
      fontSize: 13,
      minFontSize: 8,
      weight: 800,
      anchor: "middle",
      single: true,
    });
    const centered = moveBox(label, 0, (h - 8 - label.rect.h) / 2);
    rows.push({ kind: "driver", y, h, chip: { x: x0, y: y + h / 2 - 11, w: chipW, h: 22 }, symbol, label: centered, effect: driver.effect });
    y += h + 4;
  });
  data.logic.distractors.forEach((item, index) => {
    const tag = placeText(`distractor${index}-tag`, data.setting === "trend" ? "İLGİSİZ" : "FORMÜLDE YOK", labelX, y + 3, { maxWidth: labelW + miniW, maxLines: 1, fontSize: 8.5, weight: 800, single: true });
    const label = placeText(`distractor${index}-label`, item.label, labelX, tag.rect.y + tag.rect.h + 1, {
      maxWidth: labelW + miniW,
      maxLines: Math.min(2, labelLines),
      fontSize: 10.5,
      minFontSize: 8.5,
    });
    const h = Math.max(26, tag.rect.h + label.rect.h + 7);
    const symbol = placeText(`distractor${index}-symbol`, item.symbol, x0 + chipW / 2, y + h / 2 - 8, {
      maxWidth: chipW - 6,
      maxLines: 1,
      fontSize: 13,
      minFontSize: 8,
      weight: 800,
      anchor: "middle",
      single: true,
    });
    rows.push({ kind: "distractor", y, h, chip: { x: x0, y: y + h / 2 - 11, w: chipW, h: 22 }, symbol, label, tag });
    y += h + 4;
  });
  return { kicker, formula, rows, height: y - rect.y + pad - 4 };
}

export function layoutMechanics(data: MechanicsData, frame: SceneFrame, domain?: AcademicDomain): MechanicsLayout {
  const { content } = frame;
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Fizik · Mühendislik"} · ${sceneArchetypeLabel(data)}`;
  const header = layoutHeader(frame, data.title, badge);
  const texts: TextBox[] = [...header.texts];
  const segments: SceneLayout["segments"] = [];
  const top = header.bottom + 12;
  const bottom = content.y + content.h;

  // Panel: dikeyde altta (yüksekliği içeriğinden), yatayda sağda.
  let panelRect: Rect;
  let panel: ReturnType<typeof layoutPanel>;
  if (frame.portrait) {
    // Satır sayısı içerik kadar (en çok 3): kesmek yerine sarılır; çizim alanı çok daralırsa 2 satır.
    const probe = layoutPanel(data, { x: content.x, y: 0, w: content.w, h: 0 }, 3);
    const lines = bottom - top - probe.height < 170 ? 2 : 3;
    const height = lines === 3 ? probe.height : layoutPanel(data, { x: content.x, y: 0, w: content.w, h: 0 }, 2).height;
    panelRect = { x: content.x, y: bottom - height, w: content.w, h: height };
    panel = layoutPanel(data, panelRect, lines);
  } else {
    const w = Math.round(content.w * 0.42);
    panelRect = { x: content.x + content.w - w, y: top, w, h: bottom - top };
    panel = layoutPanel(data, panelRect, 3);
    if (panel.height > panelRect.h) panel = layoutPanel(data, panelRect, 2);
  }
  texts.push(panel.kicker, panel.formula);
  for (const row of panel.rows) texts.push(row.symbol, row.label, ...(row.tag ? [row.tag] : []));

  const plane: Rect = frame.portrait
    ? { x: content.x, y: top, w: content.w, h: panelRect.y - 12 - top }
    : { x: content.x, y: top, w: panelRect.x - 16 - content.x, h: bottom - top };

  // Cisim
  const bodySize = Math.max(44, Math.min(70, Math.min(plane.w, plane.h) * 0.24));
  const cx = plane.x + plane.w / 2;
  const cy = plane.y + plane.h / 2 + (data.setting === "fluid" ? bodySize * 0.12 : 0);
  const body: Rect = { x: cx - bodySize / 2, y: cy - bodySize / 2, w: bodySize, h: bodySize };
  const bodyLabel = placeText("body-label", data.body.label, cx, 0, {
    maxWidth: bodySize - 8,
    maxLines: 2,
    fontSize: 11,
    minFontSize: 8,
    weight: 700,
    anchor: "middle",
  });
  const bodyLabelBox = moveBox(bodyLabel, 0, cy - bodyLabel.rect.h / 2);
  texts.push(bodyLabelBox);
  for (const [i, [x1, y1, x2, y2]] of [
    [body.x, body.y, body.x + body.w, body.y],
    [body.x + body.w, body.y, body.x + body.w, body.y + body.h],
    [body.x, body.y + body.h, body.x + body.w, body.y + body.h],
    [body.x, body.y, body.x, body.y + body.h],
  ].entries()) {
    segments.push(segment(`body-edge${i}`, x1!, y1!, x2!, y2!));
  }

  const inset = 12;
  const bounds: Rect = { x: plane.x + inset, y: plane.y + inset, w: plane.w - inset * 2, h: plane.h - inset * 2 };
  let container: MechanicsLayout["container"];
  let circuit: Rect | undefined;
  if (data.setting === "fluid") {
    container = {
      left: plane.x + 4,
      right: plane.x + plane.w - 4,
      top: plane.y + plane.h * 0.18,
      bottom: plane.y + plane.h - 4,
      surface: body.y + body.h * 0.22,
    };
    segments.push(segment("wall-left", container.left, container.top, container.left, container.bottom));
    segments.push(segment("wall-right", container.right, container.top, container.right, container.bottom));
    segments.push(segment("wall-bottom", container.left, container.bottom, container.right, container.bottom));
  } else if (data.setting === "circuit") {
    circuit = { x: plane.x + 4, y: plane.y + 4, w: plane.w - 8, h: plane.h - 8 };
    segments.push(segment("wire-top", circuit.x, circuit.y, circuit.x + circuit.w, circuit.y));
    segments.push(segment("wire-right", circuit.x + circuit.w, circuit.y, circuit.x + circuit.w, circuit.y + circuit.h));
    segments.push(segment("wire-bottom", circuit.x, circuit.y + circuit.h, circuit.x + circuit.w, circuit.y + circuit.h));
    segments.push(segment("wire-left", circuit.x, circuit.y, circuit.x, circuit.y + circuit.h));
  }

  // Vektörler
  const maxLen = Math.max(24, Math.min(bounds.w, bounds.h) / 2 - bodySize / 2 - 30);
  const used = new Map<VectorDirection, number>();
  const vectors: VectorLayout[] = [];
  const sides: ({ x: number; y: number } | null)[] = [];
  data.vectors.forEach((vector, index) => {
    const count = used.get(vector.direction) ?? 0;
    used.set(vector.direction, count + 1);
    const angle = ANGLE[vector.direction];
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;
    const lateral = count === 0 ? 0 : (count % 2 ? 1 : -1) * Math.ceil(count / 2) * 16;
    const start = rayToRect(cx, cy, bodySize / 2 + 2, bodySize / 2 + 2, angle);
    const sx = start.x + nx * lateral;
    const sy = start.y + ny * lateral;
    const len = maxLen * (0.38 + 0.124 * vector.magnitude);
    const ex = sx + dx * len;
    const ey = sy + dy * len;
    const width = 1.6 + vector.magnitude * 0.9;
    const color = MECHANICS_COLORS.vectors[index % MECHANICS_COLORS.vectors.length]!;
    const symbolRaw = placeText(`vector${index}-symbol`, vector.symbol, 0, 0, { maxWidth: 84, maxLines: 1, fontSize: 15, minFontSize: 10, weight: 800, single: true });
    const caption = vectorCaption(vector);
    const labelW = Math.round(Math.max(92, Math.min(124, bounds.w * 0.36)));
    const labelRaw = placeText(`vector${index}-label`, caption, 0, 0, { maxWidth: labelW, maxLines: 3, fontSize: 9.5, minFontSize: 8 });
    const blockW = Math.max(symbolRaw.rect.w, labelRaw.rect.w);
    // Alt/üst simge (F_1, v^2) yazının kutusunu aşağı uzatır; Türkçe şapkalı harfler (ğ, Ü) etiketi yukarı. Etiket bu pay kadar aşağı iner.
    const shiftPad = (/[_^]/.test(vector.symbol) ? symbolRaw.fontSize * 0.45 : 0) + 3;
    const blockH = symbolRaw.rect.h + shiftPad + labelRaw.rect.h;
    const gap = 7;
    // Blok okun ucunun ötesinde: yönün işaretine göre köşe seçilir.
    let bx = ex + (dx > 0.3 ? gap : dx < -0.3 ? -gap - blockW : -blockW / 2);
    let by = ey + (dy > 0.3 ? gap : dy < -0.3 ? -gap - blockH : -blockH / 2);
    bx = Math.max(bounds.x, Math.min(bounds.x + bounds.w - blockW, bx));
    by = Math.max(bounds.y, Math.min(bounds.y + bounds.h - blockH, by));
    const anchorX = bx + blockW / 2;
    const symbol = placeText(`vector${index}-symbol`, vector.symbol, anchorX, by, { maxWidth: 84, maxLines: 1, fontSize: 15, minFontSize: 10, weight: 800, anchor: "middle", single: true });
    symbol.rect = { ...symbol.rect, h: symbol.rect.h + shiftPad };
    const label = placeText(`vector${index}-label`, caption, anchorX, by + symbol.rect.h, { maxWidth: labelW, maxLines: 3, fontSize: 9.5, minFontSize: 8, anchor: "middle" });
    vectors.push({ x1: sx, y1: sy, x2: ex, y2: ey, width, color, symbol, label });
    // Paralel ok çiftinde etiket kendi okunun dış yanında aransın (komşu okun etiketiyle yer değiştirmesin).
    const twins = data.vectors.filter((other) => other.direction === vector.direction).length > 1;
    sides.push(twins ? { x: nx * (lateral > 0 ? 1 : -1), y: ny * (lateral > 0 ? 1 : -1) } : null);
    segments.push(segment(`vector${index}`, sx, sy, ex, ey));
  });

  // Çakışma onarımı: bir etiket bir oka ya da başka etikete biniyorsa, okun dik yönünde kaydırılır.
  // Ok uçları (marker = 6 × çizgi kalınlığı) yazının binmemesi gereken opak alanlardır; çizgi kalınlığı da pay.
  const heads = vectors.map((vector, index) => ({
    id: `vector${index}-head`,
    rect: { x: vector.x2 - vector.width * 3, y: vector.y2 - vector.width * 3, w: vector.width * 6, h: vector.width * 6 },
  }));
  const widest = Math.max(1, ...vectors.map((vector) => vector.width));
  // Başlık ve panel yazıları da engel; aday konum çizim alanının (plane) dışına çıkamaz.
  const placed: TextBox[] = [...texts];
  const inside = (rect: Rect) =>
    rect.x >= plane.x && rect.y >= plane.y && rect.x + rect.w <= plane.x + plane.w && rect.y + rect.h <= plane.y + plane.h;
  // Adaylar: özgün yere uzaklık sırasıyla ±84 px'e kadar 6 px'lik ızgara (ilk temiz konum seçilir).
  const offsets: [number, number][] = [];
  for (let ox = -84; ox <= 84; ox += 6) for (let oy = -84; oy <= 84; oy += 6) offsets.push([ox, oy]);
  offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  vectors.forEach((vector, index) => {
    const side = sides[index];
    const ordered = side
      ? [...offsets].sort((a, b) => {
          const cost = ([ox, oy]: [number, number]) => Math.hypot(ox, oy) + (ox * side.x + oy * side.y < 0 ? 60 : 0);
          return cost(a) - cost(b);
        })
      : offsets;
    const origin = { symbol: vector.symbol, label: vector.label };
    const clean = (symbol: TextBox, label: TextBox) =>
      [symbol.rect, label.rect].every(
        (rect) =>
          inside(rect) &&
          !segments.some((seg) => segmentHitsRect(seg, inflate(rect, widest / 2 + 1))) &&
          !heads.some((head) => rectsOverlap(head.rect, rect, 1)) &&
          !placed.some((box) => rectsOverlap(box.rect, rect, 1)),
      );
    for (const [ox, oy] of ordered) {
      const symbol = moveBox(origin.symbol, ox, oy);
      const label = moveBox(origin.label, ox, oy);
      if (clean(symbol, label)) {
        vector.symbol = symbol;
        vector.label = label;
        break;
      }
    }
    placed.push(vector.symbol, vector.label);
  });
  for (const vector of vectors) texts.push(vector.symbol, vector.label);

  return {
    frame,
    texts,
    segments,
    markers: heads,
    plane,
    body,
    bodyLabel: bodyLabelBox,
    vectors,
    panel: panelRect,
    panelKicker: panel.kicker,
    formula: panel.formula,
    rows: panel.rows,
    ...(container ? { container } : {}),
    ...(circuit ? { circuit } : {}),
  };
}

function MiniThickness({ x, y, effect }: { x: number; y: number; effect: "up" | "down" }) {
  // Değişken artınca: ince ok → kalın ok (up) ya da kalın → ince (down).
  const thin = 1.5;
  const thick = 5;
  const first = effect === "up" ? thin : thick;
  const second = effect === "up" ? thick : thin;
  const color = effect === "up" ? MECHANICS_COLORS.up : MECHANICS_COLORS.down;
  return (
    <g data-thickness={effect}>
      <line x1={x} y1={y} x2={x + 14} y2={y} stroke={color} strokeWidth={first} strokeLinecap="round" />
      <path d={`M${x + 14},${y - 3 - first / 2} L${x + 19},${y} L${x + 14},${y + 3 + first / 2} z`} fill={color} />
      <line x1={x + 23} y1={y} x2={x + 37} y2={y} stroke={color} strokeWidth={second} strokeLinecap="round" />
      <path d={`M${x + 37},${y - 3 - second / 2} L${x + 43},${y} L${x + 37},${y + 3 + second / 2} z`} fill={color} />
    </g>
  );
}

export function MechanicsVectorScene({ data, domain, ...common }: SceneCommonProps & { data: MechanicsData; domain?: AcademicDomain }) {
  const layout = layoutMechanics(data, common.frame, domain);
  const id = useSceneIds("mech");
  const [badge, title] = layout.texts;
  const { plane, body } = layout;
  const gridStep = 20;
  const gridX: number[] = [];
  const gridY: number[] = [];
  for (let x = plane.x; x <= plane.x + plane.w + 0.5; x += gridStep) gridX.push(x);
  for (let y = plane.y; y <= plane.y + plane.h + 0.5; y += gridStep) gridY.push(y);
  const colors = Object.fromEntries(layout.vectors.map((vector, index) => [`v${index}`, vector.color]));
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${data.vectors.map((vector) => `${vector.symbol} ${vectorCaption(vector)}`).join(", ")}. ${data.logic.formula}`}
      archetype="ENGINEERING_PHYSICS_MECHANICS"
      background={MECHANICS_COLORS.bg}
    >
      <ArrowDefs id={id} colors={colors} />
      <SceneBadge box={badge!} color={MECHANICS_COLORS.vectors[1]} textColor={MECHANICS_COLORS.vectors[1]} />
      <SceneText box={title!} fill={MECHANICS_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      {/* Izgara koordinat düzlemi */}
      <g className="cp-vs-fade" style={delay(0.15)}>
        <rect x={plane.x} y={plane.y} width={plane.w} height={plane.h} rx={10} fill="#0c1628" />
        {gridX.map((x) => (
          <line key={`gx${x}`} x1={x} y1={plane.y} x2={x} y2={plane.y + plane.h} stroke={MECHANICS_COLORS.grid} strokeWidth={1} />
        ))}
        {gridY.map((y) => (
          <line key={`gy${y}`} x1={plane.x} y1={y} x2={plane.x + plane.w} y2={y} stroke={MECHANICS_COLORS.grid} strokeWidth={1} />
        ))}
        <line x1={plane.x} y1={body.y + body.h / 2} x2={plane.x + plane.w} y2={body.y + body.h / 2} stroke={MECHANICS_COLORS.axis} strokeWidth={1} strokeDasharray="3 4" />
        <line x1={body.x + body.w / 2} y1={plane.y} x2={body.x + body.w / 2} y2={plane.y + plane.h} stroke={MECHANICS_COLORS.axis} strokeWidth={1} strokeDasharray="3 4" />
      </g>

      {layout.container ? (
        <g data-setting="fluid">
          <rect
            x={layout.container.left}
            y={layout.container.surface}
            width={layout.container.right - layout.container.left}
            height={layout.container.bottom - layout.container.surface}
            fill={MECHANICS_COLORS.fluid}
            opacity={0.18}
            className="cp-vs-fade"
            style={delay(0.3)}
          />
          <path
            d={`M${layout.container.left},${layout.container.top} L${layout.container.left},${layout.container.bottom} L${layout.container.right},${layout.container.bottom} L${layout.container.right},${layout.container.top}`}
            fill="none"
            stroke={MECHANICS_COLORS.wire}
            strokeWidth={2.5}
            pathLength={1}
            className="cp-vs-draw"
            style={delay(0.25, 0.8)}
          />
          <path
            d={(() => {
              const c = layout.container!;
              const w = (c.right - c.left) / 6;
              return `M${c.left},${c.surface} ` + Array.from({ length: 6 }, () => `q${w / 4},-3 ${w / 2},0 q${w / 4},3 ${w / 2},0`).join(" ");
            })()}
            fill="none"
            stroke={MECHANICS_COLORS.fluid}
            strokeWidth={1.5}
            className="cp-vs-fade"
            style={delay(0.4)}
          />
        </g>
      ) : null}

      {layout.circuit ? (
        <g data-setting="circuit">
          <rect
            x={layout.circuit.x}
            y={layout.circuit.y}
            width={layout.circuit.w}
            height={layout.circuit.h}
            fill="none"
            stroke={MECHANICS_COLORS.wire}
            strokeWidth={2}
            pathLength={1}
            className="cp-vs-draw"
            style={delay(0.25, 1)}
          />
          {/* Pil (sol kenar) ve direnç (üst kenar) sembolleri telin üstünde */}
          <g className="cp-vs-fade" style={delay(0.6)}>
            <rect x={layout.circuit.x - 7} y={layout.circuit.y + layout.circuit.h / 2 - 12} width={14} height={24} fill="#0c1628" />
            <line x1={layout.circuit.x - 9} y1={layout.circuit.y + layout.circuit.h / 2 - 5} x2={layout.circuit.x + 9} y2={layout.circuit.y + layout.circuit.h / 2 - 5} stroke={MECHANICS_COLORS.wire} strokeWidth={2.5} />
            <line x1={layout.circuit.x - 5} y1={layout.circuit.y + layout.circuit.h / 2 + 4} x2={layout.circuit.x + 5} y2={layout.circuit.y + layout.circuit.h / 2 + 4} stroke={MECHANICS_COLORS.wire} strokeWidth={4} />
            <rect x={layout.circuit.x + layout.circuit.w / 2 - 22} y={layout.circuit.y - 6} width={44} height={12} fill="#0c1628" />
            <path
              d={`M${layout.circuit.x + layout.circuit.w / 2 - 22},${layout.circuit.y} l5,-5 l6,10 l6,-10 l6,10 l6,-10 l6,10 l5,-5`}
              fill="none"
              stroke={MECHANICS_COLORS.wire}
              strokeWidth={2}
            />
          </g>
        </g>
      ) : null}

      {/* Cisim */}
      <rect
        x={body.x}
        y={body.y}
        width={body.w}
        height={body.h}
        rx={6}
        fill={MECHANICS_COLORS.body}
        stroke={MECHANICS_COLORS.bodyStroke}
        strokeWidth={2}
        pathLength={1}
        className="cp-vs-draw"
        style={delay(0.35, 0.6)}
      />
      <SceneText box={layout.bodyLabel} fill={MECHANICS_COLORS.text} className="cp-vs-fade" style={delay(0.55)} />

      {/* Oklar (kuvvet ya da eğilim): büyüklük → uzunluk ve kalınlık */}
      {layout.vectors.map((vector, index) => {
        const at = 0.75 + index * 0.45;
        return (
          <g key={index} data-vector={data.vectors[index]!.symbol} data-magnitude={data.vectors[index]!.magnitude}>
            <line
              x1={vector.x1}
              y1={vector.y1}
              x2={vector.x2}
              y2={vector.y2}
              stroke={vector.color}
              strokeWidth={vector.width}
              strokeLinecap="round"
              pathLength={1}
              markerEnd={`url(#${id(`arrow-v${index}`)})`}
              className="cp-vs-draw"
              style={delay(at, 0.55)}
            />
            <SceneText box={vector.symbol} fill={vector.color} className="cp-vs-fade" style={delay(at + 0.4)} rich />
            <SceneText box={vector.label} fill={MECHANICS_COLORS.muted} className="cp-vs-fade" style={delay(at + 0.45)} rich />
          </g>
        );
      })}

      {/* Formülün Mantığı paneli */}
      <g className="cp-vs-fade" style={delay(0.9 + layout.vectors.length * 0.45)} data-panel="logic">
        <rect x={layout.panel.x} y={layout.panel.y} width={layout.panel.w} height={layout.panel.h} rx={12} fill={MECHANICS_COLORS.panel} stroke={MECHANICS_COLORS.panelStroke} />
        <SceneText box={layout.panelKicker} fill={MECHANICS_COLORS.vectors[0]} />
        <SceneText box={layout.formula} fill={MECHANICS_COLORS.text} rich />
        {layout.rows.map((row, index) => {
          const midY = row.y + row.h / 2;
          const red = row.kind === "distractor";
          return (
            <g key={index} data-row={row.kind}>
              <rect
                x={row.chip.x}
                y={row.chip.y}
                width={row.chip.w}
                height={row.chip.h}
                rx={6}
                fill={red ? "#3b0d12" : "#16233a"}
                stroke={red ? MECHANICS_COLORS.distractor : MECHANICS_COLORS.panelStroke}
              />
              <text x={row.symbol.x} y={row.symbol.y + row.symbol.fontSize * 0.92} fontSize={row.symbol.fontSize} fontWeight={800} textAnchor="middle" fill={red ? "#fecaca" : MECHANICS_COLORS.text}>
                <RichLine line={row.symbol.lines[0]!} />
              </text>
              {red ? (
                <>
                  {/* Üstü çizili çeldirici */}
                  <line x1={row.chip.x + 4} y1={midY} x2={row.chip.x + row.chip.w - 4} y2={midY} stroke={MECHANICS_COLORS.distractor} strokeWidth={2.2} strokeLinecap="round" />
                  <rect x={row.tag!.rect.x - 4} y={row.tag!.rect.y - 1} width={row.tag!.rect.w + 8} height={row.tag!.rect.h + 2} rx={4} fill={MECHANICS_COLORS.distractor} />
                  <SceneText box={row.tag!} fill="#fff" />
                  <SceneText box={row.label} fill="#fecaca" />
                </>
              ) : (
                <>
                  <circle cx={row.chip.x + row.chip.w + 14} cy={midY} r={8} fill={row.effect === "up" ? MECHANICS_COLORS.up : MECHANICS_COLORS.down} />
                  <path
                    d={
                      row.effect === "up"
                        ? `M${row.chip.x + row.chip.w + 14},${midY - 4.5} l-4,5 h8 z M${row.chip.x + row.chip.w + 14},${midY - 1} v5.5`
                        : `M${row.chip.x + row.chip.w + 14},${midY + 4.5} l-4,-5 h8 z M${row.chip.x + row.chip.w + 14},${midY + 1} v-5.5`
                    }
                    stroke="#06121f"
                    fill="#06121f"
                    strokeWidth={1.6}
                  />
                  <SceneText box={row.label} fill={MECHANICS_COLORS.text} rich />
                  <MiniThickness x={layout.panel.x + layout.panel.w - 10 - 44} y={midY} effect={row.effect!} />
                </>
              )}
            </g>
          );
        })}
      </g>
    </SceneSvg>
  );
}
