"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  layoutHeader,
  placeText,
  segment,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type Segment,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import { parseFraction, type LawDecisionData } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, type SceneCommonProps } from "./scene-kit";

/**
 * LAW_SOCIAL_FLOWCHART (Hukuk, KPSS, Anayasa, Tarih, Felsefe): dallanan karar ağacı (Şart sağlandı mı?
 * → Evet yeşil dal / Hayır kırmızı dal), çoğunluk doluluk barometresi (3/5 = 360, 2/3 = 400 görsel barı),
 * kronolojik zaman çizgisi ve "Genel Kural vs. İstisna" iki sütunlu renkli karşılaştırma tablosu.
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
  rule: "#60a5fa",
  exception: "#f59e0b",
  bar: "#818cf8",
  track: "#232c45",
  time: "#38bdf8",
} as const;

type Section = { texts: TextBox[]; segments: Segment[]; markers: SceneLayout["markers"]; height: number };

export type TreeLayout = Section & {
  question: { rect: Rect; text: TextBox };
  stem: { x: number; y1: number; y2: number };
  bar: { x1: number; x2: number; y: number };
  yes: { rect: Rect; text: TextBox; tag: TextBox; dropX: number };
  no: { rect: Rect; text: TextBox; tag: TextBox; dropX: number };
};
export type MajorityLayout = Section & {
  kicker: TextBox;
  rows: { label: TextBox; value: TextBox; track: Rect; ratio: number }[];
};
export type TimelineLayout = Section & {
  kicker: TextBox;
  line: { x1: number; x2: number; y: number };
  events: { x: number; date: TextBox; label: TextBox }[];
};
export type TableLayout = Section & {
  rect: Rect;
  divider: number;
  heads: [TextBox, TextBox];
  headBottom: number;
  items: { side: "rule" | "exception"; bulletX: number; bulletY: number; text: TextBox }[];
};

export type LawDecisionLayout = SceneLayout & {
  tree: TreeLayout;
  majority: MajorityLayout | null;
  timeline: TimelineLayout | null;
  table: TableLayout;
};

function layoutTree(data: LawDecisionData, x: number, y: number, w: number, density: number): TreeLayout {
  const pad = 8;
  const qText = placeText("tree-question", data.decision.question, x + w / 2, y + pad, {
    maxWidth: w * 0.82 - 30,
    maxLines: density >= 2 ? 1 : 2,
    fontSize: 13,
    minFontSize: 10,
    weight: 700,
    anchor: "middle",
  });
  const qRect: Rect = { x: x + w / 2 - qText.rect.w / 2 - 22, y, w: qText.rect.w + 44, h: qText.rect.h + pad * 2 };
  const qBottom = qRect.y + qRect.h;
  const barY = qBottom + 22;
  const boxW = (w - 12) / 2;
  const yesX = x;
  const noX = x + boxW + 12;
  const tagYes = placeText("tree-yes-tag", "EVET", yesX + boxW / 2, barY - 4 - 12, { maxWidth: 60, maxLines: 1, fontSize: 9.5, weight: 800, anchor: "middle", single: true });
  const tagNo = placeText("tree-no-tag", "HAYIR", noX + boxW / 2, barY - 4 - 12, { maxWidth: 60, maxLines: 1, fontSize: 9.5, weight: 800, anchor: "middle", single: true });
  // Etiketler yatay dalın üstünde, dikey gövdeden uzakta: gövde ortada, etiketler çeyreklerde.
  const tagYesBox = { ...tagYes, x: yesX + boxW * 0.5 - 0, rect: tagYes.rect };
  const boxTop = barY + 12;
  const lines = density >= 1 ? 2 : 3;
  const yesText = placeText("tree-yes", data.decision.yes, yesX + 26, boxTop + 8, { maxWidth: boxW - 34, maxLines: lines, fontSize: 11.5, minFontSize: 9.5, weight: 600 });
  const noText = placeText("tree-no", data.decision.no, noX + 26, boxTop + 8, { maxWidth: boxW - 34, maxLines: lines, fontSize: 11.5, minFontSize: 9.5, weight: 600 });
  const boxH = Math.max(yesText.rect.h, noText.rect.h, 18) + 16;
  const yesRect: Rect = { x: yesX, y: boxTop, w: boxW, h: boxH };
  const noRect: Rect = { x: noX, y: boxTop, w: boxW, h: boxH };
  const stemX = x + w / 2;
  const yesDrop = yesX + boxW / 2;
  const noDrop = noX + boxW / 2;
  // Dal etiketi dalın üstünde ama düşey inişin hemen yanında olmasın diye inişten içeri kaydırılır.
  const yesTag = { ...tagYesBox, x: (yesDrop + stemX) / 2, rect: { ...tagYes.rect, x: (yesDrop + stemX) / 2 - tagYes.rect.w / 2 } };
  const noTag = { ...tagNo, x: (noDrop + stemX) / 2, rect: { ...tagNo.rect, x: (noDrop + stemX) / 2 - tagNo.rect.w / 2 } };
  const segments = [
    segment("tree-stem", stemX, qBottom, stemX, barY),
    segment("tree-bar", yesDrop, barY, noDrop, barY),
    segment("tree-yes-drop", yesDrop, barY, yesDrop, boxTop),
    segment("tree-no-drop", noDrop, barY, noDrop, boxTop),
  ];
  return {
    texts: [qText, yesTag, noTag, yesText, noText],
    segments,
    markers: [],
    height: boxTop + boxH - y,
    question: { rect: qRect, text: qText },
    stem: { x: stemX, y1: qBottom, y2: barY },
    bar: { x1: yesDrop, x2: noDrop, y: barY },
    yes: { rect: yesRect, text: yesText, tag: yesTag, dropX: yesDrop },
    no: { rect: noRect, text: noText, tag: noTag, dropX: noDrop },
  };
}

function layoutMajority(data: LawDecisionData, x: number, y: number, w: number): MajorityLayout | null {
  if (!data.majority.length) return null;
  const kicker = placeText("majority-kicker", "ÇOĞUNLUK BAROMETRESİ", x, y, { maxWidth: w, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
  let rowY = kicker.rect.y + kicker.rect.h + 6;
  const labelW = Math.round(w * 0.3);
  const valueW = Math.round(w * 0.26);
  const rows = data.majority.map((row, index) => {
    const fraction = parseFraction(row.fraction)!;
    const value = `${fraction.num}/${fraction.den}${row.count ? ` = ${row.count}` : ""}`;
    const label = placeText(`majority${index}-label`, row.label, x, rowY, { maxWidth: labelW - 6, maxLines: 1, fontSize: 10.5, minFontSize: 8.5, weight: 600, single: true });
    const valueBox = placeText(`majority${index}-value`, value, x + w, rowY, { maxWidth: valueW - 6, maxLines: 1, fontSize: 11, minFontSize: 8.5, weight: 800, anchor: "end", single: true });
    const h = Math.max(label.rect.h, valueBox.rect.h, 14);
    const track: Rect = { x: x + labelW, y: rowY + h / 2 - 5, w: w - labelW - valueW, h: 10 };
    rowY += h + 6;
    return { label, value: valueBox, track, ratio: fraction.num / fraction.den };
  });
  return {
    texts: [kicker, ...rows.flatMap((row) => [row.label, row.value])],
    segments: [],
    markers: rows.map((row, index) => ({ id: `majority-track${index}`, rect: row.track })),
    height: rowY - 6 - y,
    kicker,
    rows,
  };
}

function layoutTimeline(data: LawDecisionData, x: number, y: number, w: number, density: number): TimelineLayout | null {
  if (data.timeline.length < 2) return null;
  const kicker = placeText("timeline-kicker", "ZAMAN ÇİZGİSİ", x, y, { maxWidth: w, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
  const n = data.timeline.length;
  const spacing = w / n;
  const dateTop = kicker.rect.y + kicker.rect.h + 4;
  const dates = data.timeline.map((event, index) =>
    placeText(`timeline${index}-date`, event.date, x + spacing * index + spacing / 2, dateTop, { maxWidth: spacing - 6, maxLines: 1, fontSize: 10.5, minFontSize: 8.5, weight: 800, anchor: "middle", single: true }),
  );
  const dateH = Math.max(...dates.map((box) => box.rect.h));
  const lineY = dateTop + dateH + 7;
  const labels = data.timeline.map((event, index) =>
    placeText(`timeline${index}-label`, event.label, x + spacing * index + spacing / 2, lineY + 8, {
      maxWidth: spacing - 6,
      maxLines: density >= 2 ? 1 : 2,
      fontSize: 10,
      minFontSize: 8.5,
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
    line: { x1: x, x2: x + w, y: lineY },
    events: data.timeline.map((_, index) => ({ x: x + spacing * index + spacing / 2, date: dates[index]!, label: labels[index]! })),
  };
}

function layoutTable(data: LawDecisionData, x: number, y: number, w: number, density: number): TableLayout {
  const pad = 8;
  const colW = (w - 1) / 2;
  const headRule = placeText("table-rule-head", "GENEL KURAL", x + pad, y + pad, { maxWidth: colW - pad * 2, maxLines: 1, fontSize: 10.5, weight: 800, single: true });
  const headExc = placeText("table-exception-head", "İSTİSNA", x + colW + 1 + pad, y + pad, { maxWidth: colW - pad * 2, maxLines: 1, fontSize: 10.5, weight: 800, single: true });
  const headBottom = y + pad + Math.max(headRule.rect.h, headExc.rect.h) + 5;
  const lines = density >= 2 ? 1 : density >= 1 ? 2 : 3;
  const column = (items: string[], side: "rule" | "exception", left: number) => {
    let itemY = headBottom + 6;
    return items.map((item, index) => {
      const text = placeText(`table-${side}${index}`, item, left + pad + 12, itemY, { maxWidth: colW - pad * 2 - 12, maxLines: lines, fontSize: 10.5, minFontSize: 9 });
      const out = { side, bulletX: left + pad + 4, bulletY: itemY + text.fontSize * 0.55, text };
      itemY += text.rect.h + 5;
      return out;
    });
  };
  const rule = column(data.ruleVsException.rule, "rule", x);
  const exception = column(data.ruleVsException.exception, "exception", x + colW + 1);
  const bottomOf = (list: typeof rule) => (list.length ? Math.max(...list.map((item) => item.text.rect.y + item.text.rect.h)) : headBottom);
  const height = Math.max(bottomOf(rule), bottomOf(exception)) + pad - y;
  const divider = x + colW + 0.5;
  return {
    texts: [headRule, headExc, ...rule.map((item) => item.text), ...exception.map((item) => item.text)],
    segments: [segment("table-divider", divider, y + 4, divider, y + height - 4), segment("table-head-line", x + 4, headBottom, x + w - 4, headBottom)],
    markers: [],
    height,
    rect: { x, y, w, h: height },
    divider,
    heads: [headRule, headExc],
    headBottom,
    items: [...rule, ...exception],
  };
}

export function layoutLawDecision(data: LawDecisionData, frame: SceneFrame, domain?: AcademicDomain): LawDecisionLayout {
  const { content } = frame;
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Hukuk · Sosyal"} · ${ARCHETYPE_LABEL.LAW_SOCIAL_FLOWCHART}`;
  const header = layoutHeader(frame, data.title, badge);
  const top = header.bottom + 12;
  const bottom = content.y + content.h;
  const gap = frame.portrait ? 14 : 12;

  const colGap = 18;
  const leftW = frame.portrait ? content.w : (content.w - colGap) * 0.5;
  const rightX = frame.portrait ? content.x : content.x + leftW + colGap;
  const rightW = frame.portrait ? content.w : content.w - leftW - colGap;
  // Her bölüm önce y=0'da ölçülür, sonra hesaplanan yerinde yeniden kurulur (saf ve ucuz).
  const make = (density: number, at: { tree: number; majority: number; timeline: number; table: number }) => ({
    tree: layoutTree(data, content.x, at.tree, leftW, density),
    majority: layoutMajority(data, content.x, at.majority, leftW),
    timeline: layoutTimeline(data, rightX, at.timeline, rightW, density),
    table: layoutTable(data, rightX, at.table, rightW, density),
  });
  const room = bottom - top;
  const zero = { tree: 0, majority: 0, timeline: 0, table: 0 };
  const totalOf = (m: ReturnType<typeof make>) => {
    if (frame.portrait) {
      const parts = [m.tree, m.majority, m.timeline, m.table].filter(Boolean) as Section[];
      return parts.reduce((sum, part) => sum + part.height, 0) + gap * (parts.length - 1);
    }
    const leftTotal = m.tree.height + (m.majority ? gap + m.majority.height : 0);
    const rightTotal = m.table.height + (m.timeline ? gap + m.timeline.height : 0);
    return Math.max(leftTotal, rightTotal);
  };
  let density = 0;
  let measured = make(0, zero);
  while (totalOf(measured) > room && density < 2) {
    density += 1;
    measured = make(density, zero);
  }
  const at = { ...zero };
  if (frame.portrait) {
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
    const leftTotal = measured.tree.height + (measured.majority ? gap + measured.majority.height : 0);
    const rightTotal = measured.table.height + (measured.timeline ? gap + measured.timeline.height : 0);
    at.tree = top + Math.max(0, (room - leftTotal) / 2);
    at.majority = at.tree + measured.tree.height + gap;
    at.table = top + Math.max(0, (room - rightTotal) / 2);
    at.timeline = at.table + measured.table.height + gap;
  }
  const final = make(density, at);
  const tree = final.tree;
  const majority = final.majority;
  const timeline = final.timeline;
  const table = final.table;
  const sections = [tree, majority, timeline, table].filter((part): part is NonNullable<typeof part> => Boolean(part)) as Section[];
  return {
    frame,
    texts: [...header.texts, ...sections.flatMap((part) => part.texts)],
    segments: sections.flatMap((part) => part.segments),
    markers: sections.flatMap((part) => part.markers),
    tree,
    majority,
    timeline,
    table,
  };
}

export function LawDecisionScene({ data, domain, ...common }: SceneCommonProps & { data: LawDecisionData; domain?: AcademicDomain }) {
  const layout = layoutLawDecision(data, common.frame, domain);
  const [badge, title] = layout.texts;
  const { tree, majority, timeline, table } = layout;
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${data.decision.question} Evet: ${data.decision.yes}. Hayır: ${data.decision.no}.`}
      archetype="LAW_SOCIAL_FLOWCHART"
      background={LAW_COLORS.bg}
    >
      <SceneBadge box={badge!} color={LAW_COLORS.question} textColor={LAW_COLORS.question} />
      <SceneText box={title!} fill={LAW_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      {/* Karar ağacı */}
      <g data-section="decision-tree">
        <rect
          x={tree.question.rect.x}
          y={tree.question.rect.y}
          width={tree.question.rect.w}
          height={tree.question.rect.h}
          rx={tree.question.rect.h / 2}
          fill={LAW_COLORS.panel}
          stroke={LAW_COLORS.question}
          strokeWidth={1.8}
          pathLength={1}
          className="cp-vs-draw"
          style={delay(0.25, 0.6)}
        />
        <circle cx={tree.question.rect.x + 13} cy={tree.question.rect.y + tree.question.rect.h / 2} r={7} fill={LAW_COLORS.question} className="cp-vs-fade" style={delay(0.35)} />
        <text x={tree.question.rect.x + 13} y={tree.question.rect.y + tree.question.rect.h / 2 + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill={LAW_COLORS.bg} className="cp-vs-fade" style={delay(0.35)}>
          ?
        </text>
        <SceneText box={tree.question.text} fill={LAW_COLORS.text} className="cp-vs-fade" style={delay(0.4)} />
        <line x1={tree.stem.x} y1={tree.stem.y1} x2={tree.stem.x} y2={tree.stem.y2} stroke={LAW_COLORS.muted} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(0.6, 0.3)} />
        <line x1={tree.stem.x} y1={tree.bar.y} x2={tree.bar.x1} y2={tree.bar.y} stroke={LAW_COLORS.yes} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(0.85, 0.4)} />
        <line x1={tree.stem.x} y1={tree.bar.y} x2={tree.bar.x2} y2={tree.bar.y} stroke={LAW_COLORS.no} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(0.85, 0.4)} />
        <line x1={tree.yes.dropX} y1={tree.bar.y} x2={tree.yes.dropX} y2={tree.yes.rect.y} stroke={LAW_COLORS.yes} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(1.2, 0.25)} />
        <line x1={tree.no.dropX} y1={tree.bar.y} x2={tree.no.dropX} y2={tree.no.rect.y} stroke={LAW_COLORS.no} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(1.2, 0.25)} />
        <SceneText box={tree.yes.tag} fill={LAW_COLORS.yes} className="cp-vs-fade" style={delay(1)} letterSpacing={0.6} />
        <SceneText box={tree.no.tag} fill={LAW_COLORS.no} className="cp-vs-fade" style={delay(1)} letterSpacing={0.6} />
        {(["yes", "no"] as const).map((side) => {
          const branch = tree[side];
          const color = side === "yes" ? LAW_COLORS.yes : LAW_COLORS.no;
          const iconX = branch.rect.x + 13;
          const iconY = branch.rect.y + 15;
          return (
            <g key={side} className="cp-vs-fade" style={delay(1.4)} data-branch={side}>
              <rect x={branch.rect.x} y={branch.rect.y} width={branch.rect.w} height={branch.rect.h} rx={10} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.6} />
              <circle cx={iconX} cy={iconY} r={7} fill={color} />
              <path
                d={side === "yes" ? `M${iconX - 3.5},${iconY} l2.5,2.8 l4.5,-5` : `M${iconX - 3},${iconY - 3} l6,6 M${iconX + 3},${iconY - 3} l-6,6`}
                stroke={LAW_COLORS.bg}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
              <SceneText box={branch.text} fill={LAW_COLORS.text} />
            </g>
          );
        })}
      </g>

      {/* Çoğunluk barometresi */}
      {majority ? (
        <g data-section="majority" className="cp-vs-fade" style={delay(1.7)}>
          <SceneText box={majority.kicker} fill={LAW_COLORS.bar} letterSpacing={0.6} />
          {majority.rows.map((row, index) => (
            <g key={index} data-ratio={row.ratio.toFixed(3)}>
              <SceneText box={row.label} fill={LAW_COLORS.muted} />
              <rect x={row.track.x} y={row.track.y} width={row.track.w} height={row.track.h} rx={5} fill={LAW_COLORS.track} />
              <rect
                x={row.track.x}
                y={row.track.y}
                width={row.track.w * row.ratio}
                height={row.track.h}
                rx={5}
                fill={LAW_COLORS.bar}
                className="cp-vs-grow"
                style={{ ...delay(1.9 + index * 0.2), transformOrigin: `${row.track.x}px ${row.track.y}px` }}
              />
              {/* Yarı eşiği */}
              <line x1={row.track.x + row.track.w / 2} y1={row.track.y - 2} x2={row.track.x + row.track.w / 2} y2={row.track.y + row.track.h + 2} stroke={LAW_COLORS.text} strokeOpacity={0.5} strokeWidth={1} />
              <SceneText box={row.value} fill={LAW_COLORS.text} />
            </g>
          ))}
        </g>
      ) : null}

      {/* Zaman çizgisi */}
      {timeline ? (
        <g data-section="timeline">
          <SceneText box={timeline.kicker} fill={LAW_COLORS.time} className="cp-vs-fade" style={delay(1.8)} letterSpacing={0.6} />
          <line x1={timeline.line.x1} y1={timeline.line.y} x2={timeline.line.x2} y2={timeline.line.y} stroke={LAW_COLORS.time} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(1.9, 0.8)} />
          {timeline.events.map((event, index) => (
            <g key={index} className="cp-vs-fade" style={delay(2 + index * 0.18)}>
              <circle cx={event.x} cy={timeline.line.y} r={4.5} fill={LAW_COLORS.bg} stroke={LAW_COLORS.time} strokeWidth={2} />
              <SceneText box={event.date} fill={LAW_COLORS.time} />
              <SceneText box={event.label} fill={LAW_COLORS.muted} />
            </g>
          ))}
        </g>
      ) : null}

      {/* Genel Kural vs. İstisna */}
      <g data-section="rule-vs-exception" className="cp-vs-fade" style={delay(2.2)}>
        <rect x={table.rect.x} y={table.rect.y} width={table.rect.w} height={table.rect.h} rx={10} fill={LAW_COLORS.panel} stroke={LAW_COLORS.stroke} />
        <rect x={table.rect.x} y={table.rect.y} width={table.divider - table.rect.x} height={table.headBottom - table.rect.y} rx={10} fill={LAW_COLORS.rule} fillOpacity={0.16} />
        <rect x={table.divider} y={table.rect.y} width={table.rect.x + table.rect.w - table.divider} height={table.headBottom - table.rect.y} rx={10} fill={LAW_COLORS.exception} fillOpacity={0.16} />
        <line x1={table.divider} y1={table.rect.y + 4} x2={table.divider} y2={table.rect.y + table.rect.h - 4} stroke={LAW_COLORS.stroke} strokeWidth={1.2} />
        <line x1={table.rect.x + 4} y1={table.headBottom} x2={table.rect.x + table.rect.w - 4} y2={table.headBottom} stroke={LAW_COLORS.stroke} strokeWidth={1.2} />
        <SceneText box={table.heads[0]} fill={LAW_COLORS.rule} letterSpacing={0.6} />
        <SceneText box={table.heads[1]} fill={LAW_COLORS.exception} letterSpacing={0.6} />
        {table.items.map((item, index) => (
          <g key={index}>
            <circle cx={item.bulletX} cy={item.bulletY} r={3} fill={item.side === "rule" ? LAW_COLORS.rule : LAW_COLORS.exception} />
            <SceneText box={item.text} fill={LAW_COLORS.text} />
          </g>
        ))}
      </g>
    </SceneSvg>
  );
}
