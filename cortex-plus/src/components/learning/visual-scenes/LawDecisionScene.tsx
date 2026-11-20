"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  labelBudget,
  layoutHeader,
  segment,
  textPlacer,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type Segment,
  type TextBox,
  type TextPlacer,
} from "@/lib/learning/visual-scenes/layout";
import { lawTreeDepth, lawTreeNodes, lawTreeOf, parseFraction, type LawDecisionData, type LawTreeNode } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, type SceneCommonProps } from "./scene-kit";

/**
 * LAW_SOCIAL_FLOWCHART (Hukuk, KPSS, Anayasa, Sosyal): veriden kurulan çok kademeli karar ağacı (20 Kasım 2026;
 * eskiden tek düğüm ve iki yapraktı). Soru düğümünden Evet (yeşil), Hayır (kırmızı) ya da adlı dallar iner; yapraklar
 * sonuçtur. Dar alanda ve çok yapraklı ağaçta girintili ağaç çizilir. Çoğunluk barometresi eşiği, toplamı ve
 * gerçekleşeni gösterir (eşik geçildiyse yeşil, geçilmediyse kırmızı). Kronolojik zaman çizgisi ve isteğe bağlı
 * "Genel Kural vs. İstisna" tablosu (kaynak istisna söylemiyorsa tablo ya da istisna sütunu çizilmez).
 */

export const LAW_COLORS = {
  bg: "#0f1422",
  panel: "#161d30",
  stroke: "#2a3552",
  text: "#f3f6fc",
  muted: "#a5b1cc",
  question: "#c4b5fd",
  yes: "#22c55e",
  no: "#ef4444",
  branch: "#38bdf8",
  rule: "#60a5fa",
  exception: "#f59e0b",
  bar: "#818cf8",
  track: "#232c45",
  time: "#38bdf8",
} as const;

type Tone = LawTreeNode["tone"];
const TONE_COLOR: Record<Tone, string> = { positive: LAW_COLORS.yes, negative: LAW_COLORS.no, neutral: LAW_COLORS.branch };

type Section = { texts: TextBox[]; segments: Segment[]; markers: SceneLayout["markers"]; height: number };

export type TreeNodeBox = { key: string; depth: number; leaf: boolean; tone: Tone; rect: Rect; text: TextBox };
export type TreeEdge = { tone: Tone; points: [number, number][] };
export type TreeLayout = Section & {
  mode: "tidy" | "indent";
  depth: number;
  nodes: TreeNodeBox[];
  edges: TreeEdge[];
  tags: { tone: Tone; box: TextBox }[];
};
export type MajorityLayout = Section & {
  kicker: TextBox;
  rows: { label: TextBox; value: TextBox; note: TextBox | null; track: Rect; ratio: number; fill: number; pass: boolean | null }[];
};
export type TimelineLayout = Section & {
  kicker: TextBox;
  vertical: boolean;
  line: { x1: number; y1: number; x2: number; y2: number };
  events: { x: number; y: number; date: TextBox; label: TextBox }[];
};
export type TableLayout = Section & {
  rect: Rect;
  divider: number | null;
  heads: TextBox[];
  headBottom: number;
  items: { side: "rule" | "exception"; bulletX: number; bulletY: number; text: TextBox }[];
};

export type LawDecisionLayout = SceneLayout & {
  tree: TreeLayout;
  majority: MajorityLayout | null;
  timeline: TimelineLayout | null;
  table: TableLayout | null;
};

const ICON = 26;

function leafCount(node: LawTreeNode): number {
  return node.children.length ? node.children.reduce((sum, child) => sum + leafCount(child.node), 0) : 1;
}

function pathSegments(prefix: string, edges: TreeEdge[]): Segment[] {
  return edges.flatMap((edge, e) => edge.points.slice(1).map((point, index) => segment(`${prefix}${e}-${index}`, edge.points[index]![0], edge.points[index]![1], point[0], point[1])));
}

/** Katmanlı ağaç: her kademe bir satır, yaprak başına bir sütun; dallar dik açılı. */
function tidyTree(place: TextPlacer, root: LawTreeNode, x: number, y: number, w: number, lines: number, compact: boolean): TreeLayout {
  const depth = lawTreeDepth(root);
  const leaves = leafCount(root);
  const slot = w / leaves;
  const pad = compact ? 5 : 7;
  type Placed = { node: LawTreeNode; cx: number; tone: Tone; text: TextBox; boxW: number; leaf: boolean; parent: Placed | null; label: { label: string; tone: Tone } | null };
  const rows: Placed[][] = [];
  const visit = (node: LawTreeNode, left: number, tone: Tone, parent: Placed | null, label: Placed["label"]) => {
    const span = leafCount(node) * slot;
    const leaf = node.children.length === 0;
    const boxW = Math.min(span - 8, leaf ? span - 8 : Math.max(w * 0.5, Math.min(w * 0.86, span - 8)));
    const text = place(`tree-${node.key}`, node.text, 0, 0, {
      maxWidth: boxW - ICON - 8,
      maxLines: lines,
      fontSize: leaf ? 11.5 : 12.5,
      minFontSize: 10,
      weight: leaf ? 600 : 700,
      anchor: "start",
    });
    const placed: Placed = { node, cx: left + span / 2, tone, text, boxW, leaf, parent, label };
    (rows[node.depth] ??= []).push(placed);
    let cursor = left;
    for (const child of node.children) {
      visit(child.node, cursor, child.tone, placed, { label: child.label, tone: child.tone });
      cursor += leafCount(child.node) * slot;
    }
  };
  visit(root, x, "neutral", null, null);

  // Dal etiketleri önce ölçülür: ebeveyn satırının altındaki boşluk etiketin yüksekliğine göre açılır (etiket ebeveyn
  // kutusuna binmesin). Gövde ile iniş arası yeterse etiket yatay dalın üstünde, değilse inişin sağında, dalın altında.
  type Tag = { child: Placed; box: TextBox; above: boolean };
  const tags: Tag[] = [];
  for (const row of rows.slice(1)) {
    for (const child of row) {
      const parent = child.parent!;
      const room = Math.abs(child.cx - parent.cx) - 10;
      const above = room >= 30;
      const box = above
        ? place(`tree-tag-${child.node.key}`, child.label!.label, (parent.cx + child.cx) / 2, 0, { maxWidth: room, maxLines: 2, fontSize: 10, weight: 800, anchor: "middle" })
        : place(`tree-tag-${child.node.key}`, child.label!.label, child.cx + 6, 0, { maxWidth: Math.max(40, child.boxW / 2 - 6), maxLines: 1, fontSize: 10, weight: 800, anchor: "start", single: true });
      tags.push({ child, box, above });
    }
  }
  const rowTop: number[] = [];
  const rowH: number[] = [];
  const barY: number[] = [];
  let cursorY = y;
  rows.forEach((row, d) => {
    rowTop[d] = cursorY;
    rowH[d] = Math.max(...row.map((item) => item.text.rect.h + pad * 2));
    const fromRow = tags.filter((tag) => tag.child.parent && tag.child.node.depth === d + 1);
    const aboveH = Math.max(0, ...fromRow.filter((tag) => tag.above).map((tag) => tag.box.rect.h));
    const belowH = Math.max(0, ...fromRow.filter((tag) => !tag.above).map((tag) => tag.box.rect.h));
    barY[d] = cursorY + rowH[d]! + 6 + (aboveH ? aboveH + 3 : 6);
    cursorY = barY[d]! + Math.max(compact ? 12 : 16, belowH ? belowH + 8 : 0);
  });
  const nodes: TreeNodeBox[] = [];
  const texts: TextBox[] = [];
  const boxOf = new Map<Placed, Rect>();
  rows.forEach((row, d) =>
    row.forEach((item) => {
      const h = item.text.rect.h + pad * 2;
      const rect: Rect = { x: item.cx - item.boxW / 2, y: rowTop[d]!, w: item.boxW, h };
      const text = { ...item.text, x: rect.x + ICON, y: rect.y + pad, rect: { ...item.text.rect, x: rect.x + ICON, y: rect.y + pad } };
      boxOf.set(item, rect);
      nodes.push({ key: item.node.key, depth: d, leaf: item.leaf, tone: item.leaf ? item.tone : "neutral", rect, text });
      texts.push(text);
    }),
  );
  const edges: TreeEdge[] = [];
  const placedTags: TreeLayout["tags"] = [];
  for (const tag of tags) {
    const parent = tag.child.parent!;
    const p = boxOf.get(parent)!;
    const c = boxOf.get(tag.child)!;
    const bar = barY[parent.node.depth]!;
    const px = p.x + p.w / 2;
    const cx = c.x + c.w / 2;
    edges.push({ tone: tag.child.tone, points: [[px, p.y + p.h], [px, bar], [cx, bar], [cx, c.y]] });
    const ty = tag.above ? bar - 3 - tag.box.rect.h : bar + 3;
    placedTags.push({ tone: tag.child.label!.tone, box: { ...tag.box, y: ty, rect: { ...tag.box.rect, y: ty } } });
  }
  texts.push(...placedTags.map((tag) => tag.box));
  const last = rows.length - 1;
  const height = rowTop[last]! + rowH[last]! - y;
  return { mode: "tidy", depth, nodes, edges, tags: placedTags, texts, segments: pathSegments("tree-edge", edges), markers: [], height };
}

/** Girintili ağaç: her düğüm bir satır, çocuklar sağa girer; dal etiketi satırın başında. */
function indentTree(place: TextPlacer, root: LawTreeNode, x: number, y: number, w: number, lines: number, compact: boolean): TreeLayout {
  const indent = 18;
  const pad = compact ? 5 : 7;
  const rowGap = compact ? 4 : 8;
  const nodes: TreeNodeBox[] = [];
  const texts: TextBox[] = [];
  const edges: TreeEdge[] = [];
  const tags: TreeLayout["tags"] = [];
  let cursor = y;
  const visit = (node: LawTreeNode, tone: Tone, label: { label: string; tone: Tone } | null, parentRect: Rect | null) => {
    // Çocuk ebeveynin kutusuna göre girer: omurga (kutunun 8 px içi) hep çocuk satırlarının solunda kalır.
    const left = parentRect ? parentRect.x + indent : x;
    let tagW = 0;
    let tagBox: TextBox | null = null;
    if (label) {
      tagBox = place(`tree-tag-${node.key}`, label.label, left + 2, cursor + pad, { maxWidth: 74, maxLines: 2, fontSize: 10, weight: 800 });
      tagW = tagBox.rect.w + 8;
    }
    const boxX = left + tagW;
    const leaf = node.children.length === 0;
    const text = place(`tree-${node.key}`, node.text, boxX + ICON, cursor + pad, {
      maxWidth: x + w - boxX - ICON - 8,
      maxLines: lines,
      fontSize: leaf ? 11.5 : 12.5,
      minFontSize: 10,
      weight: leaf ? 600 : 700,
    });
    const h = Math.max(text.rect.h, tagBox?.rect.h ?? 0) + pad * 2;
    const rect: Rect = { x: boxX, y: cursor, w: x + w - boxX, h };
    nodes.push({ key: node.key, depth: node.depth, leaf, tone: leaf ? tone : "neutral", rect, text });
    texts.push(text);
    if (tagBox && label) {
      tags.push({ tone: label.tone, box: tagBox });
      texts.push(tagBox);
    }
    if (parentRect && label) {
      const spineX = parentRect.x + 8;
      const midY = cursor + h / 2;
      edges.push({ tone: label.tone, points: [[spineX, parentRect.y + parentRect.h], [spineX, midY], [left - 1, midY]] });
    }
    cursor += h + rowGap;
    for (const child of node.children) visit(child.node, child.tone, { label: child.label, tone: child.tone }, rect);
  };
  visit(root, "neutral", null, null);
  return { mode: "indent", depth: lawTreeDepth(root), nodes, edges, tags, texts, segments: pathSegments("tree-edge", edges), markers: [], height: cursor - rowGap - y };
}

/** İki biçimden kesik yazı bırakmayanı seçer: önce katmanlı (yaprak sütuna sığıyorsa), sonra girintili. */
function layoutTree(place: TextPlacer, root: LawTreeNode, x: number, y: number, w: number, density: number, portrait: boolean): TreeLayout {
  const lines = density >= 2 ? 2 : 3;
  const compact = density >= 2;
  const maxCols = portrait ? 3 : w >= 420 ? 4 : 3;
  const whole = (tree: TreeLayout) => tree.texts.every((box) => !box.truncated);
  if (leafCount(root) <= maxCols) {
    const tidy = tidyTree(place, root, x, y, w, lines, compact);
    if (whole(tidy)) return tidy;
  }
  return indentTree(place, root, x, y, w, lines, compact);
}

function layoutMajority(place: TextPlacer, rows: LawDecisionData["majority"], x: number, y: number, w: number, notes = true): MajorityLayout | null {
  if (!rows.length) return null;
  const kicker = place("majority-kicker", "ÇOĞUNLUK BAROMETRESİ", x, y, { maxWidth: w, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
  let rowY = kicker.rect.y + kicker.rect.h + 6;
  const labelW = Math.round(w * 0.3);
  const valueW = Math.round(w * 0.26);
  const out = rows.map((row, index) => {
    const fraction = parseFraction(row.fraction)!;
    const ratio = fraction.num / fraction.den;
    const value = `${fraction.num}/${fraction.den}${row.count ? ` = ${row.count}` : ""}`;
    const label = place(`majority${index}-label`, row.label, x, rowY, { maxWidth: labelW - 6, maxLines: 2, fontSize: 10.5, minFontSize: 8.5, weight: 600 });
    const valueBox = place(`majority${index}-value`, value, x + w, rowY, { maxWidth: valueW - 6, maxLines: 1, fontSize: 11, minFontSize: 8.5, weight: 800, anchor: "end", single: true });
    const lineH = Math.max(valueBox.rect.h, 16);
    const track: Rect = { x: x + labelW, y: rowY + lineH / 2 - 5, w: w - labelW - valueW, h: 10 };
    // Toplam ve gerçekleşen: dolgu gerçekleşenin toplama oranı, eşik çizgisi kesirde; geçildiyse yeşil.
    const threshold = row.count ?? (row.total ? Math.ceil(row.total * ratio) : null);
    const pass = row.actual !== undefined && threshold !== null ? row.actual >= threshold : null;
    const fill = row.actual !== undefined && row.total ? Math.min(1, row.actual / row.total) : ratio;
    const noteText =
      row.actual !== undefined
        ? `${row.actual}${row.total ? `/${row.total}` : ""} · ${pass ? "eşik geçildi" : pass === false ? "eşik geçilmedi" : "gerçekleşen"}`
        : row.total
          ? `Toplam ${row.total}`
          : null;
    const note = noteText && notes ? place(`majority${index}-note`, noteText, track.x, track.y + track.h + 4, { maxWidth: track.w + valueW - 6, maxLines: 1, fontSize: 9.5, weight: 600, single: true }) : null;
    const h = Math.max(label.rect.h, lineH + (note ? note.rect.h + 4 : 0));
    rowY += h + 8;
    return { label, value: valueBox, note, track, ratio, fill, pass };
  });
  return {
    texts: [kicker, ...out.flatMap((row) => [row.label, row.value, ...(row.note ? [row.note] : [])])],
    segments: [],
    markers: out.map((row, index) => ({ id: `majority-track${index}`, rect: row.track })),
    height: rowY - 8 - y,
    kicker,
    rows: out,
  };
}

/**
 * Zaman çizgisi: durak başına en az 110 birim düşüyorsa yatay (tarih üstte, olay altta), dar alanda dikey (solda omurga,
 * her durak bir satır). Dar sütunda yatay çizgi her olayı harf harf bölüyordu.
 */
function layoutTimeline(place: TextPlacer, stops: LawDecisionData["timeline"], x: number, y: number, w: number, density: number): TimelineLayout | null {
  if (stops.length < 2) return null;
  const kicker = place("timeline-kicker", "ZAMAN ÇİZGİSİ", x, y, { maxWidth: w, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
  const n = stops.length;
  const spacing = w / n;
  const top = kicker.rect.y + kicker.rect.h + 6;
  if (spacing < 110) {
    const lineX = x + 6;
    const dateX = x + 18;
    const dateW = Math.min(96, Math.round(w * 0.3));
    const labelX = dateX + dateW + 8;
    let rowY = top;
    const events = stops.map((event, index) => {
      const date = place(`timeline${index}-date`, event.date, dateX, rowY, { maxWidth: dateW, maxLines: 2, fontSize: 10.5, minFontSize: 8.5, weight: 800 });
      const label = place(`timeline${index}-label`, event.label, labelX, rowY, { maxWidth: x + w - labelX, maxLines: density >= 2 ? 2 : 3, fontSize: 10.5, minFontSize: 8.5 });
      const h = Math.max(date.rect.h, label.rect.h);
      const out = { x: lineX, y: rowY + Math.min(h, date.lineHeightPx) / 2, date, label };
      rowY += h + 6;
      return out;
    });
    const bottom = rowY - 6;
    return {
      texts: [kicker, ...events.flatMap((event) => [event.date, event.label])],
      segments: [segment("timeline-line", lineX, top, lineX, bottom)],
      markers: [],
      height: bottom - y,
      kicker,
      vertical: true,
      line: { x1: lineX, y1: top, x2: lineX, y2: bottom },
      events,
    };
  }
  const dates = stops.map((event, index) =>
    place(`timeline${index}-date`, event.date, x + spacing * index + spacing / 2, top, { maxWidth: spacing - 6, maxLines: 2, fontSize: 10.5, minFontSize: 8.5, weight: 800, anchor: "middle" }),
  );
  const dateH = Math.max(...dates.map((box) => box.rect.h));
  const lineY = top + dateH + 7;
  const labels = stops.map((event, index) =>
    place(`timeline${index}-label`, event.label, x + spacing * index + spacing / 2, lineY + 8, {
      maxWidth: spacing - 6,
      maxLines: density >= 2 ? 3 : 4,
      fontSize: 10,
      minFontSize: 8,
      anchor: "middle",
    }),
  );
  const labelH = Math.max(...labels.map((box) => box.rect.h));
  return {
    texts: [kicker, ...dates, ...labels],
    segments: [segment("timeline-line", x, lineY, x + w, lineY)],
    markers: [],
    height: lineY + 8 + labelH - y,
    kicker,
    vertical: false,
    line: { x1: x, y1: lineY, x2: x + w, y2: lineY },
    events: stops.map((_, index) => ({ x: x + spacing * index + spacing / 2, y: lineY, date: dates[index]!, label: labels[index]! })),
  };
}

function layoutTable(place: TextPlacer, rule: string[], exception: string[], x: number, y: number, w: number, density: number): TableLayout | null {
  if (!rule.length) return null;
  const pad = 8;
  const split = exception.length > 0;
  const colW = split ? (w - 1) / 2 : w;
  const heads = [place("table-rule-head", "GENEL KURAL", x + pad, y + pad, { maxWidth: colW - pad * 2, maxLines: 1, fontSize: 10.5, weight: 800, single: true })];
  if (split) heads.push(place("table-exception-head", "İSTİSNA", x + colW + 1 + pad, y + pad, { maxWidth: colW - pad * 2, maxLines: 1, fontSize: 10.5, weight: 800, single: true }));
  const headBottom = y + pad + Math.max(...heads.map((head) => head.rect.h)) + 5;
  const lines = density >= 2 ? 2 : density >= 1 ? 3 : 4;
  const column = (items: string[], side: "rule" | "exception", left: number) => {
    let itemY = headBottom + 6;
    return items.map((item, index) => {
      const text = place(`table-${side}${index}`, item, left + pad + 12, itemY, { maxWidth: colW - pad * 2 - 12, maxLines: lines, fontSize: 10.5, minFontSize: 9 });
      const out = { side, bulletX: left + pad + 4, bulletY: itemY + text.fontSize * 0.55, text };
      itemY += text.rect.h + 5;
      return out;
    });
  };
  const ruleItems = column(rule, "rule", x);
  const exceptionItems = split ? column(exception, "exception", x + colW + 1) : [];
  const bottomOf = (list: typeof ruleItems) => (list.length ? Math.max(...list.map((item) => item.text.rect.y + item.text.rect.h)) : headBottom);
  const height = Math.max(bottomOf(ruleItems), bottomOf(exceptionItems)) + pad - y;
  const divider = split ? x + colW + 0.5 : null;
  return {
    texts: [...heads, ...ruleItems.map((item) => item.text), ...exceptionItems.map((item) => item.text)],
    segments: [...(divider !== null ? [segment("table-divider", divider, y + 4, divider, y + height - 4)] : []), segment("table-head-line", x + 4, headBottom, x + w - 4, headBottom)],
    markers: [],
    height,
    rect: { x, y, w, h: height },
    divider,
    heads,
    headBottom,
    items: [...ruleItems, ...exceptionItems],
  };
}

export function layoutLawDecision(data: LawDecisionData, frame: SceneFrame, domain?: AcademicDomain): LawDecisionLayout {
  const { content } = frame;
  const place = textPlacer(frame);
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Hukuk · Sosyal"} · ${ARCHETYPE_LABEL.LAW_SOCIAL_FLOWCHART}`;
  const header = layoutHeader(frame, data.title, badge);
  const top = header.bottom + 12;
  const bottom = content.y + content.h;
  const gap = frame.portrait ? 14 : 12;
  const root = lawTreeOf(data)!;

  // Etiket bütçesi: ağaç hep tam; fazlası zaman çizgisinden, istisnadan, kuraldan, çoğunluktan düşer.
  const rule = data.ruleVsException?.rule ?? [];
  const exception = data.ruleVsException?.exception ?? [];
  const [, majorityN, ruleN, exceptionN, timelineN] = labelBudget(frame.text.maxLabels, [
    { count: lawTreeNodes(root).length, keep: Number.POSITIVE_INFINITY },
    { count: data.majority.length, keep: 1 },
    { count: rule.length, keep: 1 },
    { count: exception.length, keep: 0 },
    { count: data.timeline.length, keep: 0 },
  ]);
  const majorityRows = data.majority.slice(0, majorityN);
  const ruleRows = rule.slice(0, ruleN);
  const exceptionRows = exception.slice(0, exceptionN);
  const stops = data.timeline.slice(0, timelineN);

  // Yatayda solda ağaç ve zaman çizgisi, sağda tablo ve çoğunluk (dar sütunda zaman çizgisi dikey akar).
  const hasRight = ruleRows.length > 0 || majorityRows.length > 0;
  const colGap = 18;
  const leftW = frame.portrait || !hasRight ? content.w : (content.w - colGap) * 0.5;
  const rightX = frame.portrait ? content.x : content.x + leftW + colGap;
  const rightW = frame.portrait ? content.w : content.w - leftW - colGap;
  /**
   * Sığdırma basamakları: önce satırlar azalır (yoğunluk 0-2), sonra çoğunluk alt satırı gizlenir, en son zaman çizgisi,
   * istisna sütunu ve ikinci çoğunluk satırı çizimden düşer (düz metin görünümünde kalır). Yazı tabanın altına inmez.
   */
  type Step = { density: number; notes: boolean; timeline: boolean; exceptions: boolean; majorityMax: number };
  const steps: Step[] = [
    { density: 0, notes: true, timeline: true, exceptions: true, majorityMax: 3 },
    { density: 1, notes: true, timeline: true, exceptions: true, majorityMax: 3 },
    { density: 2, notes: true, timeline: true, exceptions: true, majorityMax: 3 },
    { density: 2, notes: false, timeline: true, exceptions: true, majorityMax: 3 },
    { density: 2, notes: false, timeline: false, exceptions: true, majorityMax: 3 },
    { density: 2, notes: false, timeline: false, exceptions: false, majorityMax: 3 },
    { density: 2, notes: false, timeline: false, exceptions: false, majorityMax: 1 },
  ];
  type At = { tree: number; majority: number; timeline: number; table: number };
  const make = (step: Step, at: At) => ({
    tree: layoutTree(place, root, content.x, at.tree, leftW, step.density, frame.portrait),
    majority: layoutMajority(place, majorityRows.slice(0, step.majorityMax), frame.portrait || !hasRight ? content.x : rightX, at.majority, frame.portrait || !hasRight ? content.w : rightW, step.notes),
    timeline: step.timeline ? layoutTimeline(place, stops, content.x, at.timeline, leftW, step.density) : null,
    table: layoutTable(place, ruleRows, step.exceptions ? exceptionRows : [], rightX, at.table, rightW, step.density),
  });
  const room = bottom - top;
  const zero: At = { tree: 0, majority: 0, timeline: 0, table: 0 };
  const stackH = (parts: (Section | null)[]) => {
    const list = parts.filter(Boolean) as Section[];
    return list.reduce((sum, part) => sum + part.height, 0) + gap * Math.max(0, list.length - 1);
  };
  const columns = (m: ReturnType<typeof make>) => {
    const leftTotal = stackH([m.tree, m.timeline]);
    const rightTotal = stackH([m.table, m.majority]);
    return { leftTotal, rightTotal, top: Math.max(leftTotal, rightTotal) };
  };
  const totalOf = (m: ReturnType<typeof make>) => {
    if (frame.portrait || !hasRight) {
      const parts = [m.tree, m.majority, m.timeline, m.table].filter(Boolean) as Section[];
      return parts.reduce((sum, part) => sum + part.height, 0) + gap * (parts.length - 1);
    }
    return columns(m).top;
  };
  const whole = (m: ReturnType<typeof make>) => [m.tree, m.majority, m.timeline, m.table].every((part) => !part || part.texts.every((box) => !box.truncated));
  let pick = steps[0]!;
  let measured = make(pick, zero);
  for (const step of steps) {
    pick = step;
    measured = make(step, zero);
    if (totalOf(measured) <= room && whole(measured)) break;
  }
  const at = { ...zero };
  if (frame.portrait || !hasRight) {
    const order = (["tree", "majority", "timeline", "table"] as const).filter((key) => measured[key]);
    const total = totalOf(measured);
    const extra = Math.max(0, room - total);
    const spread = order.length > 1 ? Math.min(18, extra / (order.length - 1)) : 0;
    let cursor = top + Math.max(0, (extra - spread * (order.length - 1)) / 2);
    for (const key of order) {
      at[key] = cursor;
      cursor += measured[key]!.height + gap + spread;
    }
  } else {
    const { leftTotal, rightTotal, top: blockH } = columns(measured);
    const start = top + Math.max(0, (room - blockH) / 2);
    at.tree = start + Math.max(0, (blockH - leftTotal) / 2);
    at.timeline = at.tree + measured.tree.height + gap;
    at.table = start + Math.max(0, (blockH - rightTotal) / 2);
    at.majority = at.table + (measured.table ? measured.table.height + gap : 0);
  }
  const final = make(pick, at);
  const sections = [final.tree, final.majority, final.timeline, final.table].filter((part): part is NonNullable<typeof part> => Boolean(part)) as Section[];
  return {
    frame,
    texts: [...header.texts, ...sections.flatMap((part) => part.texts)],
    segments: sections.flatMap((part) => part.segments),
    markers: sections.flatMap((part) => part.markers),
    tree: final.tree,
    majority: final.majority,
    timeline: final.timeline,
    table: final.table,
  };
}

function edgePath(points: [number, number][]): string {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ");
}

export function LawDecisionScene({ data, domain, ...common }: SceneCommonProps & { data: LawDecisionData; domain?: AcademicDomain }) {
  const layout = layoutLawDecision(data, common.frame, domain);
  const [badge, title] = layout.texts;
  const { tree, majority, timeline, table } = layout;
  const root = lawTreeOf(data)!;
  const iconFont = layout.frame.text.floor;
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${lawTreeNodes(root)
        .map((node) => node.text)
        .join(" → ")}`}
      archetype="LAW_SOCIAL_FLOWCHART"
      background={LAW_COLORS.bg}
    >
      <SceneBadge box={badge!} color={LAW_COLORS.question} textColor={LAW_COLORS.question} />
      <SceneText box={title!} fill={LAW_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      {/* Karar ağacı */}
      <g data-section="decision-tree" data-tree-mode={tree.mode} data-tree-depth={tree.depth}>
        {tree.edges.map((edge, index) => (
          <path
            key={`edge${index}`}
            d={edgePath(edge.points)}
            fill="none"
            stroke={TONE_COLOR[edge.tone]}
            strokeWidth={2.4}
            strokeLinejoin="round"
            pathLength={1}
            className="cp-vs-draw"
            style={delay(0.6 + index * 0.12, 0.45)}
            data-edge={edge.tone}
          />
        ))}
        {tree.tags.map((tag, index) => (
          <SceneText key={`tag${index}`} box={tag.box} fill={TONE_COLOR[tag.tone]} className="cp-vs-fade" style={delay(0.8 + index * 0.1)} />
        ))}
        {tree.nodes.map((node, index) => {
          const color = node.leaf ? TONE_COLOR[node.tone] : LAW_COLORS.question;
          const iconX = node.rect.x + 13;
          const iconY = node.rect.y + Math.min(node.rect.h / 2, 15);
          return (
            <g
              key={node.key}
              className="cp-vs-fade"
              style={delay(0.3 + node.depth * 0.5 + index * 0.05)}
              data-node={node.leaf ? "leaf" : "question"}
              data-depth={node.depth}
              data-branch={node.leaf ? (node.tone === "positive" ? "yes" : node.tone === "negative" ? "no" : "branch") : undefined}
            >
              <rect
                x={node.rect.x}
                y={node.rect.y}
                width={node.rect.w}
                height={node.rect.h}
                rx={node.leaf ? 10 : Math.min(node.rect.h / 2, 16)}
                fill={node.leaf ? color : LAW_COLORS.panel}
                fillOpacity={node.leaf ? 0.12 : 1}
                stroke={color}
                strokeWidth={node.leaf ? 1.6 : 1.8}
              />
              <circle cx={iconX} cy={iconY} r={7.5} fill={color} />
              {node.leaf ? (
                <path
                  d={
                    node.tone === "positive"
                      ? `M${iconX - 3.5},${iconY} l2.5,2.8 l4.5,-5`
                      : node.tone === "negative"
                        ? `M${iconX - 3},${iconY - 3} l6,6 M${iconX + 3},${iconY - 3} l-6,6`
                        : `M${iconX - 3},${iconY} h6`
                  }
                  stroke={LAW_COLORS.bg}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                />
              ) : (
                <text x={iconX} y={iconY + iconFont * 0.36} fontSize={iconFont} fontWeight={800} textAnchor="middle" fill={LAW_COLORS.bg}>
                  ?
                </text>
              )}
              <SceneText box={node.text} fill={LAW_COLORS.text} />
            </g>
          );
        })}
      </g>

      {/* Çoğunluk barometresi */}
      {majority ? (
        <g data-section="majority" className="cp-vs-fade" style={delay(1.7)}>
          <SceneText box={majority.kicker} fill={LAW_COLORS.bar} />
          {majority.rows.map((row, index) => {
            const color = row.pass === null ? LAW_COLORS.bar : row.pass ? LAW_COLORS.yes : LAW_COLORS.no;
            const thresholdX = row.track.x + row.track.w * row.ratio;
            return (
              <g key={index} data-ratio={row.ratio.toFixed(3)} data-pass={row.pass === null ? undefined : row.pass ? "1" : "0"}>
                <SceneText box={row.label} fill={LAW_COLORS.muted} />
                <rect x={row.track.x} y={row.track.y} width={row.track.w} height={row.track.h} rx={5} fill={LAW_COLORS.track} />
                <rect
                  x={row.track.x}
                  y={row.track.y}
                  width={row.track.w * row.fill}
                  height={row.track.h}
                  rx={5}
                  fill={color}
                  className="cp-vs-grow"
                  style={{ ...delay(1.9 + index * 0.2), transformOrigin: `${row.track.x}px ${row.track.y}px` }}
                />
                {/* Eşik (gerçekleşen varsa) ya da yarı çizgisi */}
                {row.pass === null ? (
                  <line x1={row.track.x + row.track.w / 2} y1={row.track.y - 2} x2={row.track.x + row.track.w / 2} y2={row.track.y + row.track.h + 2} stroke={LAW_COLORS.text} strokeOpacity={0.5} strokeWidth={1} />
                ) : (
                  <g data-threshold="1">
                    <line x1={thresholdX} y1={row.track.y - 3} x2={thresholdX} y2={row.track.y + row.track.h + 3} stroke={LAW_COLORS.text} strokeWidth={1.6} />
                    <path d={`M${thresholdX - 3.5},${row.track.y - 7} L${thresholdX + 3.5},${row.track.y - 7} L${thresholdX},${row.track.y - 2} z`} fill={LAW_COLORS.text} />
                  </g>
                )}
                <SceneText box={row.value} fill={LAW_COLORS.text} />
                {row.note ? <SceneText box={row.note} fill={row.pass === null ? LAW_COLORS.muted : color} /> : null}
              </g>
            );
          })}
        </g>
      ) : null}

      {/* Zaman çizgisi */}
      {timeline ? (
        <g data-section="timeline">
          <SceneText box={timeline.kicker} fill={LAW_COLORS.time} className="cp-vs-fade" style={delay(1.8)} />
          <line x1={timeline.line.x1} y1={timeline.line.y1} x2={timeline.line.x2} y2={timeline.line.y2} stroke={LAW_COLORS.time} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(1.9, 0.8)} />
          {timeline.events.map((event, index) => (
            <g key={index} className="cp-vs-fade" style={delay(2 + index * 0.18)}>
              <circle cx={event.x} cy={event.y} r={4.5} fill={LAW_COLORS.bg} stroke={LAW_COLORS.time} strokeWidth={2} />
              <SceneText box={event.date} fill={LAW_COLORS.time} />
              <SceneText box={event.label} fill={LAW_COLORS.muted} />
            </g>
          ))}
        </g>
      ) : null}

      {/* Genel Kural vs. İstisna (isteğe bağlı) */}
      {table ? (
        <g data-section="rule-vs-exception" className="cp-vs-fade" style={delay(2.2)}>
          <rect x={table.rect.x} y={table.rect.y} width={table.rect.w} height={table.rect.h} rx={10} fill={LAW_COLORS.panel} stroke={LAW_COLORS.stroke} />
          <rect x={table.rect.x} y={table.rect.y} width={(table.divider ?? table.rect.x + table.rect.w) - table.rect.x} height={table.headBottom - table.rect.y} rx={10} fill={LAW_COLORS.rule} fillOpacity={0.16} />
          {table.divider !== null ? (
            <>
              <rect x={table.divider} y={table.rect.y} width={table.rect.x + table.rect.w - table.divider} height={table.headBottom - table.rect.y} rx={10} fill={LAW_COLORS.exception} fillOpacity={0.16} />
              <line x1={table.divider} y1={table.rect.y + 4} x2={table.divider} y2={table.rect.y + table.rect.h - 4} stroke={LAW_COLORS.stroke} strokeWidth={1.2} />
            </>
          ) : null}
          <line x1={table.rect.x + 4} y1={table.headBottom} x2={table.rect.x + table.rect.w - 4} y2={table.headBottom} stroke={LAW_COLORS.stroke} strokeWidth={1.2} />
          <SceneText box={table.heads[0]!} fill={LAW_COLORS.rule} />
          {table.heads[1] ? <SceneText box={table.heads[1]} fill={LAW_COLORS.exception} /> : null}
          {table.items.map((item, index) => (
            <g key={index}>
              <circle cx={item.bulletX} cy={item.bulletY} r={3} fill={item.side === "rule" ? LAW_COLORS.rule : LAW_COLORS.exception} />
              <SceneText box={item.text} fill={LAW_COLORS.text} />
            </g>
          ))}
        </g>
      ) : null}
    </SceneSvg>
  );
}
