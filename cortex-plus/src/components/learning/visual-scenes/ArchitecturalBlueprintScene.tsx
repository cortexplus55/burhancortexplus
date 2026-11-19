"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, foldTr, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  inflate,
  isTechnical,
  labelBudget,
  layoutHeader,
  rectsOverlap,
  segment,
  textPlacer,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import {
  BLUEPRINT_KIND_LABEL,
  blueprintKindOf,
  blueprintView,
  type BlueprintData,
  type BlueprintKind,
  type BlueprintMaterial,
  type BlueprintView,
} from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * ARCHITECTURE_SPATIAL_BLUEPRINT (Mimarlık, İç Mimarlık, İnşaat, Sanat Tarihi): teknik pafta ızgarası üstünde
 * veriden kurulan çizim (20 Kasım 2026). Eskiden her sahne aynı üç aks, iki kat ve beşik çatıydı; şimdi geometri
 * `elements[]` türlerinden (kolon, kiriş, döşeme, duvar, açıklık, kemer, kubbe, tonoz, çatı, temel, merdiven, cephe),
 * sayılarından ve biçiminden, görünüş `viewType`'tan (görünüş, kesit, plan, şema) kurulur.
 *
 * Kesitte kesilen eleman taranır (poché), görünüşte yalnız dış çizgi; katman dizilimi (`layers[]`) kesitte duvarın
 * bantlarına, şemada katman detayına dönüşür. Numaralı pin hedef öğenin üstüne oturur (`calloutPins[].target` ya da
 * göreli konum). Kot işaretleri ve ölçü çentikleri yalnız teknik düzeyde (üniversite, uzmanlık).
 */

export const BLUEPRINT_THEMES = {
  night: { bg: "#0a1f44", grid: "#14306a", gridMajor: "#1b3d82", line: "#dbe8ff", soft: "#8fb0e8", hatch: "#9fbcf0", pin: "#ffd166", pinText: "#0a1f44", text: "#f1f6ff", muted: "#a9c1ea", light: "#ffd166", load: "#ff8fa3", panel: "#0e2754" },
  paper: { bg: "#f5f8fc", grid: "#e1e9f5", gridMajor: "#cdd9ec", line: "#1d3b8b", soft: "#5a77bd", hatch: "#3d5aa6", pin: "#e8590c", pinText: "#ffffff", text: "#0f1f44", muted: "#3d4f78", light: "#d97706", load: "#c2255c", panel: "#eaf0f9" },
} as const;

const PIN_R = 10;
const BUBBLE_R = 10;

export type BlueprintFill = "cut" | BlueprintMaterial | "glass-pane" | "tint" | null;

/** Çizimin bir parçası: SVG yolu, kaplanan kutu ve dolgusu (kesitte "cut" = tarama). */
export type BlueprintShape = {
  key: string;
  kind: BlueprintKind | "layer" | "ground" | "outline";
  element: number | null;
  layer: number | null;
  d: string;
  rect: Rect;
  fill: BlueprintFill;
  tone: "line" | "soft";
  width: number;
  dash?: string;
  /** İç içe yollar (plandaki duvar halkası) çift-tek kuralıyla doldurulur. */
  evenodd?: boolean;
};

export type BlueprintAnchor = { x: number; y: number; rect: Rect };

export type BlueprintLayout = SceneLayout & {
  view: BlueprintView;
  tag: TextBox;
  drawing: Rect;
  shapes: BlueprintShape[];
  /** Aks balonu ve aks çizgisinin bittiği yer (dikey aksta y, yatayda x). */
  axes: { x: number; y: number; label: string; to: number }[];
  kots: { x: number; y: number; label: TextBox }[];
  dimension: { x1: number; x2: number; y: number; label: TextBox | null; ticks: number[] } | null;
  flows: { kind: "load" | "light"; x1: number; y1: number; x2: number; y2: number }[];
  pins: { n: number; x: number; y: number; target: string | null }[];
  legend: { n: number; pinX: number; pinY: number; label: TextBox; role: TextBox | null }[];
};

const r1 = (value: number) => Math.round(value * 10) / 10;
const rectPath = (r: Rect) => `M${r1(r.x)},${r1(r.y)} h${r1(r.w)} v${r1(r.h)} h${r1(-r.w)} z`;
const bboxOf = (points: [number, number][]): Rect => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
const polyPath = (points: [number, number][], close = true) =>
  points.map(([x, y], index) => `${index ? "L" : "M"}${r1(x)},${r1(y)}`).join(" ") + (close ? " z" : "");
const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

/** Kalınlık metnindeki ilk sayı (orantılı bant için); yoksa null. */
function thicknessValue(text: string | undefined): number | null {
  const match = text?.replace(",", ".").match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Yay (dairesel) yolu: sol ve sağ ayak, tepe yüksekliği; sivri kemerde iki yay tepede buluşur. */
function archPath(x1: number, x2: number, base: number, rise: number, pointed: boolean): string {
  const span = x2 - x1;
  const mid = (x1 + x2) / 2;
  if (pointed) {
    // Sivri kemer: iki yay tepede açıyla buluşur (yarıçap açıklığa yakın, yarım kirişten büyük).
    const radius = Math.max(Math.hypot(span / 2, rise) / 2 + 0.5, span * 0.85);
    return `M${r1(x1)},${r1(base)} A${r1(radius)},${r1(radius)} 0 0 1 ${r1(mid)},${r1(base - rise)} A${r1(radius)},${r1(radius)} 0 0 1 ${r1(x2)},${r1(base)}`;
  }
  const radius = (span * span) / 4 / rise / 2 + rise / 2;
  return `M${r1(x1)},${r1(base)} A${r1(radius)},${r1(radius)} 0 0 1 ${r1(x2)},${r1(base)}`;
}

type Geometry = {
  shapes: BlueprintShape[];
  axes: BlueprintLayout["axes"];
  kotLevels: { y: number; label: string }[];
  kotX: number;
  ground: number | null;
  dimension: { x1: number; x2: number; y: number; ticks: number[] } | null;
  flows: BlueprintLayout["flows"];
  /** Eleman sırası → çizimdeki yeri (pin buraya oturur). */
  elementAnchors: Map<number, BlueprintAnchor>;
  layerAnchors: Map<number, BlueprintAnchor>;
  /** Eleman hedefi bulunamazsa sırayla kullanılan genel noktalar. */
  spare: BlueprintAnchor[];
  /** Kalınlık yazıları (katman detayında, teknik düzeyde). */
  notes: { x: number; y: number; text: string; tickX1: number; tickX2: number }[];
};

type Ctx = {
  data: BlueprintData;
  view: BlueprintView;
  drawing: Rect;
  technical: boolean;
  /** Kot gösterimi: none | ground | all. */
  kot: "none" | "ground" | "all";
  kotLabelW: number;
  dimLabelH: number;
};

/** Kesitte varsayılan olarak kesilen (taranan) türler; elemanın `cut` alanı bunu değiştirir. */
const CUT_KINDS = new Set<BlueprintKind>(["wall", "slab", "beam", "foundation", "roof", "vault", "dome", "facade"]);

function elementsOf(data: BlueprintData) {
  return data.elements.map((element, index) => ({ element, index, kind: element.kind }));
}

/* ───────── Görünüş ve kesit ───────── */

function buildingGeometry(ctx: Ctx): Geometry {
  const { data, view, drawing } = ctx;
  const section = view === "section";
  const els = elementsOf(data);
  const ofKind = (kind: BlueprintKind) => els.filter((item) => item.kind === kind);
  const first = (kind: BlueprintKind) => ofKind(kind)[0];
  const shapes: BlueprintShape[] = [];
  const elementAnchors = new Map<number, BlueprintAnchor>();
  const flows: BlueprintLayout["flows"] = [];
  const wallT = section ? 8 : 4;
  const cutFill = (item: { element: { cut?: boolean } } | undefined, kind: BlueprintKind): BlueprintFill =>
    section && (item?.element.cut ?? CUT_KINDS.has(kind)) ? "cut" : null;
  const layered = section && data.layers.length >= 2;
  const wallLeftT = layered ? 16 : wallT;

  const left = drawing.x + (ctx.kot === "none" ? 18 : ctx.kotLabelW + 22);
  const right = drawing.x + drawing.w - (first("facade") ? 24 : 18);
  const axisCount = clampInt(first("column")?.element.count ?? (first("column") ? 3 : 2), 2, 6);
  const floors = clampInt(first("slab")?.element.count ?? (first("slab") ? 2 : 1), 1, 4);
  const bubbleZone = BUBBLE_R * 2 + 8;
  const dimZone = ctx.dimLabelH ? ctx.dimLabelH + 16 : ctx.technical ? 14 : 8;
  const footZone = first("foundation") ? 12 : 6;
  const ground = drawing.y + drawing.h - dimZone - footZone;
  const dome = first("dome");
  const vault = first("vault");
  const roof = first("roof");
  const roofVariant = roof?.element.variant === "flat" || roof?.element.variant === "shed" ? roof.element.variant : roof ? "gable" : null;
  const spanW = right - left;
  const bodyMax = ground - (drawing.y + bubbleZone);
  const roofH = vault
    ? Math.min(spanW * 0.2, bodyMax * 0.28)
    : dome
      ? Math.min(spanW * 0.22, bodyMax * 0.32)
      : roofVariant === "gable" || roofVariant === "shed"
        ? Math.min(bodyMax * 0.22, 46)
        : 6;
  const eaves = drawing.y + bubbleZone + roofH + (dome ? 8 : 0);
  const floorH = (ground - eaves) / floors;
  const levels = Array.from({ length: floors + 1 }, (_, index) => ground - floorH * index);
  const axes = Array.from({ length: axisCount }, (_, index) => left + wallLeftT / 2 + ((right - wallT / 2 - (left + wallLeftT / 2)) * index) / (axisCount - 1));
  const bays = axisCount - 1;
  const bayW = (axes[axisCount - 1]! - axes[0]!) / bays;

  // Zemin (kesitte toprak taraması)
  shapes.push({ key: "ground", kind: "ground", element: null, layer: null, d: `M${r1(drawing.x + 4)},${r1(ground)} H${r1(drawing.x + drawing.w - 4)}`, rect: { x: drawing.x + 4, y: ground, w: drawing.w - 8, h: 0 }, fill: null, tone: "line", width: 2 });
  if (section) {
    const soil = { x: drawing.x + 4, y: ground, w: drawing.w - 8, h: footZone - 2 };
    shapes.push({ key: "soil", kind: "ground", element: null, layer: null, d: rectPath(soil), rect: soil, fill: "soil", tone: "soft", width: 0 });
  }

  // Dış duvarlar (yapının dış çizgisi hep çizilir; `wall` elemanı varsa pini sol duvara oturur)
  const wallTop = eaves;
  const wallL: Rect = { x: left, y: wallTop, w: wallLeftT, h: ground - wallTop };
  const wallR: Rect = { x: right - wallT, y: wallTop, w: wallT, h: ground - wallTop };
  const wall = first("wall");
  if (layered) {
    const values = data.layers.map((layer) => thicknessValue(layer.thickness));
    const known = values.every((value) => value !== null);
    const total = known ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : data.layers.length;
    let x = wallL.x;
    data.layers.forEach((layer, index) => {
      const w = (wallL.w * (known ? (values[index] ?? 1) : 1)) / total;
      const strip = { x, y: wallL.y, w, h: wallL.h };
      shapes.push({ key: `wall-layer${index}`, kind: "layer", element: wall?.index ?? null, layer: index, d: rectPath(strip), rect: strip, fill: layer.materialKind ?? "cut", tone: "line", width: 0.8 });
      x += w;
    });
  } else {
    shapes.push({ key: "wall-left", kind: "wall", element: wall?.index ?? null, layer: null, d: rectPath(wallL), rect: wallL, fill: cutFill(wall, "wall"), tone: "line", width: 1.2 });
  }
  shapes.push({ key: "wall-right", kind: "wall", element: null, layer: null, d: rectPath(wallR), rect: wallR, fill: cutFill(wall, "wall"), tone: "line", width: 1.2 });
  if (wall) elementAnchors.set(wall.index, { x: wallL.x + wallL.w / 2, y: wallTop + (ground - wallTop) * 0.62, rect: wallL });

  // Kolonlar: iç akslarda (dış akslar duvarın içinde)
  const columns = ofKind("column");
  const interior = axes.slice(1, -1);
  if (columns.length) {
    interior.forEach((x, index) => {
      const cut = cutFill(columns[0], "column") === "cut";
      const r = { x: x - (cut ? 3.5 : 2.5), y: eaves, w: cut ? 7 : 5, h: ground - eaves };
      shapes.push({ key: `column${index}`, kind: "column", element: columns[0]!.index, layer: null, d: rectPath(r), rect: r, fill: cut ? "cut" : null, tone: "line", width: section && !cut ? 1 : 1.4 });
    });
    columns.forEach((item, k) => {
      const axisIndex = interior.length ? Math.min(interior.length - 1, k) + 1 : 0;
      const x = axes[axisIndex]!;
      const y = (levels[Math.min(1, floors)]! + levels[0]!) / 2 - (floors > 1 ? floorH * 0.1 : 0);
      elementAnchors.set(item.index, { x, y, rect: { x: x - 4, y: eaves, w: 8, h: ground - eaves } });
    });
  }

  // Döşemeler: her kat seviyesinde (en üst, düz çatıda çatı döşemesi)
  const slab = first("slab");
  const slabT = 5;
  if (slab) {
    for (let f = 1; f <= floors; f += 1) {
      const y = levels[f]!;
      const r = { x: left, y: y - slabT / 2, w: right - left, h: slabT };
      shapes.push({ key: `slab${f}`, kind: "slab", element: slab.index, layer: null, d: rectPath(r), rect: r, fill: cutFill(slab, "slab"), tone: "line", width: 1 });
    }
    const y = levels[Math.min(1, floors)]!;
    elementAnchors.set(slab.index, { x: axes[0]! + bayW * (bays > 1 ? 1.5 : 0.55), y, rect: { x: left, y: y - slabT / 2, w: right - left, h: slabT } });
  }

  // Kirişler: kesitte döşemenin altında aks başına kesik dikdörtgen, görünüşte akslar arası bant
  const beam = first("beam");
  if (beam) {
    for (let f = 1; f <= floors; f += 1) {
      const y = levels[f]! + slabT / 2;
      if (section) {
        axes.forEach((x, index) => {
          const r = { x: x - 5, y, w: 10, h: 7 };
          shapes.push({ key: `beam${f}-${index}`, kind: "beam", element: beam.index, layer: null, d: rectPath(r), rect: r, fill: cutFill(beam, "beam"), tone: "line", width: 0.8 });
        });
      } else {
        for (let b = 0; b < bays; b += 1) {
          const r = { x: axes[b]! + 3, y, w: bayW - 6, h: 6 };
          shapes.push({ key: `beam${f}-${b}`, kind: "beam", element: beam.index, layer: null, d: rectPath(r), rect: r, fill: null, tone: "line", width: 1 });
        }
      }
    }
    const y = levels[Math.min(1, floors)]! + slabT / 2 + 3.5;
    const x = section ? axes[Math.min(1, axes.length - 1)]! : axes[0]! + bayW / 2;
    elementAnchors.set(beam.index, { x, y, rect: { x: x - bayW / 2, y: y - 4, w: bayW, h: 8 } });
  }

  // Açıklıklar: pencere elemanı katlara, kapı elemanı zemin kata (ikisi ayrı eleman olabilir); kemer varsa üstü kemerli.
  const openings = ofKind("opening");
  const windowEl = openings.find((item) => item.element.variant !== "door");
  const doorEl = openings.find((item) => item.element.variant === "door");
  const arch = first("arch");
  const pointed = arch?.element.variant === "pointed";
  const openingPath = (rect: Rect) =>
    arch
      ? `M${r1(rect.x)},${r1(rect.y + rect.h)} V${r1(rect.y + rect.w * 0.5)} ${archPath(rect.x, rect.x + rect.w, rect.y + rect.w * 0.5, rect.w * (pointed ? 0.62 : 0.5), pointed).replace(/^M[^A]+/, "")} V${r1(rect.y + rect.h)} z`
      : rectPath(rect);
  if (section) {
    // Kesitte açıklık sağ dış duvarın içinden geçer: katlarda pencere, zeminde kapı boşluğu.
    let windowRect: Rect | null = null;
    for (let f = 0; f < floors; f += 1) {
      const isDoor = Boolean(doorEl) && f === 0;
      if (!isDoor && !windowEl) continue;
      const bottom = isDoor ? levels[0]! : levels[f]! - floorH * 0.28;
      const top = levels[f]! - floorH * (isDoor ? 0.78 : 0.76);
      const r = { x: wallR.x - 1, y: top, w: wallR.w + 2, h: bottom - top };
      const owner = isDoor ? doorEl! : windowEl!;
      shapes.push({ key: `opening${f}`, kind: "opening", element: owner.index, layer: null, d: rectPath(r), rect: r, fill: "glass-pane", tone: "line", width: 1 });
      if (isDoor) elementAnchors.set(owner.index, { x: r.x + r.w / 2, y: r.y + r.h / 2, rect: r });
      else windowRect = r;
    }
    if (windowEl && windowRect) elementAnchors.set(windowEl.index, { x: windowRect.x + windowRect.w / 2, y: windowRect.y + windowRect.h / 2, rect: windowRect });
  } else {
    const w = Math.min(bayW * 0.46, 46);
    const doorCount = doorEl ? clampInt(doorEl.element.count ?? 1, 1, bays) : 0;
    const doorStart = Math.floor((bays - doorCount) / 2);
    const isDoorBay = (b: number) => b >= doorStart && b < doorStart + doorCount;
    let windowRect: Rect | null = null;
    let doorRect: Rect | null = null;
    if (doorEl) {
      for (let b = doorStart; b < doorStart + doorCount; b += 1) {
        const cx = axes[b]! + bayW / 2;
        const rect = { x: cx - w / 2, y: levels[0]! - floorH * 0.8, w, h: floorH * 0.8 };
        shapes.push({ key: `door${b}`, kind: "opening", element: doorEl.index, layer: null, d: openingPath(rect), rect, fill: "glass-pane", tone: "line", width: 1.2 });
        doorRect ??= rect;
      }
      if (doorRect) elementAnchors.set(doorEl.index, { x: doorRect.x + doorRect.w / 2, y: doorRect.y + doorRect.h * 0.55, rect: doorRect });
    }
    if (windowEl) {
      const perFloor = clampInt(windowEl.element.count ?? bays, 1, bays);
      const startBay = Math.floor((bays - perFloor) / 2);
      for (let f = 0; f < floors; f += 1) {
        for (let b = startBay; b < startBay + perFloor; b += 1) {
          if (f === 0 && isDoorBay(b)) continue;
          const cx = axes[b]! + bayW / 2;
          const top = levels[f]! - floorH * 0.74;
          const rect = { x: cx - w / 2, y: top, w, h: floorH * 0.48 };
          shapes.push({ key: `opening${f}-${b}`, kind: "opening", element: windowEl.index, layer: null, d: openingPath(rect), rect, fill: "glass-pane", tone: "line", width: 1.1 });
          if (f === floors - 1 && b === startBay) windowRect = rect;
        }
      }
      if (windowRect) elementAnchors.set(windowEl.index, { x: windowRect.x + windowRect.w / 2, y: windowRect.y + windowRect.h / 2, rect: windowRect });
    }
  }
  const opening = windowEl ?? doorEl;
  if (arch && !opening) {
    // Revak: zemin katta akslar arası kemer dizisi
    const spring = levels[0]! - floorH * 0.5;
    const rise = Math.min(bayW * (pointed ? 0.62 : 0.5), floorH * 0.42);
    let middle: Rect | null = null;
    for (let b = 0; b < bays; b += 1) {
      const x1 = axes[b]! + 4;
      const x2 = axes[b + 1]! - 4;
      const rect = { x: x1, y: spring - rise, w: x2 - x1, h: rise + (levels[0]! - spring) };
      shapes.push({ key: `arch${b}`, kind: "arch", element: arch.index, layer: null, d: `M${r1(x1)},${r1(levels[0]!)} V${r1(spring)} ${archPath(x1, x2, spring, rise, pointed).replace(/^M[^A]+/, "")} V${r1(levels[0]!)}`, rect, fill: null, tone: "line", width: 1.3 });
      if (b === Math.floor(bays / 2)) middle = rect;
    }
    if (middle) elementAnchors.set(arch.index, { x: middle.x + middle.w / 2, y: middle.y + middle.h * 0.18, rect: middle });
  } else if (arch && opening) {
    const anchor = elementAnchors.get(opening.index);
    if (anchor) elementAnchors.set(arch.index, { x: anchor.x, y: anchor.rect.y + 6, rect: anchor.rect });
  }

  // Örtü: kubbe, tonoz ya da çatı
  const topSlab = { x: left - 2, y: eaves - slabT / 2, w: right - left + 4, h: slabT };
  if (vault) {
    const pointedVault = vault.element.variant === "pointed";
    const rect = { x: left, y: eaves - roofH, w: right - left, h: roofH };
    const d = cutFill(vault, "vault") ? sectionArc(left, right, eaves, roofH, 5, pointedVault) : archPath(left, right, eaves, roofH, pointedVault);
    shapes.push({ key: "vault", kind: "vault", element: vault.index, layer: null, d, rect, fill: cutFill(vault, "vault"), tone: "line", width: 1.4 });
    elementAnchors.set(vault.index, { x: (left + right) / 2, y: eaves - roofH * 0.55, rect });
  } else if (roofVariant === "gable" || roofVariant === "shed") {
    const over = 8;
    const apex = roofVariant === "gable" ? (left + right) / 2 : right + over;
    const points: [number, number][] =
      roofVariant === "gable"
        ? [[left - over, eaves], [apex, eaves - roofH], [right + over, eaves]]
        : [[left - over, eaves - roofH], [right + over, eaves]];
    const rect = bboxOf(points);
    if (cutFill(roof, "roof")) {
      const t = 5;
      const poly: [number, number][] =
        roofVariant === "gable"
          ? [[left - over, eaves], [apex, eaves - roofH], [right + over, eaves], [right + over - t, eaves + 0.1], [apex, eaves - roofH + t * 1.6], [left - over + t, eaves + 0.1]]
          : [[left - over, eaves - roofH], [right + over, eaves], [right + over, eaves + t], [left - over, eaves - roofH + t]];
      shapes.push({ key: "roof", kind: "roof", element: roof!.index, layer: null, d: polyPath(poly), rect, fill: "cut", tone: "line", width: 1.2 });
    } else {
      shapes.push({ key: "roof", kind: "roof", element: roof!.index, layer: null, d: polyPath(points, false), rect, fill: null, tone: "line", width: 1.5 });
    }
    const mid: [number, number] = roofVariant === "gable" ? [(left - over + apex) / 2, eaves - roofH / 2] : [(left + right) / 2, eaves - roofH / 2];
    elementAnchors.set(roof!.index, { x: mid[0], y: mid[1] + 2, rect });
  } else {
    shapes.push({ key: "top-slab", kind: roof ? "roof" : "slab", element: roof?.index ?? null, layer: null, d: rectPath(topSlab), rect: topSlab, fill: cutFill(roof ?? slab, roof ? "roof" : "slab"), tone: "line", width: 1.2 });
    const parapet = { x: left - 2, y: eaves - 10, w: 4, h: 10 };
    const parapetR = { x: right - 2, y: eaves - 10, w: 4, h: 10 };
    shapes.push({ key: "parapet-left", kind: "outline", element: null, layer: null, d: rectPath(parapet), rect: parapet, fill: section ? "cut" : null, tone: "line", width: 1 });
    shapes.push({ key: "parapet-right", kind: "outline", element: null, layer: null, d: rectPath(parapetR), rect: parapetR, fill: section ? "cut" : null, tone: "line", width: 1 });
    if (roof) elementAnchors.set(roof.index, { x: (left + right) / 2, y: eaves, rect: topSlab });
  }
  if (dome) {
    const centerBays = bays >= 3 ? bays - 2 : bays;
    const radius = Math.min((bayW * centerBays) / 2, roofH - 4);
    const cx = (left + right) / 2;
    const base = eaves - (vault || roofVariant === "gable" || roofVariant === "shed" ? 0 : 8);
    const drum = { x: cx - radius, y: base - 8, w: radius * 2, h: 8 };
    shapes.push({ key: "dome-drum", kind: "dome", element: dome.index, layer: null, d: rectPath(drum), rect: drum, fill: cutFill(dome, "dome"), tone: "line", width: 1.1 });
    const pointedDome = dome.element.variant === "pointed";
    const rise = pointedDome ? radius * 1.15 : radius;
    const rect = { x: cx - radius, y: base - 8 - rise, w: radius * 2, h: rise };
    shapes.push({
      key: "dome",
      kind: "dome",
      element: dome.index,
      layer: null,
      d: cutFill(dome, "dome") ? sectionArc(cx - radius, cx + radius, base - 8, rise, 4.5, pointedDome) : archPath(cx - radius, cx + radius, base - 8, rise, pointedDome),
      rect,
      fill: cutFill(dome, "dome"),
      tone: "line",
      width: 1.4,
    });
    const finial = { x: cx - 0.5, y: rect.y - 8, w: 1, h: 8 };
    shapes.push({ key: "dome-finial", kind: "dome", element: dome.index, layer: null, d: `M${r1(cx)},${r1(rect.y)} V${r1(rect.y - 8)}`, rect: finial, fill: null, tone: "line", width: 1.2 });
    elementAnchors.set(dome.index, { x: cx, y: rect.y + rise * 0.45, rect });
  }

  // Temel: aks başına pabuç (kesitte taranır, görünüşte toprak altında kesik çizgi)
  const foundation = first("foundation");
  if (foundation) {
    axes.forEach((x, index) => {
      const r = { x: x - 12, y: ground + 1, w: 24, h: footZone - 3 };
      shapes.push({ key: `footing${index}`, kind: "foundation", element: foundation.index, layer: null, d: rectPath(r), rect: r, fill: cutFill(foundation, "foundation"), tone: section ? "line" : "soft", width: 1, ...(section ? {} : { dash: "3 2" }) });
    });
    const x = axes[Math.floor(axes.length / 2)]!;
    elementAnchors.set(foundation.index, { x, y: ground + footZone / 2, rect: { x: x - 12, y: ground, w: 24, h: footZone } });
  }

  // Merdiven: ilk açıklıkta zeminden ilk kata basamaklar
  const stair = first("stair");
  if (stair && floors >= 1) {
    const x0 = axes[0]! + bayW * 0.18;
    const x1 = axes[0]! + bayW * 0.82;
    const steps = 7;
    const rise = (levels[0]! - levels[1]!) * 0.92;
    const points: [number, number][] = [[x0, levels[0]!]];
    for (let s = 0; s < steps; s += 1) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = levels[0]! - (rise * (s + 1)) / steps;
      points.push([x, y], [x + (x1 - x0) / steps, y]);
    }
    const rect = bboxOf(points);
    shapes.push({ key: "stair", kind: "stair", element: stair.index, layer: null, d: polyPath(points, false), rect, fill: null, tone: "line", width: 1.2 });
    elementAnchors.set(stair.index, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + 4, rect });
  }

  // Cephe kaplaması: sağ duvarın dışında çift çizgi (kesitte ince kesik bant)
  const facade = first("facade");
  if (facade) {
    const r = { x: right + 2, y: eaves - 2, w: 4, h: ground - eaves + 2 };
    shapes.push({ key: "facade", kind: "facade", element: facade.index, layer: null, d: rectPath(r), rect: r, fill: cutFill(facade, "facade"), tone: "soft", width: 1, ...(section ? {} : { dash: "4 2" }) });
    elementAnchors.set(facade.index, { x: r.x + r.w / 2, y: levels[floors]! + floorH * 0.5, rect: r });
  }

  // Katman detayı kesitte duvar bantlarının üstünde: katman pinleri bantlara oturur.
  const layerAnchors = new Map<number, BlueprintAnchor>();
  for (const shape of shapes) {
    if (shape.kind === "layer" && shape.layer !== null) {
      layerAnchors.set(shape.layer, { x: shape.rect.x + shape.rect.w / 2, y: shape.rect.y + shape.rect.h * (0.25 + 0.12 * shape.layer), rect: shape.rect });
    }
  }

  // Yük ve ışık akışı
  const showLoad = data.flow === "load" || data.flow === "both";
  const showLight = data.flow === "light" || data.flow === "both";
  if (showLoad) {
    const topY = (dome ? eaves - roofH - 8 : roofVariant ? eaves - roofH : eaves - 10) - 4;
    for (const t of [0.22, 0.5, 0.78]) {
      const x = left + (right - left) * t;
      flows.push({ kind: "load", x1: x, y1: Math.max(drawing.y + bubbleZone - 4, topY - 16), x2: x, y2: Math.max(drawing.y + bubbleZone + 6, topY - 2) });
    }
  }
  if (showLight) {
    const target = opening ? elementAnchors.get(opening.index) : null;
    const tx = target ? target.rect.x + target.rect.w : right - wallT;
    const ty = target ? target.rect.y + 4 : levels[floors]! + floorH * 0.4;
    const startX = Math.min(tx + 24, drawing.x + drawing.w - 4);
    for (let i = 0; i < 3; i += 1) flows.push({ kind: "light", x1: startX, y1: ty - 18 + i * 7, x2: tx + 3, y2: ty + i * 6 });
  }

  // Kot seviyeleri
  const kotLevels: { y: number; label: string }[] = [];
  if (ctx.kot !== "none") {
    kotLevels.push({ y: ground, label: "±0.00" });
    if (ctx.kot === "all") for (let f = 1; f <= floors; f += 1) kotLevels.push({ y: levels[f]!, label: f === floors && !slab ? "Saçak" : `${f}. kat` });
  }

  const spare: BlueprintAnchor[] = [
    { x: axes[Math.floor(axes.length / 2)]!, y: (eaves + ground) / 2, rect: { x: left, y: eaves, w: right - left, h: ground - eaves } },
    { x: right - wallT / 2, y: eaves + floorH * 0.5, rect: wallR },
    { x: axes[0]! + bayW / 2, y: ground - floorH * 0.5, rect: { x: axes[0]!, y: ground - floorH, w: bayW, h: floorH } },
    { x: (left + right) / 2, y: eaves, rect: topSlab },
    { x: axes[axes.length - 1]! - bayW / 2, y: ground - floorH * 0.5, rect: { x: axes[axes.length - 2]!, y: ground - floorH, w: bayW, h: floorH } },
    { x: left + wallLeftT / 2, y: eaves + floorH * 0.5, rect: wallL },
  ];

  return {
    shapes,
    axes: axes.map((x, index) => ({ x, y: drawing.y + BUBBLE_R + 2, label: String.fromCharCode(65 + index), to: ground })),
    kotLevels,
    kotX: left,
    ground,
    dimension: { x1: left, x2: right, y: drawing.y + drawing.h - 6, ticks: ctx.technical ? axes : [] },
    flows,
    elementAnchors,
    layerAnchors,
    spare,
    notes: [],
  };
}

/** Kesitte kesilen kabuk (kubbe, tonoz): dış ve iç yay arası kapalı yol. */
function sectionArc(x1: number, x2: number, base: number, rise: number, t: number, pointed: boolean): string {
  const outer = archPath(x1, x2, base, rise, pointed);
  const innerRise = Math.max(2, rise - t);
  const span = x2 - x1 - t * 2;
  const mid = (x1 + x2) / 2;
  const radius = (span * span) / 4 / innerRise / 2 + innerRise / 2;
  const back = pointed
    ? `L${r1(x2 - t)},${r1(base)} A${r1(radius)},${r1(radius)} 0 0 0 ${r1(mid)},${r1(base - innerRise)} A${r1(radius)},${r1(radius)} 0 0 0 ${r1(x1 + t)},${r1(base)}`
    : `L${r1(x2 - t)},${r1(base)} A${r1(radius)},${r1(radius)} 0 0 0 ${r1(x1 + t)},${r1(base)}`;
  return `${outer} ${back} z`;
}

/* ───────── Plan ───────── */

function planGeometry(ctx: Ctx): Geometry {
  const { data, drawing } = ctx;
  const els = elementsOf(data);
  const first = (kind: BlueprintKind) => els.find((item) => item.kind === kind);
  const shapes: BlueprintShape[] = [];
  const elementAnchors = new Map<number, BlueprintAnchor>();
  const nx = clampInt(first("column")?.element.count ?? 3, 2, 6);
  const margin = BUBBLE_R * 2 + 10;
  const dimZone = ctx.dimLabelH ? ctx.dimLabelH + 16 : ctx.technical ? 14 : 8;
  const availW = drawing.w - margin - 22;
  const availH = drawing.h - margin - dimZone - 12;
  const ny = availH / Math.max(1, availW / (nx - 1)) >= 1.4 ? 3 : 2;
  const bay = Math.min(availW / (nx - 1), availH / (ny - 1));
  const gridW = bay * (nx - 1);
  const gridH = bay * (ny - 1);
  const x0 = drawing.x + margin + (availW - gridW) / 2;
  const y0 = drawing.y + margin + (availH - gridH) / 2;
  const xs = Array.from({ length: nx }, (_, index) => x0 + bay * index);
  const ys = Array.from({ length: ny }, (_, index) => y0 + bay * index);
  const wallT = 6;
  const outer = { x: x0 - wallT / 2, y: y0 - wallT / 2, w: gridW + wallT, h: gridH + wallT };
  const inner = inflate(outer, -wallT);
  const wall = first("wall");
  shapes.push({ key: "walls", kind: "wall", element: wall?.index ?? null, layer: null, d: `${rectPath(outer)} ${rectPath(inner)}`, rect: outer, fill: "cut", tone: "line", width: 1, evenodd: true });
  if (wall) elementAnchors.set(wall.index, { x: outer.x + wallT / 2, y: y0 + gridH * 0.62, rect: { x: outer.x, y: outer.y, w: wallT, h: outer.h } });

  const slab = first("slab");
  if (slab) {
    shapes.push({ key: "slab", kind: "slab", element: slab.index, layer: null, d: rectPath(inner), rect: inner, fill: "tint", tone: "soft", width: 0 });
    elementAnchors.set(slab.index, { x: xs[0]! + bay * 0.5, y: ys[ny - 1]! - bay * 0.42, rect: inner });
  }
  const beam = first("beam");
  if (beam) {
    const parts: string[] = [];
    for (const y of ys) parts.push(`M${r1(x0)},${r1(y)} H${r1(x0 + gridW)}`);
    for (const x of xs) parts.push(`M${r1(x)},${r1(y0)} V${r1(y0 + gridH)}`);
    shapes.push({ key: "beams", kind: "beam", element: beam.index, layer: null, d: parts.join(" "), rect: { x: x0, y: y0, w: gridW, h: gridH }, fill: null, tone: "soft", width: 1, dash: "5 3" });
    const x = xs[Math.floor(nx / 2)]! - bay / 2;
    elementAnchors.set(beam.index, { x, y: ys[Math.min(1, ny - 1)]!, rect: { x: x - bay / 2, y: ys[Math.min(1, ny - 1)]! - 3, w: bay, h: 6 } });
  }
  const column = first("column");
  if (column) {
    for (const x of xs) for (const y of ys) {
      const r = { x: x - 4, y: y - 4, w: 8, h: 8 };
      shapes.push({ key: `col${x}-${y}`, kind: "column", element: column.index, layer: null, d: rectPath(r), rect: r, fill: "cut", tone: "line", width: 1 });
    }
    const x = xs[Math.floor(nx / 2)]!;
    const y = ys[Math.floor(ny / 2)]!;
    elementAnchors.set(column.index, { x, y, rect: { x: x - 4, y: y - 4, w: 8, h: 8 } });
  }
  const foundation = first("foundation");
  if (foundation) {
    for (const x of xs) for (const y of ys) {
      const r = { x: x - 10, y: y - 10, w: 20, h: 20 };
      shapes.push({ key: `foot${x}-${y}`, kind: "foundation", element: foundation.index, layer: null, d: rectPath(r), rect: r, fill: null, tone: "soft", width: 0.9, dash: "3 2" });
    }
    elementAnchors.set(foundation.index, { x: xs[nx - 1]! - 0, y: ys[ny - 1]!, rect: { x: xs[nx - 1]! - 10, y: ys[ny - 1]! - 10, w: 20, h: 20 } });
  }
  // Plan: pencereler üst duvarda, kapılar alt duvarda (kanat yayıyla); ayrı elemanlar ayrı pin alır.
  const planOpenings = els.filter((item) => item.kind === "opening");
  const windowEl = planOpenings.find((item) => item.element.variant !== "door");
  const doorEl = planOpenings.find((item) => item.element.variant === "door");
  const opening = windowEl ?? doorEl;
  const gapW = Math.min(bay * 0.5, 40);
  if (windowEl) {
    const count = clampInt(windowEl.element.count ?? nx - 1, 1, nx - 1);
    let firstRect: Rect | null = null;
    for (let b = 0; b < count; b += 1) {
      const cx = xs[b]! + bay / 2;
      const r = { x: cx - gapW / 2, y: outer.y, w: gapW, h: wallT };
      shapes.push({ key: `window${b}`, kind: "opening", element: windowEl.index, layer: null, d: rectPath(r), rect: r, fill: "glass-pane", tone: "line", width: 1 });
      firstRect ??= r;
    }
    if (firstRect) elementAnchors.set(windowEl.index, { x: firstRect.x + firstRect.w / 2, y: firstRect.y + firstRect.h / 2, rect: firstRect });
  }
  if (doorEl) {
    const count = clampInt(doorEl.element.count ?? 1, 1, nx - 1);
    const start = Math.floor((nx - 1 - count) / 2);
    let firstRect: Rect | null = null;
    for (let b = start; b < start + count; b += 1) {
      const cx = xs[b]! + bay / 2;
      const y = outer.y + outer.h - wallT;
      const gap = { x: cx - gapW / 2, y, w: gapW, h: wallT };
      const leaf = `M${r1(gap.x)},${r1(y)} V${r1(y - gapW)} A${r1(gapW)},${r1(gapW)} 0 0 1 ${r1(gap.x + gapW)},${r1(y)}`;
      const rect = { x: gap.x, y: y - gapW, w: gapW, h: gapW + wallT };
      shapes.push({ key: `door${b}`, kind: "opening", element: doorEl.index, layer: null, d: `${rectPath(gap)} ${leaf}`, rect, fill: "glass-pane", tone: "line", width: 1 });
      firstRect ??= rect;
    }
    if (firstRect) elementAnchors.set(doorEl.index, { x: firstRect.x + firstRect.w * 0.6, y: firstRect.y + firstRect.h * 0.55, rect: firstRect });
  }
  const stair = first("stair");
  if (stair) {
    const cell = { x: xs[0]! + 6, y: ys[0]! + 6, w: bay - 12, h: Math.min(bay, gridH) - 12 };
    const parts: string[] = [rectPath(cell)];
    for (let s = 1; s < 7; s += 1) parts.push(`M${r1(cell.x + (cell.w * s) / 7)},${r1(cell.y)} V${r1(cell.y + cell.h)}`);
    parts.push(`M${r1(cell.x + 3)},${r1(cell.y + cell.h / 2)} H${r1(cell.x + cell.w - 4)}`);
    shapes.push({ key: "stair", kind: "stair", element: stair.index, layer: null, d: parts.join(" "), rect: cell, fill: null, tone: "line", width: 0.9 });
    elementAnchors.set(stair.index, { x: cell.x + cell.w / 2, y: cell.y + cell.h * 0.3, rect: cell });
  }
  const dome = first("dome");
  if (dome) {
    const cx = x0 + gridW / 2;
    const cy = y0 + gridH / 2;
    const radius = Math.min(gridW, gridH) * 0.34;
    const rect = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
    shapes.push({ key: "dome", kind: "dome", element: dome.index, layer: null, d: `M${r1(cx - radius)},${r1(cy)} A${r1(radius)},${r1(radius)} 0 1 0 ${r1(cx + radius)},${r1(cy)} A${r1(radius)},${r1(radius)} 0 1 0 ${r1(cx - radius)},${r1(cy)} M${r1(cx - radius * 0.7)},${r1(cy - radius * 0.7)} L${r1(cx + radius * 0.7)},${r1(cy + radius * 0.7)} M${r1(cx + radius * 0.7)},${r1(cy - radius * 0.7)} L${r1(cx - radius * 0.7)},${r1(cy + radius * 0.7)}`, rect, fill: null, tone: "soft", width: 1.1, dash: "5 3" });
    elementAnchors.set(dome.index, { x: cx + radius * 0.42, y: cy - radius * 0.42, rect });
  }
  const vault = first("vault");
  if (vault) {
    const parts = [`M${r1(inner.x)},${r1(inner.y + inner.h / 2)} H${r1(inner.x + inner.w)}`, `M${r1(inner.x)},${r1(inner.y)} L${r1(inner.x + inner.w)},${r1(inner.y + inner.h)}`];
    shapes.push({ key: "vault", kind: "vault", element: vault.index, layer: null, d: parts.join(" "), rect: inner, fill: null, tone: "soft", width: 1, dash: "6 3" });
    elementAnchors.set(vault.index, { x: inner.x + inner.w * 0.7, y: inner.y + inner.h / 2, rect: inner });
  }
  const arch = first("arch");
  if (arch) {
    const y = outer.y + outer.h + 10;
    const parts: string[] = [];
    for (let b = 0; b < nx - 1; b += 1) parts.push(archPath(xs[b]! + 4, xs[b + 1]! - 4, y, -Math.min(10, bay * 0.18), false));
    shapes.push({ key: "arcade", kind: "arch", element: arch.index, layer: null, d: parts.join(" "), rect: { x: x0, y, w: gridW, h: 10 }, fill: null, tone: "soft", width: 1, dash: "4 2" });
    elementAnchors.set(arch.index, { x: xs[0]! + bay / 2, y: y + 4, rect: { x: x0, y, w: gridW, h: 10 } });
  }
  const roof = first("roof");
  if (roof) {
    const eave = inflate(outer, 7);
    shapes.push({ key: "roof", kind: "roof", element: roof.index, layer: null, d: `${rectPath(eave)} M${r1(eave.x + 4)},${r1(eave.y + eave.h / 2)} H${r1(eave.x + eave.w - 4)}`, rect: eave, fill: null, tone: "soft", width: 0.9, dash: "6 3" });
    elementAnchors.set(roof.index, { x: eave.x + eave.w - 3.5, y: eave.y + eave.h * 0.3, rect: eave });
  }
  const facade = first("facade");
  if (facade) {
    const clad = inflate(outer, 3);
    shapes.push({ key: "facade", kind: "facade", element: facade.index, layer: null, d: rectPath(clad), rect: clad, fill: null, tone: "soft", width: 1, dash: "3 2" });
    elementAnchors.set(facade.index, { x: clad.x + clad.w - 1.5, y: clad.y + clad.h * 0.7, rect: clad });
  }
  const spare: BlueprintAnchor[] = [
    { x: x0 + gridW / 2, y: y0 + gridH / 2, rect: inner },
    { x: outer.x + outer.w - wallT / 2, y: y0 + gridH * 0.3, rect: outer },
    { x: xs[0]! + bay / 2, y: ys[ny - 1]! - bay / 2, rect: inner },
    { x: outer.x + outer.w / 2, y: outer.y + wallT / 2, rect: outer },
    { x: xs[nx - 1]! - bay / 2, y: ys[0]! + bay / 2, rect: inner },
    { x: outer.x + wallT / 2, y: y0 + gridH / 2, rect: outer },
  ];
  const axes = [
    ...xs.map((x, index) => ({ x, y: drawing.y + BUBBLE_R + 2, label: String(index + 1), to: y0 + gridH + 12 })),
    ...ys.map((y, index) => ({ x: drawing.x + BUBBLE_R + 2, y, label: String.fromCharCode(65 + index), to: x0 + gridW + 12 })),
  ];
  const flows: BlueprintLayout["flows"] = [];
  if ((data.flow === "light" || data.flow === "both") && opening) {
    const target = elementAnchors.get(opening.index)!;
    for (let i = 0; i < 3; i += 1) flows.push({ kind: "light", x1: target.x - 14 + i * 14, y1: outer.y - 18, x2: target.x - 8 + i * 8, y2: outer.y + wallT + 10 });
  }
  return {
    shapes,
    axes,
    kotLevels: [],
    kotX: x0,
    ground: null,
    dimension: { x1: x0, x2: x0 + gridW, y: drawing.y + drawing.h - 6, ticks: ctx.technical ? xs : [] },
    flows,
    elementAnchors,
    layerAnchors: new Map(),
    spare,
    notes: [],
  };
}

/* ───────── Şema: katman detayı ya da statik şema ───────── */

function schematicGeometry(ctx: Ctx): Geometry {
  const { data, drawing } = ctx;
  const shapes: BlueprintShape[] = [];
  const elementAnchors = new Map<number, BlueprintAnchor>();
  const layerAnchors = new Map<number, BlueprintAnchor>();
  const notes: Geometry["notes"] = [];
  const els = elementsOf(data);
  const first = (kind: BlueprintKind) => els.find((item) => item.kind === kind);
  const flows: BlueprintLayout["flows"] = [];
  const dimZone = ctx.dimLabelH ? ctx.dimLabelH + 16 : 8;
  if (data.layers.length >= 2) {
    // Katman detayı: bantlar kalınlıkla orantılı, malzemeye göre taranır.
    const noteW = ctx.technical ? Math.min(drawing.w * 0.32, 96) : 0;
    const stack = { x: drawing.x + 22, y: drawing.y + 8, w: drawing.w - 44 - noteW, h: drawing.h - 16 - dimZone };
    const values = data.layers.map((layer) => thicknessValue(layer.thickness));
    const known = values.every((value) => value !== null);
    const weights = values.map((value) => (known ? (value as number) : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    const minH = 18;
    const raw = weights.map((weight) => (stack.h * weight) / sum);
    const deficit = raw.reduce((acc, h) => acc + Math.max(0, minH - h), 0);
    const surplus = raw.reduce((acc, h) => acc + Math.max(0, h - minH), 0) || 1;
    const heights = raw.map((h) => (h < minH ? minH : h - ((h - minH) / surplus) * deficit));
    let y = stack.y;
    data.layers.forEach((layer, index) => {
      const band = { x: stack.x, y, w: stack.w, h: heights[index]! };
      shapes.push({ key: `layer${index}`, kind: "layer", element: null, layer: index, d: rectPath(band), rect: band, fill: layer.materialKind ?? "cut", tone: "line", width: 1 });
      layerAnchors.set(index, { x: band.x + 16 + (index % 3) * Math.min(30, band.w * 0.16), y: band.y + band.h / 2, rect: band });
      if (ctx.technical && layer.thickness) notes.push({ x: stack.x + stack.w + 12, y: band.y + band.h / 2, text: layer.thickness, tickX1: stack.x + stack.w + 2, tickX2: stack.x + stack.w + 9 });
      y += band.h;
    });
    const spare: BlueprintAnchor[] = data.layers.map((_, index) => layerAnchors.get(index)!).concat([{ x: stack.x + stack.w / 2, y: stack.y + stack.h / 2, rect: stack }]);
    els.forEach((item, k) => {
      const kindLayer = data.layers.findIndex((layer) => blueprintKindOf(undefined, layer.name) === item.kind);
      const anchor = kindLayer >= 0 ? layerAnchors.get(kindLayer)! : spare[k % spare.length]!;
      elementAnchors.set(item.index, { ...anchor, x: anchor.x + (kindLayer >= 0 ? 0 : stack.w * 0.35) });
    });
    if (data.flow === "load" || data.flow === "both") {
      for (const t of [0.3, 0.55, 0.8]) flows.push({ kind: "load", x1: stack.x + stack.w * t, y1: Math.max(drawing.y, stack.y - 16), x2: stack.x + stack.w * t, y2: stack.y - 2 });
    }
    return { shapes, axes: [], kotLevels: [], kotX: stack.x, ground: null, dimension: { x1: stack.x, x2: stack.x + stack.w, y: drawing.y + drawing.h - 6, ticks: [] }, flows, elementAnchors, layerAnchors, spare, notes };
  }

  // Statik şema: tek çizgi taşıyıcılar, düğüm noktaları, mesnetler, yük okları.
  const nx = clampInt(first("column")?.element.count ?? 3, 2, 6);
  const floors = clampInt(first("slab")?.element.count ?? 1, 1, 3);
  const left = drawing.x + 26;
  const right = drawing.x + drawing.w - 26;
  const supportY = drawing.y + drawing.h - dimZone - 14;
  const topY = drawing.y + 34 + (first("arch") || first("dome") || first("vault") ? 30 : 0);
  const xs = Array.from({ length: nx }, (_, index) => left + ((right - left) * index) / (nx - 1));
  const levelH = (supportY - topY) / floors;
  const levels = Array.from({ length: floors + 1 }, (_, index) => supportY - levelH * index);
  const parts: string[] = [];
  for (const x of xs) parts.push(`M${r1(x)},${r1(supportY)} V${r1(topY)}`);
  shapes.push({ key: "members-columns", kind: "column", element: first("column")?.index ?? null, layer: null, d: parts.join(" "), rect: { x: left, y: topY, w: right - left, h: supportY - topY }, fill: null, tone: "line", width: 2.4 });
  const beamParts = levels.slice(1).map((y) => `M${r1(left)},${r1(y)} H${r1(right)}`);
  shapes.push({ key: "members-beams", kind: "beam", element: first("beam")?.index ?? first("slab")?.index ?? null, layer: null, d: beamParts.join(" "), rect: { x: left, y: topY, w: right - left, h: levelH * floors }, fill: null, tone: "line", width: 2.4 });
  // Mesnetler (üçgen + zemin taraması)
  xs.forEach((x, index) => {
    const tri: [number, number][] = [[x, supportY], [x - 8, supportY + 11], [x + 8, supportY + 11]];
    shapes.push({ key: `support${index}`, kind: "foundation", element: first("foundation")?.index ?? null, layer: null, d: polyPath(tri), rect: bboxOf(tri), fill: null, tone: "line", width: 1.4 });
  });
  const groundLine = { x: left - 14, y: supportY + 12, w: right - left + 28, h: 4 };
  shapes.push({ key: "support-ground", kind: "ground", element: null, layer: null, d: rectPath(groundLine), rect: groundLine, fill: "soil", tone: "soft", width: 0 });
  const curve = first("dome") ?? first("arch") ?? first("vault");
  if (curve) {
    const rise = Math.min(28, (right - left) * 0.16);
    shapes.push({ key: "members-arch", kind: curve.kind!, element: curve.index, layer: null, d: archPath(left, right, topY, rise, curve.element.variant === "pointed"), rect: { x: left, y: topY - rise, w: right - left, h: rise }, fill: null, tone: "line", width: 2.2 });
    elementAnchors.set(curve.index, { x: (left + right) / 2, y: topY - rise, rect: { x: left, y: topY - rise - 4, w: right - left, h: rise + 4 } });
  }
  const interiorX = xs[Math.floor(nx / 2)]!;
  const anchorFor: Partial<Record<BlueprintKind, BlueprintAnchor>> = {
    column: { x: interiorX, y: (levels[0]! + levels[1]!) / 2, rect: { x: interiorX - 3, y: topY, w: 6, h: supportY - topY } },
    beam: { x: (xs[0]! + xs[1]!) / 2, y: levels[1]!, rect: { x: left, y: levels[1]! - 3, w: right - left, h: 6 } },
    slab: { x: (xs[nx - 2]! + xs[nx - 1]!) / 2, y: levels[floors]!, rect: { x: left, y: levels[floors]! - 3, w: right - left, h: 6 } },
    foundation: { x: xs[0]!, y: supportY + 6, rect: { x: xs[0]! - 8, y: supportY, w: 16, h: 12 } },
    wall: { x: xs[0]!, y: (levels[0]! + levels[1]!) / 2, rect: { x: xs[0]! - 3, y: topY, w: 6, h: supportY - topY } },
  };
  const spare: BlueprintAnchor[] = [
    anchorFor.column!,
    anchorFor.beam!,
    { x: xs[nx - 1]!, y: (levels[0]! + levels[1]!) / 2, rect: { x: xs[nx - 1]! - 3, y: topY, w: 6, h: supportY - topY } },
    anchorFor.foundation!,
    anchorFor.slab!,
  ];
  let spareIndex = 0;
  els.forEach((item) => {
    if (elementAnchors.has(item.index)) return;
    const anchor = (item.kind && anchorFor[item.kind]) || spare[spareIndex++ % spare.length]!;
    elementAnchors.set(item.index, anchor);
  });
  if (data.flow === "load" || data.flow === "both") {
    for (let i = 0; i < 5; i += 1) {
      const x = left + ((right - left) * (i + 0.5)) / 5;
      flows.push({ kind: "load", x1: x, y1: levels[floors]! - 20, x2: x, y2: levels[floors]! - 3 });
    }
  }
  return { shapes, axes: [], kotLevels: [], kotX: left, ground: null, dimension: { x1: left, x2: right, y: drawing.y + drawing.h - 6, ticks: ctx.technical ? xs : [] }, flows, elementAnchors, layerAnchors, spare, notes };
}

/* ───────── Yerleşim ───────── */

/** Pin hedefini çözer: eleman kimliği, etiketi ya da türü, katman adı; yoksa göreli konum ya da sıradaki eleman. */
function resolvePin(
  data: BlueprintData,
  pin: { target?: string; x?: number; y?: number },
  order: number,
  geometry: Geometry,
  drawing: Rect,
): { anchor: BlueprintAnchor; target: string | null } {
  const target = pin.target ? foldTr(pin.target) : "";
  if (target) {
    const byId = data.elements.findIndex((element, index) => foldTr(element.id ?? `e${index + 1}`) === target);
    const byLabel = byId >= 0 ? byId : data.elements.findIndex((element) => foldTr(element.label) === target);
    const kind = byLabel >= 0 ? undefined : blueprintKindOf(pin.target);
    const byKind = byLabel >= 0 ? byLabel : kind ? data.elements.findIndex((element) => element.kind === kind) : -1;
    if (byKind >= 0 && geometry.elementAnchors.has(byKind)) return { anchor: geometry.elementAnchors.get(byKind)!, target: data.elements[byKind]!.id ?? `e${byKind + 1}` };
    const layer = data.layers.findIndex((item) => foldTr(item.name) === target);
    if (layer >= 0 && geometry.layerAnchors.has(layer)) return { anchor: geometry.layerAnchors.get(layer)!, target: data.layers[layer]!.name };
  }
  if (pin.x !== undefined && pin.y !== undefined) {
    const x = drawing.x + PIN_R + pin.x * (drawing.w - PIN_R * 2);
    const y = drawing.y + PIN_R + pin.y * (drawing.h - PIN_R * 2);
    return { anchor: { x, y, rect: { x: x - PIN_R, y: y - PIN_R, w: PIN_R * 2, h: PIN_R * 2 } }, target: null };
  }
  const element = order < data.elements.length ? order : -1;
  if (element >= 0 && geometry.elementAnchors.has(element)) return { anchor: geometry.elementAnchors.get(element)!, target: data.elements[element]!.id ?? `e${element + 1}` };
  return { anchor: geometry.spare[order % geometry.spare.length]!, target: null };
}

export function layoutBlueprint(data: BlueprintData, frame: SceneFrame, domain?: AcademicDomain): BlueprintLayout {
  const { content } = frame;
  const place = textPlacer(frame);
  const view = blueprintView(data);
  const technical = isTechnical(frame);
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Mimarlık"} · ${ARCHETYPE_LABEL.ARCHITECTURE_SPATIAL_BLUEPRINT}`;
  const header = layoutHeader(frame, data.title, badge);
  const texts: TextBox[] = [...header.texts];
  const markers: SceneLayout["markers"] = [];
  const top = header.bottom + 10;
  const bottom = content.y + content.h;

  // Pinler: verilen numaralı pinler, yoksa katman detayında katmanlar, öbür görünüşlerde elemanlar.
  const layerDetail = view === "schematic" && data.layers.length >= 2;
  type PinIn = { n: number; target?: string; x?: number; y?: number; label?: string; note?: string };
  const rawPins: PinIn[] = data.calloutPins.length
    ? data.calloutPins.map((pin, index) => ({ ...pin, n: pin.n ?? index + 1 }))
    : layerDetail
      ? data.layers.map((layer, index) => ({ n: index + 1, target: layer.name, label: layer.name, note: [layer.material, layer.thickness].filter(Boolean).join(" · ") || undefined }))
      : data.elements.map((element, index) => ({ n: index + 1, target: element.id ?? `e${index + 1}` }));
  const [pinCount] = labelBudget(frame.text.maxLabels, [{ count: rawPins.length, keep: 1 }]);
  const pinsIn = rawPins.slice(0, pinCount);
  const legendText = (pin: (typeof pinsIn)[number], index: number) => {
    const target = pin.target ? foldTr(pin.target) : "";
    const element =
      data.elements.find((item, k) => foldTr(item.id ?? `e${k + 1}`) === target || foldTr(item.label) === target) ??
      (target ? data.elements.find((item) => item.kind && item.kind === blueprintKindOf(pin.target)) : undefined) ??
      (!pin.label && !pin.target ? data.elements[index] : undefined);
    const layer = data.layers.find((item) => foldTr(item.name) === target);
    const label = pin.label ?? element?.label ?? layer?.name ?? (element?.kind ? BLUEPRINT_KIND_LABEL[element.kind] : `Nokta ${pin.n}`);
    const role = pin.note ?? element?.role ?? (layer ? [layer.material, layer.thickness].filter(Boolean).join(" · ") : undefined);
    return { label, role: role || undefined };
  };

  // Lejant ölçümü (önce yüksekliği bilinsin).
  const legendW = frame.portrait ? content.w : Math.round(content.w * 0.4);
  const legendX = frame.portrait ? content.x : content.x + content.w - legendW;
  const textX = legendX + PIN_R * 2 + 10;
  const textW = legendW - PIN_R * 2 - 10;
  const rowsText = pinsIn.map(legendText);
  const simple = frame.text.density === "simple";
  const buildLegend = (roleLines: number, y0: number) => {
    let y = y0;
    return rowsText.map((row, index) => {
      const label = place(`legend${index}-label`, row.label, textX, y, { maxWidth: textW, maxLines: 1, fontSize: 12.5, minFontSize: 10, weight: 700, single: true });
      // Sığmayan açıklama kesilmez, gizlenir (pin adı kalır).
      const fitted = row.role && roleLines > 0 ? place(`legend${index}-role`, row.role, textX, y + label.rect.h + 1, { maxWidth: textW, maxLines: roleLines, fontSize: 10.5, minFontSize: 9 }) : null;
      const role = fitted && !fitted.truncated ? fitted : null;
      const h = Math.max(PIN_R * 2 + 2, label.rect.h + (role ? role.rect.h + 1 : 0));
      const out = { y, h, label, role };
      y += h + 8;
      return out;
    });
  };
  const legendHeight = (rows: ReturnType<typeof buildLegend>) => (rows.length ? rows[rows.length - 1]!.y + rows[rows.length - 1]!.h - rows[0]!.y : 0);
  const available = frame.portrait ? (bottom - top) * 0.42 : bottom - top;
  let roleLines = simple ? 2 : 3;
  let measured = buildLegend(roleLines, 0);
  while (legendHeight(measured) > available && roleLines > 0) {
    roleLines -= 1;
    measured = buildLegend(roleLines, 0);
  }
  const legendTop = frame.portrait ? bottom - legendHeight(measured) : top + Math.max(0, (bottom - top - legendHeight(measured)) / 2);
  const rows = buildLegend(roleLines, legendTop);
  const legend = rows.map((row, index) => {
    texts.push(row.label, ...(row.role ? [row.role] : []));
    markers.push({ id: `legend-pin${index}`, rect: { x: legendX, y: row.y, w: PIN_R * 2, h: PIN_R * 2 } });
    return { n: pinsIn[index]!.n, pinX: legendX + PIN_R, pinY: row.y + PIN_R, label: row.label, role: row.role };
  });

  // Görünüş adı (çizimin üstünde)
  const tagText = view === "schematic" ? (layerDetail ? "KATMAN DETAYI" : "STATİK ŞEMA") : view === "section" ? "KESİT" : view === "plan" ? "PLAN" : "GÖRÜNÜŞ";
  const tag = place("view-tag", tagText, content.x, top, { maxWidth: frame.portrait ? content.w : legendX - 16 - content.x, maxLines: 1, fontSize: 10.5, weight: 800, single: true });
  texts.push(tag);
  const drawTop = tag.rect.y + tag.rect.h + 6;
  const drawing: Rect = frame.portrait
    ? { x: content.x, y: drawTop, w: content.w, h: legendTop - 14 - drawTop }
    : { x: content.x, y: drawTop, w: legendX - 16 - content.x, h: bottom - drawTop };

  // Kot yazısı genişliği (teknikte bütün katlar, standartta yalnız ±0.00)
  const kot: Ctx["kot"] = view === "plan" || view === "schematic" ? "none" : technical ? "all" : frame.text.density === "standard" && frame.text.level ? "ground" : "none";
  const kotProbe = ["±0.00", "4. kat", "Saçak"].map((text) => place("kot-probe", text, 0, 0, { maxWidth: 80, maxLines: 1, fontSize: 10, weight: 700, single: true }).rect.w);
  const kotLabelW = kot === "none" ? 0 : Math.max(...kotProbe);
  const dimProbe = data.dimension
    ? place("dimension", data.dimension.label, 0, 0, { maxWidth: drawing.w * 0.6, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "middle", single: true })
    : null;
  const ctx: Ctx = { data, view, drawing, technical, kot, kotLabelW, dimLabelH: dimProbe?.rect.h ?? 0 };
  const geometry = view === "plan" ? planGeometry(ctx) : view === "schematic" ? schematicGeometry(ctx) : buildingGeometry(ctx);

  const segments: SceneLayout["segments"] = [];
  // Ölçü çizgisi ve uzatma çizgileri yazının engelidir.
  let dimension: BlueprintLayout["dimension"] = null;
  if (geometry.dimension) {
    const d = geometry.dimension;
    const label = dimProbe ? place("dimension", data.dimension!.label, (d.x1 + d.x2) / 2, d.y - 4 - dimProbe.rect.h, { maxWidth: drawing.w * 0.6, maxLines: 1, fontSize: 10.5, weight: 700, anchor: "middle", single: true }) : null;
    if (label) texts.push(label);
    if (label || d.ticks.length) {
      segments.push(segment("dim-line", d.x1, d.y, d.x2, d.y));
      dimension = { ...d, label };
    }
  }
  if (geometry.ground !== null) segments.push(segment("ground", drawing.x + 4, geometry.ground, drawing.x + drawing.w - 4, geometry.ground));
  // Kot işaretleri: yazı çizginin üstünde, yapının solunda.
  const kots = geometry.kotLevels.map((level, index) => {
    const label = place(`kot${index}`, level.label, geometry.kotX - 12, level.y - 3 - 14, { maxWidth: kotLabelW + 4, maxLines: 1, fontSize: 10, weight: 700, anchor: "end", single: true });
    const fixed = { ...label, y: level.y - 3 - label.rect.h, rect: { ...label.rect, y: level.y - 3 - label.rect.h } };
    texts.push(fixed);
    segments.push(segment(`kot-line${index}`, fixed.rect.x, level.y, geometry.kotX - 2, level.y));
    return { x: geometry.kotX - 8, y: level.y, label: fixed };
  });
  // Katman kalınlık notları (katman detayında, teknik düzeyde)
  for (const [index, note] of geometry.notes.entries()) {
    const box = place(`thickness${index}`, note.text, note.x, 0, { maxWidth: drawing.x + drawing.w - note.x, maxLines: 1, fontSize: 10, weight: 700, single: true });
    const placed = { ...box, y: note.y - box.rect.h / 2, rect: { ...box.rect, y: note.y - box.rect.h / 2 } };
    if (texts.some((other) => other.rect.y < placed.rect.y + placed.rect.h && placed.rect.y < other.rect.y + other.rect.h && other.rect.x < placed.rect.x + placed.rect.w && placed.rect.x < other.rect.x + other.rect.w)) continue;
    texts.push(placed);
  }
  for (const flow of geometry.flows) segments.push(segment(`flow-${flow.kind}`, flow.x1, flow.y1, flow.x2, flow.y2));

  // Pinler hedeflerinin üstüne; üst üste binen pin hedef kutusunun içinde kaydırılır.
  const pins: BlueprintLayout["pins"] = [];
  pinsIn.forEach((pin, index) => {
    const { anchor, target } = resolvePin(data, pin, index, geometry, drawing);
    const room = inflate(anchor.rect, 3);
    // Pin öbür pine ve çizimdeki yazıya (kot, ölçü, kalınlık) binmez.
    const clash = (x: number, y: number) =>
      pins.some((other) => Math.hypot(other.x - x, other.y - y) < PIN_R * 2 + 3) ||
      texts.some((box) => rectsOverlap(box.rect, { x: x - PIN_R, y: y - PIN_R, w: PIN_R * 2, h: PIN_R * 2 }, 1));
    const inside = (x: number, y: number) => x - PIN_R >= drawing.x && x + PIN_R <= drawing.x + drawing.w && y - PIN_R >= drawing.y && y + PIN_R <= drawing.y + drawing.h;
    const offsets: [number, number][] = [[0, 0]];
    for (let step = 1; step <= 6; step += 1) {
      const d = (PIN_R * 2 + 4) * step * 0.5;
      offsets.push([0, -d], [0, d], [d, 0], [-d, 0], [d, -d], [-d, d], [-d, -d], [d, d]);
    }
    const onTarget = offsets.find(([dx, dy]) => {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      return !clash(x, y) && inside(x, y) && x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;
    });
    const fallback = offsets.find(([dx, dy]) => !clash(anchor.x + dx, anchor.y + dy) && inside(anchor.x + dx, anchor.y + dy)) ?? [0, 0];
    const [dx, dy] = onTarget ?? fallback;
    const x = Math.max(drawing.x + PIN_R, Math.min(drawing.x + drawing.w - PIN_R, anchor.x + dx));
    const y = Math.max(drawing.y + PIN_R, Math.min(drawing.y + drawing.h - PIN_R, anchor.y + dy));
    pins.push({ n: pin.n, x, y, target });
    markers.push({ id: `pin${pin.n}`, rect: { x: x - PIN_R, y: y - PIN_R, w: PIN_R * 2, h: PIN_R * 2 } });
  });

  return {
    frame,
    texts,
    segments,
    markers,
    view,
    tag,
    drawing,
    shapes: geometry.shapes,
    axes: geometry.axes,
    kots,
    dimension,
    flows: geometry.flows,
    pins,
    legend,
  };
}

/** Malzeme taraması: kesilen elemanın dolgusu (SVG pattern). */
function HatchDefs({ id, color, bg }: { id: (name: string) => string; color: string; bg: string }) {
  const lines = (name: string, d: string, size = 6, width = 0.8, fill = "none") => (
    <pattern key={name} id={id(`hatch-${name}`)} patternUnits="userSpaceOnUse" width={size} height={size}>
      <rect width={size} height={size} fill={fill === "none" ? bg : fill} fillOpacity={fill === "none" ? 0.6 : 1} />
      <path d={d} stroke={color} strokeWidth={width} fill="none" />
    </pattern>
  );
  return (
    <defs>
      {lines("cut", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")}
      {lines("concrete", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2 M2,3 h0.6", 6, 0.6)}
      {lines("masonry", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2 M-1,4 l5,-5 M3,7 l4,-4", 6, 0.55)}
      {lines("insulation", "M0,3 q1.5,-3 3,0 t3,0", 6, 0.8)}
      {lines("wood", "M0,2 q3,1.5 6,0 M0,5 q3,-1.5 6,0", 6, 0.6)}
      {lines("steel", "M0,0", 6, 0.6, color)}
      {lines("glass", "M0,3 h6", 6, 0.4)}
      {lines("plaster", "M1,1 h0.6 M4,4 h0.6", 6, 0.8)}
      {lines("stone", "M0,0 l6,6 M6,0 l-6,6", 6, 0.5)}
      {lines("soil", "M0,0 l6,6 M6,0 l-6,6 M3,0 v6", 6, 0.45)}
      {lines("air", "M0,0", 6, 0.1)}
      {lines("membrane", "M0,0", 6, 0.6, color)}
    </defs>
  );
}

export function ArchitecturalBlueprintScene({ data, domain, ...common }: SceneCommonProps & { data: BlueprintData; domain?: AcademicDomain }) {
  const layout = layoutBlueprint(data, common.frame, domain);
  const theme = BLUEPRINT_THEMES[data.theme];
  const id = useSceneIds("arch");
  const [badge, title] = layout.texts;
  const { drawing } = layout;
  const minor = 12;
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let i = 0, x = drawing.x; x <= drawing.x + drawing.w; x += minor, i += 1) gridLines.push({ x1: x, y1: drawing.y, x2: x, y2: drawing.y + drawing.h, major: i % 5 === 0 });
  for (let i = 0, y = drawing.y; y <= drawing.y + drawing.h; y += minor, i += 1) gridLines.push({ x1: drawing.x, y1: y, x2: drawing.x + drawing.w, y2: y, major: i % 5 === 0 });
  const fillOf = (fill: BlueprintFill) =>
    fill === null ? "none" : fill === "glass-pane" ? theme.bg : fill === "tint" ? theme.soft : `url(#${id(`hatch-${fill}`)})`;
  const bubbleFont = layout.frame.text.floor;
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${layout.legend.map((row) => `${row.n}. ${row.label.lines.join(" ")}`).join(", ")}`}
      archetype="ARCHITECTURE_SPATIAL_BLUEPRINT"
      background={theme.bg}
    >
      <ArrowDefs id={id} colors={{ line: theme.line, light: theme.light, load: theme.load }} />
      <HatchDefs id={id} color={theme.hatch} bg={theme.bg} />
      <SceneBadge box={badge!} color={theme.pin} textColor={theme.pin} />
      <SceneText box={title!} fill={theme.text} className="cp-vs-fade" style={delay(0.1)} />
      <SceneText box={layout.tag} fill={theme.soft} className="cp-vs-fade" style={delay(0.12)} />

      {/* Teknik pafta ızgarası */}
      <g className="cp-vs-fade" style={delay(0.12)}>
        {gridLines.map((line, index) => (
          <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.major ? theme.gridMajor : theme.grid} strokeWidth={line.major ? 1 : 0.6} />
        ))}
        <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} fill="none" stroke={theme.gridMajor} strokeWidth={1.2} />
      </g>

      {/* Akslar ve balonlar */}
      {layout.axes.map((axis, index) => {
        const vertical = axis.y < drawing.y + BUBBLE_R * 3;
        return (
          <g key={`axis${index}`} className="cp-vs-fade" style={delay(0.2 + index * 0.06)} data-axis={axis.label}>
            {vertical ? (
              <line x1={axis.x} y1={axis.y + BUBBLE_R} x2={axis.x} y2={axis.to} stroke={theme.soft} strokeWidth={0.7} strokeDasharray="6 3 1.5 3" />
            ) : (
              <line x1={axis.x + BUBBLE_R} y1={axis.y} x2={axis.to} y2={axis.y} stroke={theme.soft} strokeWidth={0.7} strokeDasharray="6 3 1.5 3" />
            )}
            <circle cx={axis.x} cy={axis.y} r={BUBBLE_R} fill={theme.bg} stroke={theme.soft} strokeWidth={1.2} />
            <text x={axis.x} y={axis.y + bubbleFont * 0.36} fontSize={bubbleFont} fontWeight={700} textAnchor="middle" fill={theme.soft}>
              {axis.label}
            </text>
          </g>
        );
      })}

      {/* Çizim: veriden kurulan parçalar (kesitte kesilen eleman taranır) */}
      <g data-view={layout.view}>
        {layout.shapes.map((shape, index) => (
          <path
            key={shape.key}
            d={shape.d}
            fill={fillOf(shape.fill)}
            fillOpacity={shape.fill === "tint" ? 0.12 : 1}
            stroke={shape.width > 0 ? (shape.tone === "line" ? theme.line : theme.soft) : "none"}
            strokeWidth={shape.width}
            strokeDasharray={shape.dash}
            fillRule={shape.evenodd ? "evenodd" : undefined}
            strokeLinejoin="round"
            data-shape={shape.kind}
            data-element={shape.element ?? undefined}
            data-layer={shape.layer ?? undefined}
            data-poche={shape.fill && shape.fill !== "glass-pane" && shape.fill !== "tint" ? shape.fill : undefined}
            pathLength={shape.fill ? undefined : 1}
            className={shape.fill ? "cp-vs-fade" : "cp-vs-draw"}
            style={delay(0.35 + Math.min(index, 24) * 0.05, 0.6)}
          />
        ))}
        {layout.shapes
          .filter((shape) => shape.kind === "opening" && shape.fill === "glass-pane")
          .map((shape) => (
            <line
              key={`${shape.key}-glass`}
              x1={shape.rect.x + shape.rect.w / 2}
              y1={shape.rect.y + 1}
              x2={shape.rect.x + shape.rect.w / 2}
              y2={shape.rect.y + shape.rect.h - 1}
              stroke={theme.soft}
              strokeWidth={0.8}
              className="cp-vs-fade"
              style={delay(1.4)}
            />
          ))}
      </g>

      {/* Kot işaretleri */}
      {layout.kots.map((kot, index) => (
        <g key={`kot${index}`} className="cp-vs-fade" style={delay(1.5 + index * 0.08)} data-kot={index}>
          <line x1={kot.label.rect.x} y1={kot.y} x2={kot.x + 6} y2={kot.y} stroke={theme.soft} strokeWidth={0.8} />
          <path d={`M${kot.x - 4},${kot.y - 6} L${kot.x + 4},${kot.y - 6} L${kot.x},${kot.y} z`} fill={theme.soft} />
          <SceneText box={kot.label} fill={theme.muted} />
        </g>
      ))}

      {/* Yük ve ışık yön okları */}
      {layout.flows.map((flow, index) => (
        <line
          key={`flow${index}`}
          x1={flow.x1}
          y1={flow.y1}
          x2={flow.x2}
          y2={flow.y2}
          stroke={flow.kind === "load" ? theme.load : theme.light}
          strokeWidth={flow.kind === "load" ? 2 : 1.4}
          strokeDasharray={flow.kind === "light" ? "5 3" : undefined}
          markerEnd={`url(#${id(`arrow-${flow.kind}`)})`}
          className="cp-vs-fade"
          style={delay(1.6 + index * 0.08)}
          data-flow={flow.kind}
        />
      ))}

      {/* Ölçü oku (↔) ve teknik düzeyde aks çentikleri */}
      {layout.dimension ? (
        <g className="cp-vs-fade" style={delay(1.5)} data-dimension="1">
          <line x1={layout.dimension.x1} y1={layout.dimension.y - 8} x2={layout.dimension.x1} y2={layout.dimension.y + 4} stroke={theme.soft} strokeWidth={0.8} />
          <line x1={layout.dimension.x2} y1={layout.dimension.y - 8} x2={layout.dimension.x2} y2={layout.dimension.y + 4} stroke={theme.soft} strokeWidth={0.8} />
          <line x1={layout.dimension.x1 + 2} y1={layout.dimension.y} x2={layout.dimension.x2 - 2} y2={layout.dimension.y} stroke={theme.line} strokeWidth={1.2} markerStart={`url(#${id("arrow-line")})`} markerEnd={`url(#${id("arrow-line")})`} />
          {layout.dimension.ticks.map((x, index) => (
            <line key={`tick${index}`} x1={x - 3} y1={layout.dimension!.y + 3} x2={x + 3} y2={layout.dimension!.y - 3} stroke={theme.line} strokeWidth={1.1} data-tick={index} />
          ))}
          {layout.dimension.label ? <SceneText box={layout.dimension.label} fill={theme.text} /> : null}
        </g>
      ) : null}

      {/* Kalınlık notları */}
      {layout.texts
        .filter((box) => box.id.startsWith("thickness"))
        .map((box) => (
          <SceneText key={box.id} box={box} fill={theme.muted} className="cp-vs-fade" style={delay(1.8)} />
        ))}

      {/* Numaralı callout pinleri */}
      {layout.pins.map((pin, index) => (
        <g key={`pin${pin.n}-${index}`} className="cp-vs-fade" style={delay(2.1 + index * 0.25)} data-pin={pin.n} data-target={pin.target ?? undefined}>
          <circle cx={pin.x} cy={pin.y} r={PIN_R + 4} fill={theme.pin} fillOpacity={0.25} />
          <circle cx={pin.x} cy={pin.y} r={PIN_R} fill={theme.pin} stroke={theme.bg} strokeWidth={1.5} />
          <text x={pin.x} y={pin.y + bubbleFont * 0.36} fontSize={bubbleFont} fontWeight={800} textAnchor="middle" fill={theme.pinText}>
            {pin.n}
          </text>
        </g>
      ))}

      {/* İşlev listesi */}
      {layout.legend.map((row, index) => (
        <g key={`legend${row.n}-${index}`} className="cp-vs-fade" style={delay(2.2 + index * 0.25)}>
          <circle cx={row.pinX} cy={row.pinY} r={PIN_R} fill={theme.pin} />
          <text x={row.pinX} y={row.pinY + bubbleFont * 0.36} fontSize={bubbleFont} fontWeight={800} textAnchor="middle" fill={theme.pinText}>
            {row.n}
          </text>
          <SceneText box={row.label} fill={theme.text} />
          {row.role ? <SceneText box={row.role} fill={theme.muted} /> : null}
        </g>
      ))}
    </SceneSvg>
  );
}
