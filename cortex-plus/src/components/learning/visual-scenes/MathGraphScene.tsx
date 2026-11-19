"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  layoutHeader,
  placeText,
  rectsOverlap,
  segment,
  segmentHitsRect,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type Segment,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import type { CurveFamily, CurvePointKind, MathGraphData } from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * MATH_ALGORITHMIC_GRAPH (Matematik, Geometri, Algoritma, İstatistik): temiz eksenli koordinat sistemi,
 * fonksiyon eğrisi / taranmış integral alanı ya da geometrik şekil üstünde renkli açı/kenar eşleştirme
 * yayları ve adım adım dönüşüm okları. Eğri ailesi parametriktir: model koordinat yazmaz, aileyi ve
 * kritik noktaların adını yazar; noktaların yeri ailenin kendi matematiğinden gelir.
 */

export const MATH_COLORS = {
  bg: "#0d1426",
  panel: "#131c33",
  grid: "#18223b",
  axis: "#94a3b8",
  curve: "#38bdf8",
  area: "#38bdf8",
  point: "#facc15",
  text: "#f1f5f9",
  muted: "#a3b0c8",
  step: "#a78bfa",
  groups: ["#f472b6", "#facc15", "#34d399"],
} as const;

type Family = {
  x: [number, number];
  y: [number, number];
  f: (x: number) => number;
  /** Tanımsız bölge (logaritma). */
  from?: number;
  points: Partial<Record<CurvePointKind, number>>;
  integral: [number, number];
};

export const CURVE_FAMILY_DEFS: Record<CurveFamily, Family> = {
  linear: { x: [-3, 3], y: [-2.5, 4], f: (x) => 0.8 * x + 1, points: { root: -1.25, y_intercept: 0 }, integral: [0, 2] },
  quadratic: {
    x: [-3, 3],
    y: [-2.5, 4],
    f: (x) => 0.6 * (x - 0.5) ** 2 - 1.8,
    points: { root: 2.232, vertex: 0.5, min: 0.5, y_intercept: 0 },
    integral: [-1.232, 2.232],
  },
  cubic: {
    x: [-2.4, 2.4],
    y: [-3, 3],
    f: (x) => 0.35 * x ** 3 - 1.2 * x,
    points: { root: 1.852, max: -1.069, min: 1.069, inflection: 0, y_intercept: 0 },
    integral: [-1.852, 0],
  },
  exponential: { x: [-3, 2.5], y: [-0.8, 8], f: (x) => 0.8 * Math.exp(0.9 * x), points: { y_intercept: 0 }, integral: [-1, 1.5] },
  logarithmic: { x: [-0.5, 6], y: [-3, 3], from: 0.06, f: (x) => 1.3 * Math.log(x), points: { root: 1 }, integral: [1, 4.5] },
  sine: {
    x: [-0.5, 6.8],
    y: [-2.2, 2.2],
    f: (x) => 1.4 * Math.sin(x),
    points: { root: Math.PI, max: Math.PI / 2, min: (3 * Math.PI) / 2, y_intercept: 0, inflection: Math.PI },
    integral: [0, Math.PI],
  },
  absolute: { x: [-3, 3], y: [-2, 3], f: (x) => Math.abs(x - 0.5) * 1.1 - 1, points: { root: 1.409, vertex: 0.5, min: 0.5, y_intercept: 0 }, integral: [1.409, 2.8] },
};

/**
 * Ters yönlü eğri. Üstelde ters yön "azalan üstel" e^(−x)'tir: y eksenine göre ayna (19 Kasım 2026, Faz 1-B denetimi;
 * önce y'yi negatifleyip eksenin altında −eˣ çiziyordu). Öbür ailelerde x eksenine göre ayna doğru: aşağı açılan
 * parabol, azalan doğru, tabanı 1'den küçük logaritma (−ln x), ters sinüs.
 */
export function flippedFamily(base: Family, family?: CurveFamily): Family {
  if (family === "exponential") {
    const mirror = (x: number) => -x;
    return {
      ...base,
      x: [-base.x[1], -base.x[0]],
      f: (x) => base.f(mirror(x)),
      points: Object.fromEntries(Object.entries(base.points).map(([kind, x]) => [kind, typeof x === "number" ? mirror(x) : x])),
      integral: [-base.integral[1], -base.integral[0]],
    };
  }
  return { ...base, y: [-base.y[1], -base.y[0]], f: (x) => -base.f(x), points: { ...base.points, ...(base.points.min !== undefined ? { max: base.points.min } : {}), ...(base.points.max !== undefined ? { min: base.points.max } : {}) } };
}

export type MathLayout = SceneLayout & {
  graph: Rect;
  steps: { chip: Rect; text: TextBox }[];
  stepArrows: Segment[];
  curve?: { path: string; axisX: number; axisY: number; area?: string; areaX: [number, number] };
  points: { x: number; y: number; label: TextBox }[];
  expression?: TextBox;
  integralLabels?: { a: TextBox; b: TextBox; label: TextBox };
  shape?: {
    kind: NonNullable<MathGraphData["shape"]>["kind"];
    vertices: { x: number; y: number }[];
    circle?: { cx: number; cy: number; r: number };
    angles: { at: { x: number; y: number }; from: number; to: number; r: number; group: number; label: TextBox }[];
    sides: { a: { x: number; y: number }; b: { x: number; y: number }; group: number; label: TextBox }[];
  };
};

const PLACE_GAP = 6;

/** Etiketi noktanın çevresindeki adaylardan çakışmasız ilkine koyar. */
function placeNear(
  id: string,
  text: string,
  px: number,
  py: number,
  bounds: Rect,
  avoid: { segments: Segment[]; boxes: Rect[] },
  options: { fontSize: number; weight?: 400 | 600 | 700 | 800; maxWidth?: number },
): TextBox {
  const probe = placeText(id, text, 0, 0, { maxWidth: options.maxWidth ?? 120, maxLines: 1, fontSize: options.fontSize, minFontSize: 8.5, weight: options.weight ?? 700, single: true });
  const w = probe.rect.w;
  const h = probe.rect.h;
  const candidates: [number, number][] = [
    [px + PLACE_GAP, py - PLACE_GAP - h],
    [px - PLACE_GAP - w, py - PLACE_GAP - h],
    [px + PLACE_GAP, py + PLACE_GAP],
    [px - PLACE_GAP - w, py + PLACE_GAP],
    [px - w / 2, py - PLACE_GAP * 2 - h],
    [px - w / 2, py + PLACE_GAP * 2],
    [px + PLACE_GAP * 2, py - h / 2],
    [px - PLACE_GAP * 2 - w, py - h / 2],
    [px + PLACE_GAP * 3, py - PLACE_GAP * 3 - h],
    [px - PLACE_GAP * 3 - w, py + PLACE_GAP * 3],
    [px - w / 2, py - PLACE_GAP * 4 - h],
    [px - w / 2, py + PLACE_GAP * 4],
  ];
  let best: TextBox | null = null;
  for (const [cx, cy] of candidates) {
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - w, cx));
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - h, cy));
    const box: TextBox = { ...probe, x, y, rect: { x, y, w, h } };
    best ??= box;
    const clash = avoid.segments.some((seg) => segmentHitsRect(seg, box.rect)) || avoid.boxes.some((rect) => rectsOverlap(rect, box.rect, 2));
    if (!clash) return box;
  }
  // Yakın adayların hepsi doluysa: sınırlar içinde noktaya en yakın boş yeri ızgarayla ara.
  let nearest: TextBox | null = null;
  let nearestD = Infinity;
  for (let y = bounds.y; y <= bounds.y + bounds.h - h; y += 4) {
    for (let x = bounds.x; x <= bounds.x + bounds.w - w; x += 4) {
      const rect = { x, y, w, h };
      const d = Math.hypot(x + w / 2 - px, y + h / 2 - py);
      if (d >= nearestD) continue;
      const clash = avoid.segments.some((seg) => segmentHitsRect(seg, rect)) || avoid.boxes.some((r) => rectsOverlap(r, rect, 2));
      if (clash) continue;
      nearestD = d;
      nearest = { ...probe, x, y, rect };
    }
  }
  return nearest ?? best!;
}

function layoutSteps(data: MathGraphData, area: Rect, portrait: boolean): { steps: MathLayout["steps"]; arrows: Segment[]; height: number } {
  if (!data.steps.length) return { steps: [], arrows: [], height: 0 };
  const gap = 16;
  const steps: MathLayout["steps"] = [];
  const arrows: Segment[] = [];
  let y = area.y;
  data.steps.forEach((step, index) => {
    const text = placeText(`step${index}`, step, area.x + 30, y + 7, { maxWidth: area.w - 40, maxLines: portrait ? 1 : 2, fontSize: 12, minFontSize: 9.5, weight: 700 });
    const chip: Rect = { x: area.x, y, w: area.w, h: text.rect.h + 14 };
    steps.push({ chip, text });
    if (index > 0) {
      const prev = steps[index - 1]!.chip;
      arrows.push(segment(`step-arrow${index}`, area.x + 14, prev.y + prev.h + 2, area.x + 14, y - 2));
    }
    y += chip.h + gap;
  });
  return { steps, arrows, height: y - gap - area.y };
}

export function layoutMathGraph(data: MathGraphData, frame: SceneFrame, domain?: AcademicDomain): MathLayout {
  const { content } = frame;
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Matematik"} · ${ARCHETYPE_LABEL.MATH_ALGORITHMIC_GRAPH}`;
  const header = layoutHeader(frame, data.title, badge);
  const texts: TextBox[] = [...header.texts];
  const segments: Segment[] = [];
  const top = header.bottom + 12;
  const bottom = content.y + content.h;

  // Adımlar: dikeyde altta, yatayda sağ sütunda.
  let graph: Rect;
  let stepsOut: ReturnType<typeof layoutSteps>;
  if (frame.portrait) {
    const probe = layoutSteps(data, { x: content.x, y: 0, w: content.w, h: 0 }, true);
    const stepsTop = bottom - probe.height;
    stepsOut = layoutSteps(data, { x: content.x, y: stepsTop, w: content.w, h: probe.height }, true);
    graph = { x: content.x, y: top, w: content.w, h: (data.steps.length ? stepsTop - 14 : bottom) - top };
  } else {
    const colW = data.steps.length ? Math.round(content.w * 0.36) : 0;
    const colX = content.x + content.w - colW;
    const probe = layoutSteps(data, { x: colX, y: 0, w: colW, h: 0 }, false);
    stepsOut = layoutSteps(data, { x: colX, y: top + Math.max(0, (bottom - top - probe.height) / 2), w: colW, h: probe.height }, false);
    graph = { x: content.x, y: top, w: (data.steps.length ? colX - 16 : content.x + content.w) - content.x, h: bottom - top };
  }
  for (const step of stepsOut.steps) texts.push(step.text);
  segments.push(...stepsOut.arrows);

  const inner: Rect = { x: graph.x + 8, y: graph.y + 8, w: graph.w - 16, h: graph.h - 16 };
  const placedBoxes: Rect[] = [];
  const points: MathLayout["points"] = [];
  let curveOut: MathLayout["curve"];
  let expression: TextBox | undefined;
  let integralLabels: MathLayout["integralLabels"];
  let shapeOut: MathLayout["shape"];

  if (data.mode === "geometry") {
    const shape = data.shape ?? { kind: "triangle" as const, angles: [], sides: [] };
    const size = Math.min(inner.w, inner.h) * 0.62;
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    let vertices: { x: number; y: number }[] = [];
    let circle: { cx: number; cy: number; r: number } | undefined;
    if (shape.kind === "triangle") vertices = [{ x: cx - size * 0.62, y: cy + size * 0.42 }, { x: cx + size * 0.62, y: cy + size * 0.42 }, { x: cx + size * 0.1, y: cy - size * 0.5 }];
    else if (shape.kind === "right_triangle") vertices = [{ x: cx - size * 0.55, y: cy + size * 0.42 }, { x: cx + size * 0.6, y: cy + size * 0.42 }, { x: cx - size * 0.55, y: cy - size * 0.5 }];
    else if (shape.kind === "rectangle") vertices = [{ x: cx - size * 0.7, y: cy + size * 0.38 }, { x: cx + size * 0.7, y: cy + size * 0.38 }, { x: cx + size * 0.7, y: cy - size * 0.38 }, { x: cx - size * 0.7, y: cy - size * 0.38 }];
    else if (shape.kind === "parallelogram") vertices = [{ x: cx - size * 0.75, y: cy + size * 0.36 }, { x: cx + size * 0.45, y: cy + size * 0.36 }, { x: cx + size * 0.75, y: cy - size * 0.36 }, { x: cx - size * 0.45, y: cy - size * 0.36 }];
    else {
      circle = { cx, cy, r: size * 0.48 };
      vertices = [{ x: cx, y: cy }, { x: cx + size * 0.48, y: cy }, { x: cx + size * 0.48 * Math.cos(-1.1), y: cy + size * 0.48 * Math.sin(-1.1) }];
    }
    const edges: [number, number][] = circle ? [[0, 1], [0, 2]] : vertices.map((_, i) => [i, (i + 1) % vertices.length] as [number, number]);
    edges.forEach(([i, j], index) => segments.push(segment(`edge${index}`, vertices[i]!.x, vertices[i]!.y, vertices[j]!.x, vertices[j]!.y)));
    if (circle) {
      const n = 36;
      for (let k = 0; k < n; k += 1) {
        const a1 = (k / n) * Math.PI * 2;
        const a2 = ((k + 1) / n) * Math.PI * 2;
        segments.push(segment(`circle${k}`, circle.cx + circle.r * Math.cos(a1), circle.cy + circle.r * Math.sin(a1), circle.cx + circle.r * Math.cos(a2), circle.cy + circle.r * Math.sin(a2)));
      }
    }
    // Açılar: köşede iç açıortay boyunca etiket.
    const angleVertices = circle ? [0] : vertices.map((_, i) => i);
    const angles = shape.angles.slice(0, angleVertices.length).map((angle, index) => {
      const vi = angleVertices[index]!;
      const v = vertices[vi]!;
      const prev = circle ? vertices[1]! : vertices[(vi - 1 + vertices.length) % vertices.length]!;
      const next = circle ? vertices[2]! : vertices[(vi + 1) % vertices.length]!;
      const a1 = Math.atan2(prev.y - v.y, prev.x - v.x);
      const a2 = Math.atan2(next.y - v.y, next.x - v.x);
      let diff = a2 - a1;
      while (diff <= -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const mid = a1 + diff / 2;
      const r = 18 + index * 2;
      const lx = v.x + Math.cos(mid) * (r + 18);
      const ly = v.y + Math.sin(mid) * (r + 18);
      const label = placeNear(`angle${index}`, angle.label, lx, ly, inner, { segments, boxes: placedBoxes }, { fontSize: 11.5, maxWidth: 60 });
      placedBoxes.push(label.rect);
      return { at: v, from: a1, to: a1 + diff, r, group: angle.group, label };
    });
    const sides = shape.sides.slice(0, edges.length).map((side, index) => {
      const [i, j] = edges[index]!;
      const a = vertices[i]!;
      const b = vertices[j]!;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Dış normal: şeklin merkezinden uzağa.
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      if ((mx - cx) * nx + (my - cy) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const label = placeNear(`side${index}`, side.label, mx + nx * 16, my + ny * 16, inner, { segments, boxes: placedBoxes }, { fontSize: 11.5, maxWidth: 70 });
      placedBoxes.push(label.rect);
      return { a, b, group: side.group, label };
    });
    texts.push(...angles.map((a) => a.label), ...sides.map((s) => s.label));
    shapeOut = { kind: shape.kind, vertices, ...(circle ? { circle } : {}), angles, sides };
  } else {
    const curve = data.curve ?? { family: data.mode === "integral" ? ("quadratic" as const) : ("quadratic" as const), expression: "f(x)", points: [] };
    const base = CURVE_FAMILY_DEFS[curve.family];
    const def = curve.flipped ? flippedFamily(base, curve.family) : base;
    const sx = (x: number) => inner.x + ((x - def.x[0]) / (def.x[1] - def.x[0])) * inner.w;
    const sy = (y: number) => inner.y + inner.h - ((y - def.y[0]) / (def.y[1] - def.y[0])) * inner.h;
    const axisX = Math.max(inner.x, Math.min(inner.x + inner.w, sx(0)));
    const axisY = Math.max(inner.y, Math.min(inner.y + inner.h, sy(0)));
    segments.push(segment("axis-x", inner.x, axisY, inner.x + inner.w, axisY));
    segments.push(segment("axis-y", axisX, inner.y, axisX, inner.y + inner.h));
    const n = 64;
    const start = def.from !== undefined ? Math.max(def.x[0], def.from) : def.x[0];
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k <= n; k += 1) {
      const x = start + ((def.x[1] - start) * k) / n;
      const y = def.f(x);
      if (!Number.isFinite(y)) continue;
      const py = sy(y);
      if (py < inner.y - 40 || py > inner.y + inner.h + 40) continue;
      pts.push({ x: sx(x), y: Math.max(inner.y, Math.min(inner.y + inner.h, py)) });
    }
    for (let k = 1; k < pts.length; k += 1) segments.push(segment(`curve${k}`, pts[k - 1]!.x, pts[k - 1]!.y, pts[k]!.x, pts[k]!.y));
    const path = pts.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    let area: string | undefined;
    let areaX: [number, number] = [0, 0];
    if (data.mode === "integral") {
      const [a, b] = def.integral;
      const m = 24;
      const areaPts: string[] = [`M${sx(a).toFixed(1)},${axisY.toFixed(1)}`];
      for (let k = 0; k <= m; k += 1) {
        const x = a + ((b - a) * k) / m;
        areaPts.push(`L${sx(x).toFixed(1)},${Math.max(inner.y, Math.min(inner.y + inner.h, sy(def.f(x)))).toFixed(1)}`);
      }
      areaPts.push(`L${sx(b).toFixed(1)},${axisY.toFixed(1)} Z`);
      area = areaPts.join(" ");
      areaX = [sx(a), sx(b)];
      const integral = data.integral ?? { from: "a", to: "b", label: "Alan" };
      // Sınır etiketleri: önce eksenin altı, eğriye/ekseni değerse dışa doğru kaydırılır ya da üste alınır.
      const bound = (x: number, id: string, text: string, outward: -1 | 1): TextBox => {
        const probe = placeText(id, text, 0, 0, { maxWidth: 40, maxLines: 1, fontSize: 11.5, weight: 800, single: true });
        const { w, h } = probe.rect;
        let first: TextBox | null = null;
        for (const side of [1, -1] as const) {
          for (const step of [0, 1, 2, 3, 4, 5, 6]) {
            const cx = Math.max(inner.x, Math.min(inner.x + inner.w - w, x - w / 2 + outward * step * 6));
            const cy = side === 1 ? axisY + 5 : axisY - 5 - h;
            if (cy < inner.y || cy + h > inner.y + inner.h) continue;
            const rect = { x: cx, y: cy, w, h };
            const box: TextBox = { ...probe, x: cx, y: cy, rect };
            first ??= box;
            const clash = segments.some((seg) => segmentHitsRect(seg, rect)) || placedBoxes.some((r) => rectsOverlap(r, rect, 2));
            if (!clash) return box;
          }
        }
        return first ?? placeNear(id, text, x, axisY, inner, { segments, boxes: placedBoxes }, { fontSize: 11.5, weight: 800, maxWidth: 40 });
      };
      const la = bound(areaX[0], "integral-a", integral.from, -1);
      placedBoxes.push(la.rect);
      const lb = bound(areaX[1], "integral-b", integral.to, 1);
      placedBoxes.push(lb.rect);
      const midX = (areaX[0] + areaX[1]) / 2;
      const midY = sy(def.f((a + b) / 2));
      const label = placeNear("integral-label", integral.label, midX, (midY + axisY) / 2, inner, { segments, boxes: placedBoxes }, { fontSize: 12, maxWidth: inner.w * 0.5 });
      placedBoxes.push(label.rect);
      integralLabels = { a: la, b: lb, label };
      texts.push(la, lb, label);
    }
    for (const point of curve.points) {
      const at = def.points[point.kind];
      if (at === undefined) continue;
      const x = point.kind === "y_intercept" ? 0 : at;
      const px = sx(x);
      const py = sy(def.f(x));
      if (py < inner.y || py > inner.y + inner.h) continue;
      const label = placeNear(`point-${point.kind}`, point.label, px, py, inner, { segments, boxes: placedBoxes }, { fontSize: 11 });
      placedBoxes.push(label.rect, { x: px - 4, y: py - 4, w: 8, h: 8 });
      points.push({ x: px, y: py, label });
      texts.push(label);
    }
    // İfade: ızgaranın boş bir köşesine.
    const corners: [number, number][] = [
      [inner.x + 4, inner.y + 4],
      [inner.x + inner.w - 4, inner.y + 4],
      [inner.x + 4, inner.y + inner.h - 4],
      [inner.x + inner.w - 4, inner.y + inner.h - 4],
    ];
    for (const [cx, cy] of corners) {
      const box = placeNear("expression", curve.expression, cx, cy, inner, { segments, boxes: placedBoxes }, { fontSize: 13, weight: 800, maxWidth: inner.w * 0.6 });
      const clash = segments.some((seg) => segmentHitsRect(seg, box.rect)) || placedBoxes.some((rect) => rectsOverlap(rect, box.rect, 2));
      if (!clash || cx === corners[corners.length - 1]![0] && cy === corners[corners.length - 1]![1]) {
        expression = box;
        break;
      }
    }
    if (expression) texts.push(expression);
    curveOut = { path, axisX, axisY, ...(area ? { area } : {}), areaX };
  }

  return {
    frame,
    texts,
    segments,
    markers: points.map((p, i) => ({ id: `point${i}`, rect: { x: p.x - 4, y: p.y - 4, w: 8, h: 8 } })),
    graph,
    steps: stepsOut.steps,
    stepArrows: stepsOut.arrows,
    ...(curveOut ? { curve: curveOut } : {}),
    points,
    ...(expression ? { expression } : {}),
    ...(integralLabels ? { integralLabels } : {}),
    ...(shapeOut ? { shape: shapeOut } : {}),
  };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const x1 = cx + r * Math.cos(from);
  const y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to);
  const y2 = cy + r * Math.sin(to);
  const sweep = to > from ? 1 : 0;
  const large = Math.abs(to - from) > Math.PI ? 1 : 0;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} ${sweep} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

export function MathGraphScene({ data, domain, ...common }: SceneCommonProps & { data: MathGraphData; domain?: AcademicDomain }) {
  const layout = layoutMathGraph(data, common.frame, domain);
  const id = useSceneIds("math");
  const [badge, title] = layout.texts;
  const { graph } = layout;
  const gridStep = 20;
  const grid: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = graph.x + 8; x <= graph.x + graph.w - 8; x += gridStep) grid.push({ x1: x, y1: graph.y + 8, x2: x, y2: graph.y + graph.h - 8 });
  for (let y = graph.y + 8; y <= graph.y + graph.h - 8; y += gridStep) grid.push({ x1: graph.x + 8, y1: y, x2: graph.x + graph.w - 8, y2: y });
  const inner = { x: graph.x + 8, y: graph.y + 8, w: graph.w - 16, h: graph.h - 16 };
  return (
    <SceneSvg
      {...common}
      label={`${data.title}${data.curve ? `: ${data.curve.expression}` : ""}`}
      archetype="MATH_ALGORITHMIC_GRAPH"
      background={MATH_COLORS.bg}
    >
      <ArrowDefs id={id} colors={{ axis: MATH_COLORS.axis, step: MATH_COLORS.step }} />
      <defs>
        <clipPath id={id("clip")}>
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} />
        </clipPath>
        <pattern id={id("hatch")} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke={MATH_COLORS.area} strokeWidth={1.4} strokeOpacity={0.55} />
        </pattern>
      </defs>
      <SceneBadge box={badge!} color={MATH_COLORS.curve} textColor={MATH_COLORS.curve} />
      <SceneText box={title!} fill={MATH_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      <g className="cp-vs-fade" style={delay(0.12)}>
        <rect x={graph.x} y={graph.y} width={graph.w} height={graph.h} rx={12} fill={MATH_COLORS.panel} />
        {grid.map((line, index) => (
          <line key={index} {...line} stroke={MATH_COLORS.grid} strokeWidth={1} />
        ))}
      </g>

      {layout.curve ? (
        <g data-mode={data.mode} clipPath={`url(#${id("clip")})`}>
          <line x1={inner.x} y1={layout.curve.axisY} x2={inner.x + inner.w} y2={layout.curve.axisY} stroke={MATH_COLORS.axis} strokeWidth={1.4} markerEnd={`url(#${id("arrow-axis")})`} pathLength={1} className="cp-vs-draw" style={delay(0.2, 0.5)} />
          <line x1={layout.curve.axisX} y1={inner.y + inner.h} x2={layout.curve.axisX} y2={inner.y} stroke={MATH_COLORS.axis} strokeWidth={1.4} markerEnd={`url(#${id("arrow-axis")})`} pathLength={1} className="cp-vs-draw" style={delay(0.3, 0.5)} />
          {layout.curve.area ? (
            <g className="cp-vs-fade" style={delay(1.3)} data-area="integral">
              <path d={layout.curve.area} fill={MATH_COLORS.area} fillOpacity={0.16} />
              <path d={layout.curve.area} fill={`url(#${id("hatch")})`} />
            </g>
          ) : null}
          <path d={layout.curve.path} fill="none" stroke={MATH_COLORS.curve} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="cp-vs-draw" style={delay(0.55, 1.2)} />
        </g>
      ) : null}
      {layout.integralLabels ? (
        <g className="cp-vs-fade" style={delay(1.5)}>
          <SceneText box={layout.integralLabels.a} fill={MATH_COLORS.point} />
          <SceneText box={layout.integralLabels.b} fill={MATH_COLORS.point} />
          <SceneText box={layout.integralLabels.label} fill={MATH_COLORS.text} rich />
        </g>
      ) : null}
      {layout.points.map((point, index) => (
        <g key={index} className="cp-vs-fade" style={delay(1.6 + index * 0.2)}>
          <circle cx={point.x} cy={point.y} r={4.5} fill={MATH_COLORS.point} stroke={MATH_COLORS.bg} strokeWidth={1.5} />
          <SceneText box={point.label} fill={MATH_COLORS.point} rich />
        </g>
      ))}
      {layout.expression ? <SceneText box={layout.expression} fill={MATH_COLORS.curve} className="cp-vs-fade" style={delay(0.9)} rich /> : null}

      {layout.shape ? (
        <g data-shape={layout.shape.kind}>
          {layout.shape.circle ? (
            <circle cx={layout.shape.circle.cx} cy={layout.shape.circle.cy} r={layout.shape.circle.r} fill="none" stroke={MATH_COLORS.curve} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(0.3, 1)} />
          ) : null}
          {layout.shape.circle ? (
            <>
              <line x1={layout.shape.vertices[0]!.x} y1={layout.shape.vertices[0]!.y} x2={layout.shape.vertices[1]!.x} y2={layout.shape.vertices[1]!.y} stroke={MATH_COLORS.curve} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(0.9, 0.4)} />
              <line x1={layout.shape.vertices[0]!.x} y1={layout.shape.vertices[0]!.y} x2={layout.shape.vertices[2]!.x} y2={layout.shape.vertices[2]!.y} stroke={MATH_COLORS.curve} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(1.1, 0.4)} />
              <circle cx={layout.shape.vertices[0]!.x} cy={layout.shape.vertices[0]!.y} r={3.5} fill={MATH_COLORS.point} />
            </>
          ) : (
            <polygon
              points={layout.shape.vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ")}
              fill={MATH_COLORS.curve}
              fillOpacity={0.08}
              stroke={MATH_COLORS.curve}
              strokeWidth={2.5}
              strokeLinejoin="round"
              pathLength={1}
              className="cp-vs-draw"
              style={delay(0.3, 1.1)}
            />
          )}
          {layout.shape.kind === "right_triangle" ? (
            <path d={`M${layout.shape.vertices[0]!.x + 12},${layout.shape.vertices[0]!.y} v-12 h-12`} fill="none" stroke={MATH_COLORS.text} strokeWidth={1.4} className="cp-vs-fade" style={delay(1.2)} />
          ) : null}
          {layout.shape.angles.map((angle, index) => {
            const color = MATH_COLORS.groups[(angle.group - 1) % 3]!;
            return (
              <g key={`angle${index}`} data-group={angle.group}>
                {Array.from({ length: angle.group }, (_, k) => (
                  <path key={k} d={arcPath(angle.at.x, angle.at.y, angle.r + k * 4, angle.from, angle.to)} fill="none" stroke={color} strokeWidth={2.2} pathLength={1} className="cp-vs-draw" style={delay(1.3 + index * 0.25, 0.5)} />
                ))}
                <SceneText box={angle.label} fill={color} className="cp-vs-fade" style={delay(1.5 + index * 0.25)} rich />
              </g>
            );
          })}
          {layout.shape.sides.map((side, index) => {
            const color = MATH_COLORS.groups[(side.group - 1) % 3]!;
            const mx = (side.a.x + side.b.x) / 2;
            const my = (side.a.y + side.b.y) / 2;
            const len = Math.hypot(side.b.x - side.a.x, side.b.y - side.a.y) || 1;
            const ux = (side.b.x - side.a.x) / len;
            const uy = (side.b.y - side.a.y) / len;
            return (
              <g key={`side${index}`} data-group={side.group} className="cp-vs-fade" style={delay(1.8 + index * 0.2)}>
                {Array.from({ length: side.group }, (_, k) => {
                  const off = (k - (side.group - 1) / 2) * 5;
                  const tx = mx + ux * off;
                  const ty = my + uy * off;
                  return <line key={k} x1={tx - uy * 6} y1={ty + ux * 6} x2={tx + uy * 6} y2={ty - ux * 6} stroke={color} strokeWidth={2.2} />;
                })}
                <SceneText box={side.label} fill={color} rich />
              </g>
            );
          })}
        </g>
      ) : null}

      {/* Adım adım dönüşüm */}
      {layout.steps.map((step, index) => (
        <g key={`step${index}`} className="cp-vs-fade" style={delay(2.2 + index * 0.35)}>
          <rect x={step.chip.x} y={step.chip.y} width={step.chip.w} height={step.chip.h} rx={10} fill={MATH_COLORS.step} fillOpacity={0.14} stroke={MATH_COLORS.step} strokeWidth={1.2} />
          <circle cx={step.chip.x + 14} cy={step.chip.y + step.chip.h / 2} r={8} fill={MATH_COLORS.step} />
          <text x={step.chip.x + 14} y={step.chip.y + step.chip.h / 2 + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill={MATH_COLORS.bg}>
            {index + 1}
          </text>
          <SceneText box={step.text} fill={MATH_COLORS.text} rich />
        </g>
      ))}
      {layout.stepArrows.map((arrow, index) => (
        <line key={`arrow${index}`} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke={MATH_COLORS.step} strokeWidth={2} markerEnd={`url(#${id("arrow-step")})`} pathLength={1} className="cp-vs-draw" style={delay(2.4 + index * 0.35, 0.3)} />
      ))}
    </SceneSvg>
  );
}
