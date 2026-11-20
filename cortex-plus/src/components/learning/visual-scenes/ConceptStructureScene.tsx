"use client";

import { CONCEPT_STRUCTURE_LABEL, DOMAIN_LABEL, foldTr, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  isTechnical,
  labelBudget,
  layoutHeader,
  rectsOverlap,
  segment,
  segmentHitsRect,
  textPlacer,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type Segment,
  type TextBox,
  type TextPlacer,
} from "@/lib/learning/visual-scenes/layout";
import type { ConceptItem, ConceptStructureData } from "@/lib/learning/visual-scenes/schema";
import { measureText } from "@/lib/learning/visual-scenes/text-fit";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * CONCEPT_STRUCTURE_VISUALIZER (20 Kasım 2026): iktisat, tarih, psikoloji, coğrafya, edebiyat, felsefe, yabancı dil ve
 * genel dersler. Konu bir karar ağacına zorlanmaz; yapısına göre çizilir:
 * - process: numaralı süreç akışı (uzunsa yılan biçiminde iki satır),
 * - matrix: karşılaştırma matrisi (`comparisonRows`, vurgulu hücre),
 * - pyramid: tepeden tabana katmanlı piramit, katman adları yanda,
 * - timeline: zaman çizelgesi (yatayda eksen, dikeyde sol omurga),
 * - cause_effect: neden-sonuç ağı (bağlar artırır yeşil / azaltır kırmızı; katman atlayan bağ kenar şeridinden),
 * - supply_demand: arz-talep grafiği (eksenler, iki eğri, denge E, isteğe bağlı kayma ve yeni denge E′).
 * Model yalnız yapıyı yazar; koordinat, eğim ve kesişim kodda hesaplanır (denge kayma yönüyle tutarlı çıkar).
 */

export const CONCEPT_COLORS = {
  bg: "#101423",
  panel: "#171d31",
  stroke: "#2b3555",
  text: "#f4f6fb",
  muted: "#a9b3cb",
  accent: "#7dd3fc",
  up: "#22c55e",
  down: "#ef4444",
  highlight: "#facc15",
  supply: "#38bdf8",
  demand: "#f472b6",
  steps: ["#818cf8", "#38bdf8", "#34d399", "#facc15", "#fb923c", "#f472b6", "#a78bfa"],
} as const;

type Section = { texts: TextBox[]; segments: Segment[]; markers: SceneLayout["markers"]; height: number };

export type ProcessLayout = Section & {
  kind: "process";
  boxes: { rect: Rect; number: { x: number; y: number; n: number }; label: TextBox; detail: TextBox | null; color: string }[];
  arrows: { x1: number; y1: number; x2: number; y2: number }[];
};
export type MatrixLayout = Section & {
  kind: "matrix";
  table: Rect;
  heads: { rect: Rect; text: TextBox }[];
  rows: { rect: Rect; label: TextBox; cells: { rect: Rect; text: TextBox; highlight: boolean }[] }[];
};
export type PyramidLayout = Section & {
  kind: "pyramid";
  layers: { points: [number, number][]; color: string; label: TextBox; detail: TextBox | null; leader: [number, number, number, number] }[];
};
export type TimelineConceptLayout = Section & {
  kind: "timeline";
  axis: { x1: number; y1: number; x2: number; y2: number };
  stops: { x: number; y: number; date: TextBox | null; label: TextBox; detail: TextBox | null }[];
};
export type CauseLayout = Section & {
  kind: "cause_effect";
  nodes: { rect: Rect; label: TextBox; detail: TextBox | null; layer: number }[];
  edges: { points: [number, number][]; effect: "increase" | "decrease" | null }[];
};
export type MarketLayout = Section & {
  kind: "supply_demand";
  plot: Rect;
  axes: { x: number; y: number; right: number; top: number };
  curves: { id: "S" | "D" | "S2" | "D2"; x1: number; y1: number; x2: number; y2: number; dashed: boolean; tag: TextBox }[];
  points: { id: "E" | "E2"; x: number; y: number; tag: TextBox }[];
  projections: { x1: number; y1: number; x2: number; y2: number }[];
  ticks: TextBox[];
  axisLabels: TextBox[];
  shiftArrow: { x1: number; y1: number; x2: number; y2: number } | null;
  legend: TextBox[];
};
type Body = ProcessLayout | MatrixLayout | PyramidLayout | TimelineConceptLayout | CauseLayout | MarketLayout;

export type ConceptLayout = SceneLayout & {
  structure: ConceptStructureData["structure"];
  body: Body;
  takeaway: { rect: Rect; kicker: TextBox; text: TextBox } | null;
};

const shift = (box: TextBox, dx: number, dy: number): TextBox => ({ ...box, x: box.x + dx, y: box.y + dy, rect: { ...box.rect, x: box.rect.x + dx, y: box.rect.y + dy } });

/* ───────── Süreç ───────── */

function layoutProcess(place: TextPlacer, items: ConceptItem[], area: Rect, portrait: boolean, density: number, showDetail: boolean): ProcessLayout {
  const n = items.length;
  const gap = 18;
  const labelLines = density >= 2 ? 2 : 3;
  const detailLines = portrait ? (density >= 2 ? 1 : density >= 1 ? 2 : 3) : density >= 2 ? 3 : density >= 1 ? 4 : 6;
  const boxes: ProcessLayout["boxes"] = [];
  const arrows: ProcessLayout["arrows"] = [];
  const build = (x: number, y: number, w: number, item: ConceptItem, index: number) => {
    const label = place(`process${index}-label`, item.label, x + 34, y + 8, { maxWidth: w - 42, maxLines: labelLines, fontSize: 12.5, minFontSize: 10, weight: 700 });
    const detail = showDetail && item.detail ? place(`process${index}-detail`, item.detail, x + 34, label.rect.y + label.rect.h + 3, { maxWidth: w - 42, maxLines: detailLines, fontSize: 10.5, minFontSize: 9 }) : null;
    const h = Math.max(32, (detail ?? label).rect.y + (detail ?? label).rect.h + 8 - y);
    return { label, detail, h };
  };
  if (portrait) {
    let y = area.y;
    items.forEach((item, index) => {
      const built = build(area.x, y, area.w, item, index);
      const rect = { x: area.x, y, w: area.w, h: built.h };
      boxes.push({ rect, number: { x: rect.x + 16, y: rect.y + 16, n: index + 1 }, label: built.label, detail: built.detail, color: CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]! });
      if (index > 0) arrows.push({ x1: area.x + area.w / 2, y1: y - gap + 2, x2: area.x + area.w / 2, y2: y - 3 });
      y += built.h + gap;
    });
    const texts = boxes.flatMap((box) => [box.label, ...(box.detail ? [box.detail] : [])]);
    return { kind: "process", boxes, arrows, texts, segments: arrows.map((arrow, index) => segment(`process-arrow${index}`, arrow.x1, arrow.y1, arrow.x2, arrow.y2)), markers: [], height: y - gap - area.y };
  }
  // Yatay: 4'e kadar tek satır, fazlası yılan biçiminde iki satır (ikinci satır sağdan sola).
  const perRow = n <= 4 ? n : Math.ceil(n / 2);
  const rowsCount = Math.ceil(n / perRow);
  const w = (area.w - gap * (perRow - 1)) / perRow;
  const built = items.map((item, index) => build(0, 0, w, item, index));
  const rowH = Array.from({ length: rowsCount }, (_, r) => Math.max(...built.slice(r * perRow, (r + 1) * perRow).map((item) => item.h)));
  let y = area.y;
  const rowTop: number[] = [];
  for (let r = 0; r < rowsCount; r += 1) {
    rowTop.push(y);
    y += rowH[r]! + gap + 6;
  }
  items.forEach((_, index) => {
    const r = Math.floor(index / perRow);
    const c = index % perRow;
    const col = r % 2 === 0 ? c : perRow - 1 - c;
    const x = area.x + col * (w + gap);
    const rect = { x, y: rowTop[r]!, w, h: rowH[r]! };
    const label = shift(built[index]!.label, x, rect.y);
    const detail = built[index]!.detail ? shift(built[index]!.detail!, x, rect.y) : null;
    boxes.push({ rect, number: { x: x + 16, y: rect.y + 16, n: index + 1 }, label, detail, color: CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]! });
  });
  for (let index = 1; index < boxes.length; index += 1) {
    const a = boxes[index - 1]!.rect;
    const b = boxes[index]!.rect;
    if (Math.abs(a.y - b.y) < 1) {
      const leftToRight = b.x > a.x;
      const y0 = a.y + Math.min(a.h, b.h) / 2;
      arrows.push(leftToRight ? { x1: a.x + a.w + 2, y1: y0, x2: b.x - 3, y2: y0 } : { x1: a.x - 2, y1: y0, x2: b.x + b.w + 3, y2: y0 });
    } else {
      const x0 = a.x + a.w / 2;
      arrows.push({ x1: x0, y1: a.y + a.h + 2, x2: x0, y2: b.y - 3 });
    }
  }
  const texts = boxes.flatMap((box) => [box.label, ...(box.detail ? [box.detail] : [])]);
  return { kind: "process", boxes, arrows, texts, segments: arrows.map((arrow, index) => segment(`process-arrow${index}`, arrow.x1, arrow.y1, arrow.x2, arrow.y2)), markers: [], height: y - gap - 6 - area.y };
}

/* ───────── Matris ───────── */

function layoutMatrix(place: TextPlacer, data: ConceptStructureData, rowsIn: ConceptStructureData["comparisonRows"], area: Rect, portrait: boolean, density: number): MatrixLayout {
  const valueCols = Math.max(data.columns.length, ...rowsIn.map((row) => row.values.length));
  const labelW = Math.round(area.w * (portrait ? 0.28 : 0.24));
  // Sütun genişliği içeriğe göre (uzun hücreli sütun daha geniş, her sütun payının en az yarısı).
  const longest = Array.from({ length: valueCols }, (_, c) => Math.max(1, ...[data.columns[c] ?? "", ...rowsIn.map((row) => row.values[c] ?? "")].map((text) => measureText(text, 12, 500))));
  const weights = longest.map((width) => Math.sqrt(width));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((weight) => Math.max(0.5 / valueCols, weight / weightSum));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const colWs = shares.map((share) => ((area.w - labelW) * share) / shareSum);
  const colX = colWs.map((_, c) => area.x + labelW + colWs.slice(0, c).reduce((a, b) => a + b, 0));
  const lines = density >= 2 ? 3 : density >= 1 ? 5 : 7;
  const pad = 6;
  const heads: MatrixLayout["heads"] = [];
  let y = area.y;
  if (data.columns.length) {
    const texts = Array.from({ length: valueCols }, (_, c) =>
      place(`matrix-head${c}`, data.columns[c] ?? "", colX[c]! + colWs[c]! / 2, y + pad, { maxWidth: colWs[c]! - pad * 2, maxLines: 2, fontSize: 11.5, minFontSize: 9.5, weight: 800, anchor: "middle" }),
    );
    const h = Math.max(...texts.map((text) => text.rect.h)) + pad * 2;
    texts.forEach((text, c) => heads.push({ rect: { x: colX[c]!, y, w: colWs[c]!, h }, text }));
    y += h;
  }
  const rows: MatrixLayout["rows"] = rowsIn.map((row, r) => {
    const label = place(`matrix-row${r}-label`, row.label, area.x + pad, y + pad, { maxWidth: labelW - pad * 2, maxLines: lines, fontSize: 11.5, minFontSize: 9.5, weight: 700 });
    const cells = Array.from({ length: valueCols }, (_, c) => {
      const text = place(`matrix-row${r}-cell${c}`, row.values[c] ?? "—", colX[c]! + pad, y + pad, { maxWidth: colWs[c]! - pad * 2, maxLines: lines, fontSize: 11, minFontSize: 9 });
      return { text, highlight: row.highlight === c };
    });
    const h = Math.max(label.rect.h, ...cells.map((cell) => cell.text.rect.h)) + pad * 2;
    const out = {
      rect: { x: area.x, y, w: area.w, h },
      label,
      cells: cells.map((cell, c) => ({ ...cell, rect: { x: colX[c]!, y, w: colWs[c]!, h } })),
    };
    y += h;
    return out;
  });
  const table = { x: area.x, y: area.y, w: area.w, h: y - area.y };
  const segments: Segment[] = [];
  rows.forEach((row, index) => segments.push(segment(`matrix-hline${index}`, area.x + 2, row.rect.y, area.x + area.w - 2, row.rect.y)));
  for (let c = 0; c < valueCols; c += 1) segments.push(segment(`matrix-vline${c}`, colX[c]!, area.y + 2, colX[c]!, y - 2));
  const texts = [...heads.map((head) => head.text), ...rows.flatMap((row) => [row.label, ...row.cells.map((cell) => cell.text)])].filter((box) => box.lines.join("").length > 0);
  return { kind: "matrix", table, heads, rows, texts, segments, markers: [], height: y - area.y };
}

/* ───────── Piramit ───────── */

function layoutPyramid(place: TextPlacer, items: ConceptItem[], area: Rect, portrait: boolean, density: number, showDetail: boolean): PyramidLayout {
  const n = items.length;
  const pyramidW = Math.round(area.w * (portrait ? 0.46 : 0.42));
  const labelX = area.x + pyramidW + 18;
  const labelW = area.x + area.w - labelX;
  const lines = density >= 2 ? 2 : 3;
  const detailLines = density >= 2 ? 1 : 2;
  const blocks = items.map((item, index) => {
    const label = place(`pyramid${index}-label`, item.label, labelX, 0, { maxWidth: labelW, maxLines: lines, fontSize: 12.5, minFontSize: 10, weight: 700 });
    const detail = showDetail && item.detail ? place(`pyramid${index}-detail`, item.detail, labelX, label.rect.h + 2, { maxWidth: labelW, maxLines: detailLines, fontSize: 10.5, minFontSize: 9 }) : null;
    return { label, detail, h: label.rect.h + (detail ? detail.rect.h + 2 : 0) };
  });
  const layerH = Math.max(34, ...blocks.map((block) => block.h + 8));
  const height = layerH * n;
  const apexX = area.x + pyramidW / 2;
  const halfAt = (y: number) => ((y - area.y) / height) * (pyramidW / 2);
  const layers: PyramidLayout["layers"] = items.map((_, index) => {
    const y0 = area.y + layerH * index;
    const y1 = y0 + layerH;
    const top = Math.max(index === 0 ? 0 : 6, halfAt(y0));
    const bottom = halfAt(y1);
    const points: [number, number][] = [
      [apexX - top, y0 + 1.5],
      [apexX + top, y0 + 1.5],
      [apexX + bottom, y1 - 1.5],
      [apexX - bottom, y1 - 1.5],
    ];
    const block = blocks[index]!;
    const textTop = y0 + (layerH - block.h) / 2;
    const label = shift(block.label, 0, textTop);
    const detail = block.detail ? shift(block.detail, 0, textTop) : null;
    const midY = (y0 + y1) / 2;
    const edgeX = apexX + (top + bottom) / 2;
    return { points, color: CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]!, label, detail, leader: [edgeX + 3, midY, labelX - 5, midY] };
  });
  const texts = layers.flatMap((layer) => [layer.label, ...(layer.detail ? [layer.detail] : [])]);
  // Kılavuz çizgisi yazının satır aralığından geçebilir: yazı bloğunun soluna kadar, yazıya değmez.
  const segments = layers.map((layer, index) => segment(`pyramid-leader${index}`, layer.leader[0], layer.leader[1], layer.leader[2], layer.leader[3]));
  return { kind: "pyramid", layers, texts, segments, markers: [], height };
}

/* ───────── Zaman çizelgesi ───────── */

function layoutTimelineConcept(place: TextPlacer, items: ConceptItem[], area: Rect, portrait: boolean, density: number, showDetail: boolean): TimelineConceptLayout {
  const stops: TimelineConceptLayout["stops"] = [];
  const detailLines = density >= 2 ? 1 : 2;
  if (portrait) {
    const lineX = area.x + 10;
    const textX = lineX + 18;
    const textW = area.x + area.w - textX;
    let y = area.y;
    items.forEach((item, index) => {
      const date = item.date ? place(`timeline${index}-date`, item.date, textX, y, { maxWidth: textW, maxLines: 1, fontSize: 11.5, weight: 800, single: true }) : null;
      const label = place(`timeline${index}-label`, item.label, textX, (date ? date.rect.y + date.rect.h + 1 : y), { maxWidth: textW, maxLines: density >= 2 ? 2 : 3, fontSize: 12.5, minFontSize: 10, weight: 700 });
      const detail = showDetail && item.detail ? place(`timeline${index}-detail`, item.detail, textX, label.rect.y + label.rect.h + 2, { maxWidth: textW, maxLines: detailLines, fontSize: 10.5, minFontSize: 9 }) : null;
      stops.push({ x: lineX, y: y + 8, date, label, detail });
      y = (detail ?? label).rect.y + (detail ?? label).rect.h + 12;
    });
    const axis = { x1: lineX, y1: area.y + 2, x2: lineX, y2: y - 12 };
    const texts = stops.flatMap((stop) => [...(stop.date ? [stop.date] : []), stop.label, ...(stop.detail ? [stop.detail] : [])]);
    return { kind: "timeline", axis, stops, texts, segments: [segment("timeline-axis", axis.x1, axis.y1, axis.x2, axis.y2)], markers: [], height: y - 12 - area.y };
  }
  const n = items.length;
  const spacing = area.w / n;
  const dates = items.map((item, index) => (item.date ? place(`timeline${index}-date`, item.date, area.x + spacing * index + spacing / 2, area.y, { maxWidth: spacing - 8, maxLines: 2, fontSize: 11.5, minFontSize: 9.5, weight: 800, anchor: "middle" }) : null));
  const dateH = Math.max(0, ...dates.map((date) => date?.rect.h ?? 0));
  const lineY = area.y + dateH + 10;
  items.forEach((item, index) => {
    const x = area.x + spacing * index + spacing / 2;
    const label = place(`timeline${index}-label`, item.label, x, lineY + 10, { maxWidth: spacing - 8, maxLines: density >= 2 ? 2 : 3, fontSize: 12, minFontSize: 9.5, weight: 700, anchor: "middle" });
    const detail = showDetail && item.detail ? place(`timeline${index}-detail`, item.detail, x, label.rect.y + label.rect.h + 2, { maxWidth: spacing - 8, maxLines: detailLines + 1, fontSize: 10.5, minFontSize: 9, anchor: "middle" }) : null;
    stops.push({ x, y: lineY, date: dates[index] ?? null, label, detail });
  });
  const bottom = Math.max(...stops.map((stop) => (stop.detail ?? stop.label).rect.y + (stop.detail ?? stop.label).rect.h));
  const axis = { x1: area.x, y1: lineY, x2: area.x + area.w, y2: lineY };
  const texts = stops.flatMap((stop) => [...(stop.date ? [stop.date] : []), stop.label, ...(stop.detail ? [stop.detail] : [])]);
  return { kind: "timeline", axis, stops, texts, segments: [segment("timeline-axis", axis.x1, axis.y1, axis.x2, axis.y2)], markers: [], height: bottom - area.y };
}

/* ───────── Neden-sonuç ───────── */

/** Bağın ucu: kimlik, etiket ya da 1'den sıra numarası. */
function itemIndex(items: ConceptItem[], ref: string): number {
  const key = foldTr(ref);
  const byId = items.findIndex((item) => item.id !== undefined && foldTr(item.id) === key);
  if (byId >= 0) return byId;
  const byLabel = items.findIndex((item) => foldTr(item.label) === key);
  if (byLabel >= 0) return byLabel;
  const n = Number(ref);
  return Number.isInteger(n) && n >= 1 && n <= items.length ? n - 1 : -1;
}

/** Bağları çözer ve her öğeye katman verir (en uzun yol); döngüdeki geri bağ atılır. Bağ yoksa sıralı zincir. */
export function causeGraph(items: ConceptItem[], links: ConceptStructureData["links"]): { layer: number[]; edges: { from: number; to: number; effect: "increase" | "decrease" | null }[] } {
  let edges = links
    .map((link) => ({ from: itemIndex(items, link.from), to: itemIndex(items, link.to), effect: link.effect ?? null }))
    .filter((edge) => edge.from >= 0 && edge.to >= 0 && edge.from !== edge.to);
  if (!edges.length) edges = items.slice(1).map((_, index) => ({ from: index, to: index + 1, effect: null }));
  const layer = items.map(() => 0);
  // Döngüye karşı: kaynaktan büyük sıralı hedefe ya da daha önce görülmemiş bağ (en çok n tur).
  const kept: typeof edges = [];
  for (const edge of edges) {
    const reach = (from: number, target: number, seen = new Set<number>()): boolean =>
      from === target || kept.some((other) => other.from === from && !seen.has(other.to) && reach(other.to, target, new Set(seen).add(other.to)));
    if (!reach(edge.to, edge.from)) kept.push(edge);
  }
  for (let round = 0; round < items.length; round += 1) for (const edge of kept) layer[edge.to] = Math.max(layer[edge.to]!, layer[edge.from]! + 1);
  return { layer, edges: kept };
}

function layoutCause(place: TextPlacer, data: ConceptStructureData, items: ConceptItem[], area: Rect, portrait: boolean, density: number, showDetail: boolean): CauseLayout {
  const graph = causeGraph(items, data.links);
  const layerCount = Math.max(...graph.layer) + 1;
  const groups = Array.from({ length: layerCount }, (_, l) => items.map((_, index) => index).filter((index) => graph.layer[index] === l));
  const lane = 12;
  const labelLines = density >= 2 ? 2 : 3;
  const nodes: CauseLayout["nodes"] = items.map(() => ({ rect: { x: 0, y: 0, w: 0, h: 0 }, label: null as never, detail: null, layer: 0 }));
  let height = 0;
  if (portrait) {
    // Katmanlar satır satır; katman atlayan bağ soldaki şeritten.
    const inner = { x: area.x + lane, w: area.w - lane };
    const gapRow = 22;
    let y = area.y;
    groups.forEach((group, l) => {
      const colW = (inner.w - 10 * (group.length - 1)) / group.length;
      const built = group.map((index, k) => {
        const x = inner.x + k * (colW + 10);
        const label = place(`cause${index}-label`, items[index]!.label, x + colW / 2, y + 8, { maxWidth: colW - 14, maxLines: labelLines, fontSize: 12, minFontSize: 10, weight: 700, anchor: "middle" });
        const detail = showDetail && items[index]!.detail ? place(`cause${index}-detail`, items[index]!.detail!, x + colW / 2, label.rect.y + label.rect.h + 2, { maxWidth: colW - 14, maxLines: density >= 1 ? 1 : 2, fontSize: 10.5, minFontSize: 9, anchor: "middle" }) : null;
        return { index, x, label, detail, h: (detail ?? label).rect.y + (detail ?? label).rect.h + 8 - y };
      });
      const rowH = Math.max(...built.map((item) => item.h));
      for (const item of built) nodes[item.index] = { rect: { x: item.x, y, w: colW, h: rowH }, label: item.label, detail: item.detail, layer: l };
      y += rowH + gapRow;
    });
    height = y - gapRow - area.y;
  } else {
    // Katmanlar sütun sütun; katman atlayan bağ üstteki şeritten.
    const top = area.y + lane;
    const gapCol = 26;
    const colW = (area.w - gapCol * (layerCount - 1)) / layerCount;
    let tallest = 0;
    const columns = groups.map((group, l) => {
      const x = area.x + l * (colW + gapCol);
      let y = top;
      const built = group.map((index) => {
        const label = place(`cause${index}-label`, items[index]!.label, x + colW / 2, y + 8, { maxWidth: colW - 14, maxLines: labelLines, fontSize: 12, minFontSize: 10, weight: 700, anchor: "middle" });
        const detail = showDetail && items[index]!.detail ? place(`cause${index}-detail`, items[index]!.detail!, x + colW / 2, label.rect.y + label.rect.h + 2, { maxWidth: colW - 14, maxLines: density >= 1 ? 2 : 3, fontSize: 10.5, minFontSize: 9, anchor: "middle" }) : null;
        const h = (detail ?? label).rect.y + (detail ?? label).rect.h + 8 - y;
        const out = { index, x, y, h, label, detail };
        y += h + 12;
        return out;
      });
      tallest = Math.max(tallest, y - 12 - top);
      return built;
    });
    // Her sütun dikeyde ortalanır.
    columns.forEach((built, l) => {
      const used = built.length ? built[built.length - 1]!.y + built[built.length - 1]!.h - top : 0;
      const dy = (tallest - used) / 2;
      for (const item of built) nodes[item.index] = { rect: { x: item.x, y: item.y + dy, w: colW, h: item.h }, label: shift(item.label, 0, dy), detail: item.detail ? shift(item.detail, 0, dy) : null, layer: l };
    });
    height = lane + tallest;
  }
  // Katman aralıkları (kutusuz boşluklar): bağlar yalnız bu boşluklardan ve kenar şeridinden geçer, kutuya değmez.
  const layerEdge = (l: number, side: "start" | "end") => {
    const rects = nodes.filter((node) => node.layer === l).map((node) => node.rect);
    return portrait
      ? side === "end" ? Math.max(...rects.map((r) => r.y + r.h)) : Math.min(...rects.map((r) => r.y))
      : side === "end" ? Math.max(...rects.map((r) => r.x + r.w)) : Math.min(...rects.map((r) => r.x));
  };
  const gapMid = (l: number) => (layerEdge(l, "end") + layerEdge(l + 1, "start")) / 2;
  const edges: CauseLayout["edges"] = graph.edges.map((edge) => {
    const a = nodes[edge.from]!.rect;
    const b = nodes[edge.to]!.rect;
    const from = nodes[edge.from]!.layer;
    const to = nodes[edge.to]!.layer;
    if (portrait) {
      const after = gapMid(from);
      if (to - from === 1) return { effect: edge.effect, points: [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, after], [b.x + b.w / 2, after], [b.x + b.w / 2, b.y - 2]] };
      const laneX = area.x + 4;
      const before = gapMid(to - 1);
      return { effect: edge.effect, points: [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, after], [laneX, after], [laneX, before], [b.x + b.w / 2, before], [b.x + b.w / 2, b.y - 2]] };
    }
    const after = gapMid(from);
    if (to - from === 1) return { effect: edge.effect, points: [[a.x + a.w, a.y + a.h / 2], [after, a.y + a.h / 2], [after, b.y + b.h / 2], [b.x - 2, b.y + b.h / 2]] };
    const laneY = area.y + 4;
    const before = gapMid(to - 1);
    return { effect: edge.effect, points: [[a.x + a.w, a.y + a.h / 2], [after, a.y + a.h / 2], [after, laneY], [before, laneY], [before, b.y + b.h / 2], [b.x - 2, b.y + b.h / 2]] };
  });
  const texts = nodes.flatMap((node) => [node.label, ...(node.detail ? [node.detail] : [])]);
  const segments = edges.flatMap((edge, e) => edge.points.slice(1).map((point, index) => segment(`cause-edge${e}-${index}`, edge.points[index]![0], edge.points[index]![1], point[0], point[1])));
  return { kind: "cause_effect", nodes, edges, texts, segments, markers: [], height };
}

/* ───────── Arz-talep ───────── */

function layoutMarket(place: TextPlacer, data: ConceptStructureData, area: Rect, portrait: boolean, technical: boolean): MarketLayout {
  const market = data.market ?? {};
  const legendTexts = [
    `S: ${market.supplyLabel ?? "Arz"}`,
    `D: ${market.demandLabel ?? "Talep"}`,
    ...(market.equilibrium ? [`E: ${market.equilibrium}`] : []),
    ...(market.shift ? [`${market.shift.curve === "supply" ? "S′" : "D′"}: ${market.shift.label ?? (market.shift.curve === "supply" ? "Arz kayar" : "Talep kayar")}`] : []),
  ];
  const legendW = portrait ? area.w : Math.round(area.w * 0.36);
  const legendX = portrait ? area.x : area.x + area.w - legendW;
  const probe = legendTexts.map((text, index) => place(`market-legend${index}`, text, legendX, 0, { maxWidth: legendW, maxLines: 2, fontSize: 11.5, minFontSize: 9.5, weight: 600 }));
  const legendH = probe.reduce((sum, box) => sum + box.rect.h + 6, -6);
  const plotArea: Rect = portrait ? { x: area.x, y: area.y, w: area.w, h: Math.max(160, Math.min(area.w * 0.95, area.h - legendH - 14)) } : { x: area.x, y: area.y, w: area.w - legendW - 18, h: area.h };
  const legendY = portrait ? plotArea.y + plotArea.h + 14 : area.y + Math.max(0, (area.h - legendH) / 2);
  let cursor = legendY;
  const legend = probe.map((box) => {
    const out = shift(box, 0, cursor);
    cursor += box.rect.h + 6;
    return out;
  });
  const axisLabelY = place("market-axis-y", market.priceLabel ?? "Fiyat (P)", plotArea.x, plotArea.y, { maxWidth: plotArea.w * 0.5, maxLines: 1, fontSize: 10.5, weight: 700, single: true });
  const axisLabelX = place("market-axis-x", market.quantityLabel ?? "Miktar (Q)", plotArea.x + plotArea.w, 0, { maxWidth: plotArea.w * 0.5, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "end", single: true });
  const tickW = place("probe", "P′", 0, 0, { maxWidth: 40, maxLines: 1, fontSize: 10.5, weight: 700, single: true }).rect.w;
  const ox = plotArea.x + tickW + 10;
  const top = axisLabelY.rect.y + axisLabelY.rect.h + 8;
  const oy = plotArea.y + plotArea.h - axisLabelX.rect.h - 22;
  const axisX = { ...axisLabelX, y: plotArea.y + plotArea.h - axisLabelX.rect.h, rect: { ...axisLabelX.rect, y: plotArea.y + plotArea.h - axisLabelX.rect.h } };
  const right = plotArea.x + plotArea.w - 16;
  const plot: Rect = { x: ox, y: top, w: right - ox, h: oy - top };
  // Eğriler: talep sol üstten sağ alta, arz sol alttan sağ üste; kayma genişliğin %20'si.
  const shiftDx = market.shift ? plot.w * 0.24 * (market.shift.direction === "right" ? 1 : -1) : 0;
  const inset = 0.1;
  const line = (id: "S" | "D" | "S2" | "D2", dx: number) => {
    const supply = id === "S" || id === "S2";
    const x1 = plot.x + plot.w * (inset + 0.12) + dx;
    const x2 = plot.x + plot.w * (1 - inset - 0.12) + dx;
    const y1 = supply ? plot.y + plot.h * (1 - inset) : plot.y + plot.h * inset;
    const y2 = supply ? plot.y + plot.h * inset : plot.y + plot.h * (1 - inset);
    return { x1, y1, x2, y2 };
  };
  const curveDefs: { id: "S" | "D" | "S2" | "D2"; dx: number; dashed: boolean; text: string }[] = [
    { id: "S", dx: 0, dashed: false, text: "S" },
    { id: "D", dx: 0, dashed: false, text: "D" },
  ];
  if (market.shift) curveDefs.push(market.shift.curve === "supply" ? { id: "S2", dx: shiftDx, dashed: true, text: "S′" } : { id: "D2", dx: shiftDx, dashed: true, text: "D′" });
  const curves = curveDefs.map((def) => {
    const l = line(def.id, def.dx);
    const tag = place(`market-curve-${def.id}`, def.text, l.x2 + 4, 0, { maxWidth: 30, maxLines: 1, fontSize: 12, weight: 800, single: true });
    const ty = l.y2 - tag.rect.h / 2;
    return { id: def.id, ...l, dashed: def.dashed, tag: { ...tag, y: ty, rect: { ...tag.rect, y: ty } } };
  });
  const intersect = (a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) => {
    const d = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
    const t = ((a.x1 - b.x1) * (b.y1 - b.y2) - (a.y1 - b.y1) * (b.x1 - b.x2)) / d;
    return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) };
  };
  const byId = (id: string) => curves.find((curve) => curve.id === id)!;
  const pairs: { id: "E" | "E2"; s: string; d: string }[] = [{ id: "E", s: "S", d: "D" }];
  if (market.shift) pairs.push({ id: "E2", s: market.shift.curve === "supply" ? "S2" : "S", d: market.shift.curve === "supply" ? "D" : "D2" });
  const raw = pairs.map((pair) => ({ id: pair.id, ...intersect(byId(pair.s), byId(pair.d)) }));
  const projections = raw.flatMap((p) => [
    { x1: p.x, y1: p.y, x2: p.x, y2: oy },
    { x1: p.x, y1: p.y, x2: ox, y2: p.y },
  ]);
  // Kayma oku: eğrinin üst kısmında iki eğri arasında yatay.
  const moved = market.shift ? byId(market.shift.curve === "supply" ? "S2" : "D2") : null;
  const base = market.shift ? byId(market.shift.curve === "supply" ? "S" : "D") : null;
  let shiftArrow: MarketLayout["shiftArrow"] = null;
  if (moved && base) {
    const yAt = base.y1 + (base.y2 - base.y1) * 0.18;
    const xAt = (c: typeof base) => c.x1 + ((yAt - c.y1) / (c.y2 - c.y1)) * (c.x2 - c.x1);
    const xa = xAt(base);
    const xb = xAt(moved);
    const dir = Math.sign(xb - xa);
    shiftArrow = { x1: xa + dir * 5, y1: yAt, x2: xb - dir * 6, y2: yAt };
  }
  const segments: Segment[] = [
    segment("market-axis-y", ox, top - 4, ox, oy),
    segment("market-axis-x", ox, oy, right + 8, oy),
    ...curves.map((curve) => segment(`market-curve-${curve.id}`, curve.x1, curve.y1, curve.x2, curve.y2)),
    ...projections.map((p, index) => segment(`market-proj${index}`, p.x1, p.y1, p.x2, p.y2)),
    ...(shiftArrow ? [segment("market-shift", shiftArrow.x1, shiftArrow.y1, shiftArrow.x2, shiftArrow.y2)] : []),
  ];
  // Denge harfleri çizgisiz bir yere: noktanın çevresindeki adaylardan çizgiye ve öbür yazıya değmeyen ilki.
  const placed: TextBox[] = [axisLabelY, axisX, ...curves.map((curve) => curve.tag), ...legend];
  const dots = raw.map((q) => ({ x: q.x - 4, y: q.y - 4, w: 8, h: 8 }));
  const free = (box: TextBox) =>
    !segments.some((seg) => segmentHitsRect(seg, box.rect)) && !placed.some((other) => rectsOverlap(other.rect, box.rect, 1)) && !dots.some((dot) => rectsOverlap(dot, box.rect, 1));
  const points = raw.map((p) => {
    const tag = place(`market-point-${p.id}`, p.id === "E" ? "E" : "E′", 0, 0, { maxWidth: 30, maxLines: 1, fontSize: 12, weight: 800, single: true });
    const { w, h } = tag.rect;
    const spots: [number, number][] = [];
    for (const d of [8, 12, 16, 22]) spots.push([-w / 2, -d - h], [d, -h / 2], [-d - w, -h / 2], [d * 0.7, d * 0.7], [-d * 0.7 - w, d * 0.7], [d * 0.7, -d * 0.7 - h], [-d * 0.7 - w, -d * 0.7 - h], [-w / 2, d]);
    const candidates = spots.map(([dx, dy]) => shift({ ...tag, anchor: "start" as const }, p.x + dx, p.y + dy));
    const box = candidates.find(free) ?? candidates[0]!;
    placed.push(box);
    return { id: p.id, x: p.x, y: p.y, tag: box };
  });
  // P/Q işaretleri teknik düzeyde; birbirine binecek ikinci işaret çizilmez.
  const ticks: TextBox[] = [];
  if (technical) {
    points.forEach((p, index) => {
      const suffix = index === 0 ? "*" : "′";
      const pyRaw = place(`market-tick-p${index}`, `P${suffix}`, ox - 5, 0, { maxWidth: tickW + 4, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "end", single: true });
      const py = { ...pyRaw, y: p.y - pyRaw.rect.h / 2, rect: { ...pyRaw.rect, y: p.y - pyRaw.rect.h / 2 } };
      const qx = place(`market-tick-q${index}`, `Q${suffix}`, p.x, oy + 4, { maxWidth: 30, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "middle", single: true });
      for (const box of [py, qx]) {
        if (ticks.some((other) => rectsOverlap(other.rect, box.rect, 1)) || placed.some((other) => rectsOverlap(other.rect, box.rect, 1))) continue;
        ticks.push(box);
      }
    });
  }
  const texts = [axisLabelY, axisX, ...curves.map((curve) => curve.tag), ...points.map((p) => p.tag), ...ticks, ...legend];
  const markers = points.map((p) => ({ id: `market-point-${p.id}`, rect: { x: p.x - 4, y: p.y - 4, w: 8, h: 8 } }));
  const height = portrait ? cursor - 6 - area.y : area.h;
  return { kind: "supply_demand", plot, axes: { x: ox, y: oy, right: right + 8, top: top - 4 }, curves, points, projections, ticks, axisLabels: [axisLabelY, axisX], shiftArrow, legend, texts, segments, markers, height };
}

/* ───────── Sahne yerleşimi ───────── */

export function layoutConceptStructure(data: ConceptStructureData, frame: SceneFrame, domain?: AcademicDomain): ConceptLayout {
  const { content } = frame;
  const place = textPlacer(frame);
  const technical = isTechnical(frame);
  const showDetail = frame.text.density !== "simple";
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Kavram"} · ${CONCEPT_STRUCTURE_LABEL[data.structure]}`;
  const header = layoutHeader(frame, data.title, badge);
  const top = header.bottom + 14;
  const bottom = content.y + content.h;

  // Etiket bütçesi: önce öğeler (en az 2 kalır), sonra akılda tut kutusu düşer.
  const [itemN, rowN, takeawayN] = labelBudget(frame.text.maxLabels, [
    { count: data.items.length, keep: 2 },
    { count: data.comparisonRows.length, keep: 2 },
    { count: data.takeaway ? 1 : 0, keep: 0 },
  ]);
  const items = data.items.slice(0, itemN);
  const rows = data.comparisonRows.slice(0, rowN);
  const takeawayText = takeawayN ? data.takeaway : undefined;

  const pad = 10;
  const kickerProbe = takeawayText ? place("takeaway-kicker", "AKILDA TUT", 0, 0, { maxWidth: content.w, maxLines: 1, fontSize: 9.5, weight: 800, single: true }) : null;
  const takeawayFor = (lines: number) =>
    takeawayText ? place("takeaway-text", takeawayText, content.x + pad, 0, { maxWidth: content.w - pad * 2, maxLines: lines, fontSize: 12, minFontSize: 10, weight: 600 }) : null;

  // Yoğunluk 3: açıklamalar çizimden düşer (ad kalır), en son akılda tut kutusu düşer; yazı tabanın altına inmez.
  const bodyFor = (area: Rect, density: number): Body => {
    const detail = showDetail && density < 3;
    switch (data.structure) {
      case "process":
        return layoutProcess(place, items, area, frame.portrait, Math.min(density, 2), detail);
      case "matrix":
        return layoutMatrix(place, data, rows, area, frame.portrait, Math.min(density, 2));
      case "pyramid":
        return layoutPyramid(place, items, area, frame.portrait, Math.min(density, 2), detail);
      case "timeline":
        return layoutTimelineConcept(place, items, area, frame.portrait, Math.min(density, 2), detail);
      case "cause_effect":
        return layoutCause(place, data, items, area, frame.portrait, Math.min(density, 2), detail);
      case "supply_demand":
        return layoutMarket(place, data, area, frame.portrait, technical);
    }
  };

  // Yoğunluk: gövde + akılda tut kutusu alana sığana kadar satırlar azalır.
  let density = 0;
  let takeawayLines = frame.portrait ? 3 : 2;
  let keepTakeaway = true;
  const measure = () => {
    const take = keepTakeaway ? takeawayFor(takeawayLines) : null;
    const takeH = take && kickerProbe ? pad + kickerProbe.rect.h + 4 + take.rect.h + pad : 0;
    const area = { x: content.x, y: top, w: content.w, h: bottom - top - (takeH ? takeH + 12 : 0) };
    return { take, takeH, area, body: bodyFor(area, density) };
  };
  let measured = measure();
  while (measured.body.height > measured.area.h && (density < 3 || takeawayLines > 1 || (keepTakeaway && measured.take))) {
    if (density < 2) density += 1;
    else if (takeawayLines > 1) takeawayLines -= 1;
    else if (density < 3) density += 1;
    else keepTakeaway = false;
    measured = measure();
  }
  // Gövde dikeyde ortalanır (arz-talep alanı zaten doldurur).
  const free = Math.max(0, measured.area.h - measured.body.height);
  const area = { ...measured.area, y: measured.area.y + Math.round(free * 0.45) };
  const body = bodyFor(area, density);
  let takeaway: ConceptLayout["takeaway"] = null;
  const texts: TextBox[] = [...header.texts, ...body.texts];
  if (measured.take && kickerProbe) {
    const rect = { x: content.x, y: bottom - measured.takeH, w: content.w, h: measured.takeH };
    const kicker = shift(kickerProbe, content.x + pad, rect.y + pad);
    const text = shift(measured.take, 0, rect.y + pad + kickerProbe.rect.h + 4);
    takeaway = { rect, kicker, text };
    texts.push(kicker, text);
  }
  return { frame, texts, segments: body.segments, markers: body.markers, structure: data.structure, body, takeaway };
}

/* ───────── Çizim ───────── */

function points(list: [number, number][]): string {
  return list.map(([x, y], index) => `${index ? "L" : "M"}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ");
}

function BodyView({ body, id, numberFont }: { body: Body; id: (name: string) => string; numberFont: number }) {
  switch (body.kind) {
    case "process":
      return (
        <g data-structure="process">
          {body.arrows.map((arrow, index) => (
            <line key={`a${index}`} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke={CONCEPT_COLORS.accent} strokeWidth={2} markerEnd={`url(#${id("arrow-accent")})`} pathLength={1} className="cp-vs-draw" style={delay(0.5 + index * 0.25, 0.35)} />
          ))}
          {body.boxes.map((box, index) => (
            <g key={index} className="cp-vs-fade" style={delay(0.3 + index * 0.25)} data-step={index + 1}>
              <rect x={box.rect.x} y={box.rect.y} width={box.rect.w} height={box.rect.h} rx={10} fill={CONCEPT_COLORS.panel} stroke={box.color} strokeWidth={1.6} />
              <circle cx={box.number.x} cy={box.number.y} r={10} fill={box.color} />
              <text x={box.number.x} y={box.number.y + numberFont * 0.36} fontSize={numberFont} fontWeight={800} textAnchor="middle" fill={CONCEPT_COLORS.bg}>
                {box.number.n}
              </text>
              <SceneText box={box.label} fill={CONCEPT_COLORS.text} />
              {box.detail ? <SceneText box={box.detail} fill={CONCEPT_COLORS.muted} /> : null}
            </g>
          ))}
        </g>
      );
    case "matrix":
      return (
        <g data-structure="matrix" className="cp-vs-fade" style={delay(0.3)}>
          <rect x={body.table.x} y={body.table.y} width={body.table.w} height={body.table.h} rx={10} fill={CONCEPT_COLORS.panel} stroke={CONCEPT_COLORS.stroke} />
          {body.heads.map((head, index) => (
            <g key={`h${index}`}>
              <rect x={head.rect.x} y={head.rect.y} width={head.rect.w} height={head.rect.h} fill={CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]} fillOpacity={0.16} />
              <SceneText box={head.text} fill={CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]!} />
            </g>
          ))}
          {body.rows.map((row, r) => (
            <g key={`r${r}`} data-row={r}>
              {r > 0 || body.heads.length ? <line x1={row.rect.x + 2} y1={row.rect.y} x2={row.rect.x + row.rect.w - 2} y2={row.rect.y} stroke={CONCEPT_COLORS.stroke} /> : null}
              <SceneText box={row.label} fill={CONCEPT_COLORS.text} />
              {row.cells.map((cell, c) => (
                <g key={c} data-highlight={cell.highlight ? "1" : undefined}>
                  {cell.highlight ? <rect x={cell.rect.x + 2} y={cell.rect.y + 2} width={cell.rect.w - 4} height={cell.rect.h - 4} rx={6} fill={CONCEPT_COLORS.highlight} fillOpacity={0.16} stroke={CONCEPT_COLORS.highlight} strokeWidth={1.2} /> : null}
                  <SceneText box={cell.text} fill={cell.highlight ? CONCEPT_COLORS.highlight : CONCEPT_COLORS.muted} />
                </g>
              ))}
            </g>
          ))}
          {body.rows[0]
            ? body.rows[0].cells.map((cell, c) => (
                <line key={`v${c}`} x1={cell.rect.x} y1={body.table.y + 2} x2={cell.rect.x} y2={body.table.y + body.table.h - 2} stroke={CONCEPT_COLORS.stroke} />
              ))
            : null}
        </g>
      );
    case "pyramid":
      return (
        <g data-structure="pyramid">
          {body.layers.map((layer, index) => (
            <g key={index} className="cp-vs-fade" style={delay(0.3 + index * 0.22)} data-layer={index}>
              <path d={`${points(layer.points)} z`} fill={layer.color} fillOpacity={0.22} stroke={layer.color} strokeWidth={1.6} />
              <line x1={layer.leader[0]} y1={layer.leader[1]} x2={layer.leader[2]} y2={layer.leader[3]} stroke={layer.color} strokeWidth={1} strokeDasharray="3 3" />
              <SceneText box={layer.label} fill={CONCEPT_COLORS.text} />
              {layer.detail ? <SceneText box={layer.detail} fill={CONCEPT_COLORS.muted} /> : null}
            </g>
          ))}
        </g>
      );
    case "timeline":
      return (
        <g data-structure="timeline">
          <line x1={body.axis.x1} y1={body.axis.y1} x2={body.axis.x2} y2={body.axis.y2} stroke={CONCEPT_COLORS.accent} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(0.3, 0.9)} />
          {body.stops.map((stop, index) => (
            <g key={index} className="cp-vs-fade" style={delay(0.5 + index * 0.18)} data-stop={index}>
              <circle cx={stop.x} cy={stop.y} r={5} fill={CONCEPT_COLORS.bg} stroke={CONCEPT_COLORS.steps[index % CONCEPT_COLORS.steps.length]} strokeWidth={2.4} />
              {stop.date ? <SceneText box={stop.date} fill={CONCEPT_COLORS.accent} /> : null}
              <SceneText box={stop.label} fill={CONCEPT_COLORS.text} />
              {stop.detail ? <SceneText box={stop.detail} fill={CONCEPT_COLORS.muted} /> : null}
            </g>
          ))}
        </g>
      );
    case "cause_effect":
      return (
        <g data-structure="cause_effect">
          {body.edges.map((edge, index) => {
            const color = edge.effect === "increase" ? CONCEPT_COLORS.up : edge.effect === "decrease" ? CONCEPT_COLORS.down : CONCEPT_COLORS.accent;
            const marker = edge.effect === "increase" ? "up" : edge.effect === "decrease" ? "down" : "accent";
            return (
              <path
                key={index}
                d={points(edge.points)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                markerEnd={`url(#${id(`arrow-${marker}`)})`}
                pathLength={1}
                className="cp-vs-draw"
                style={delay(0.7 + index * 0.15, 0.5)}
                data-effect={edge.effect ?? "neutral"}
              />
            );
          })}
          {body.nodes.map((node, index) => (
            <g key={index} className="cp-vs-fade" style={delay(0.3 + node.layer * 0.3)} data-cause={index} data-layer={node.layer}>
              <rect x={node.rect.x} y={node.rect.y} width={node.rect.w} height={node.rect.h} rx={10} fill={CONCEPT_COLORS.panel} stroke={CONCEPT_COLORS.steps[node.layer % CONCEPT_COLORS.steps.length]} strokeWidth={1.6} />
              <SceneText box={node.label} fill={CONCEPT_COLORS.text} />
              {node.detail ? <SceneText box={node.detail} fill={CONCEPT_COLORS.muted} /> : null}
            </g>
          ))}
        </g>
      );
    case "supply_demand":
      return (
        <g data-structure="supply_demand">
          <line x1={body.axes.x} y1={body.axes.y} x2={body.axes.x} y2={body.axes.top} stroke={CONCEPT_COLORS.muted} strokeWidth={1.6} markerEnd={`url(#${id("arrow-muted")})`} className="cp-vs-fade" style={delay(0.2)} />
          <line x1={body.axes.x} y1={body.axes.y} x2={body.axes.right} y2={body.axes.y} stroke={CONCEPT_COLORS.muted} strokeWidth={1.6} markerEnd={`url(#${id("arrow-muted")})`} className="cp-vs-fade" style={delay(0.2)} />
          {body.axisLabels.map((box) => (
            <SceneText key={box.id} box={box} fill={CONCEPT_COLORS.muted} className="cp-vs-fade" style={delay(0.3)} />
          ))}
          {body.projections.map((p, index) => (
            <line key={`p${index}`} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={CONCEPT_COLORS.muted} strokeWidth={1} strokeDasharray="4 3" className="cp-vs-fade" style={delay(1.6)} />
          ))}
          {body.curves.map((curve, index) => {
            const color = curve.id.startsWith("S") ? CONCEPT_COLORS.supply : CONCEPT_COLORS.demand;
            return (
              <g key={curve.id} data-curve={curve.id}>
                <line x1={curve.x1} y1={curve.y1} x2={curve.x2} y2={curve.y2} stroke={color} strokeWidth={curve.dashed ? 2.2 : 3} strokeDasharray={curve.dashed ? "7 4" : undefined} strokeLinecap="round" pathLength={curve.dashed ? undefined : 1} className={curve.dashed ? "cp-vs-fade" : "cp-vs-draw"} style={delay(0.5 + index * 0.35, 0.7)} />
                <SceneText box={curve.tag} fill={color} className="cp-vs-fade" style={delay(0.9 + index * 0.35)} />
              </g>
            );
          })}
          {body.shiftArrow ? (
            <line x1={body.shiftArrow.x1} y1={body.shiftArrow.y1} x2={body.shiftArrow.x2} y2={body.shiftArrow.y2} stroke={CONCEPT_COLORS.highlight} strokeWidth={2.2} markerEnd={`url(#${id("arrow-highlight")})`} className="cp-vs-fade" style={delay(1.7)} data-shift="1" />
          ) : null}
          {body.points.map((p, index) => (
            <g key={p.id} className="cp-vs-fade" style={delay(1.4 + index * 0.3)} data-point={p.id}>
              <circle cx={p.x} cy={p.y} r={4.5} fill={CONCEPT_COLORS.highlight} stroke={CONCEPT_COLORS.bg} strokeWidth={1.5} />
              <SceneText box={p.tag} fill={CONCEPT_COLORS.highlight} />
            </g>
          ))}
          {body.ticks.map((box) => (
            <SceneText key={box.id} box={box} fill={CONCEPT_COLORS.text} className="cp-vs-fade" style={delay(1.8)} />
          ))}
          {body.legend.map((box) => (
            <SceneText key={box.id} box={box} fill={CONCEPT_COLORS.text} className="cp-vs-fade" style={delay(2)} />
          ))}
        </g>
      );
  }
}

export function ConceptStructureScene({ data, domain, ...common }: SceneCommonProps & { data: ConceptStructureData; domain?: AcademicDomain }) {
  const layout = layoutConceptStructure(data, common.frame, domain);
  const id = useSceneIds("concept");
  const [badge, title] = layout.texts;
  const summary = data.items.length ? data.items.map((item) => item.label).join(" → ") : data.comparisonRows.map((row) => row.label).join(", ");
  return (
    <SceneSvg {...common} label={`${data.title}: ${summary || CONCEPT_STRUCTURE_LABEL[data.structure]}`} archetype="CONCEPT_STRUCTURE_VISUALIZER" background={CONCEPT_COLORS.bg}>
      <ArrowDefs id={id} colors={{ accent: CONCEPT_COLORS.accent, up: CONCEPT_COLORS.up, down: CONCEPT_COLORS.down, muted: CONCEPT_COLORS.muted, highlight: CONCEPT_COLORS.highlight }} />
      <SceneBadge box={badge!} color={CONCEPT_COLORS.accent} textColor={CONCEPT_COLORS.accent} />
      <SceneText box={title!} fill={CONCEPT_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />
      <BodyView body={layout.body} id={id} numberFont={layout.frame.text.floor} />
      {layout.takeaway ? (
        <g data-section="takeaway" className="cp-vs-fade" style={delay(2.2)}>
          <rect x={layout.takeaway.rect.x} y={layout.takeaway.rect.y} width={layout.takeaway.rect.w} height={layout.takeaway.rect.h} rx={12} fill={CONCEPT_COLORS.highlight} fillOpacity={0.1} stroke={CONCEPT_COLORS.highlight} strokeWidth={1.2} />
          <SceneText box={layout.takeaway.kicker} fill={CONCEPT_COLORS.highlight} />
          <SceneText box={layout.takeaway.text} fill={CONCEPT_COLORS.text} />
        </g>
      ) : null}
    </SceneSvg>
  );
}
