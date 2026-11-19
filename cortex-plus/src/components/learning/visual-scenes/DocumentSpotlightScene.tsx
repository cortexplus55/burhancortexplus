"use client";

import { ARCHETYPE_LABEL } from "@/lib/learning/visual-scenes/archetype";
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
import type { DocumentSpotlightData } from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * DOCUMENT_FIGURE_SPOTLIGHT (öğrencinin yüklediği PDF/fotoğraftaki şekil/tablo): belgedeki gerçek tablo
 * (ya da sayfa görüntüsü) sahnenin merkezindeki kâğıda oturur; ilgili hücre/nokta yarı saydam vurgu
 * halkasıyla (spotlight) öne çıkar, geri kalan kâğıt kararır; açıklayıcı çağrı okları tablonun hücre
 * sınırları boyunca kenar boşluğuna, oradan açıklama listesine gider (yazının üstünden geçmez).
 */

export const DOCUMENT_COLORS = {
  bg: "#1a2130",
  paper: "#fffdf6",
  paperEdge: "#d9d2bf",
  ink: "#1f2937",
  inkMuted: "#6b7280",
  grid: "#cfc8b5",
  head: "#f1ebd9",
  spot: "#facc15",
  leader: "#facc15",
  text: "#f8fafc",
  muted: "#cbd5e1",
} as const;

export type SpotLayout = {
  n: number;
  ring: Rect;
  leader: { x: number; y: number }[];
  pin: { x: number; y: number };
  callout: { pinX: number; pinY: number; label: TextBox; note: TextBox };
};

export type DocumentLayout = SceneLayout & {
  paper: Rect;
  pageLabel: TextBox | null;
  caption: TextBox;
  table?: { x: number; y: number; colW: number[]; rowH: number[]; cells: TextBox[] };
  image?: Rect;
  spots: SpotLayout[];
};

const PIN_R = 9;
const SPOT_PIN_R = 7;

type DocumentPass = { offset: number; listTop?: number; areaH?: number };

/**
 * Dikeyde iki geçiş: önce kâğıt en geniş alanla ölçülür; sonra açıklama listesi kâğıdın hemen altına
 * alınır ve kâğıt + liste bloğu boş alanın ortasına kaydırılır (uzun lider çizgisi ve boş orta kalmaz).
 */
export function layoutDocumentSpotlight(data: DocumentSpotlightData, frame: SceneFrame): DocumentLayout {
  const first = documentPass(data, frame, { offset: 0 });
  if (!frame.portrait) {
    const bottom = frame.content.y + frame.content.h;
    const free = bottom - (first.paper.y + first.paper.h);
    if (free <= 8) return first;
    const offset = Math.round(free * 0.4);
    const callouts = first.spots.map((spot) => spot.callout);
    const listTop0 = callouts.length ? Math.min(...callouts.map((c) => c.pinY - PIN_R)) : 0;
    const listBottom = callouts.length ? Math.max(...callouts.map((c) => Math.max(c.note.rect.y + c.note.rect.h, c.pinY + PIN_R))) : 0;
    const listH = listBottom - listTop0;
    const paperMid = first.paper.y + offset + first.paper.h / 2;
    const listTop = Math.max(first.paper.y, Math.min(bottom - listH, Math.round(paperMid - listH / 2)));
    return documentPass(data, frame, { offset, listTop, areaH: bottom - first.paper.y });
  }
  const callouts = first.spots.map((spot) => spot.callout);
  if (!callouts.length) return first;
  const listTop0 = Math.min(...callouts.map((c) => c.pinY - PIN_R));
  const top = first.paper.y;
  const paperBottom = first.paper.y + first.paper.h;
  const free = listTop0 - 16 - paperBottom;
  if (free <= 8) return first;
  const offset = Math.round(free * 0.4);
  const areaH = listTop0 - 16 - top;
  return documentPass(data, frame, { offset, listTop: paperBottom + offset + 18, areaH });
}

function documentPass(data: DocumentSpotlightData, frame: SceneFrame, pass: DocumentPass): DocumentLayout {
  const { content } = frame;
  const header = layoutHeader(frame, data.title, `${ARCHETYPE_LABEL.DOCUMENT_FIGURE_SPOTLIGHT}${data.page ? ` · s. ${data.page}` : ""}`);
  const texts: TextBox[] = [...header.texts];
  const segments: Segment[] = [];
  const markers: SceneLayout["markers"] = [];
  const top = header.bottom + 12 + pass.offset;
  const bottom = content.y + content.h;
  const n = data.spots.length;

  // Açıklama listesi: dikeyde altta, yatayda sağda.
  const listW = frame.portrait ? content.w : Math.round(content.w * 0.36);
  const listX = frame.portrait ? content.x : content.x + content.w - listW;
  const measure = (noteLines: number, baseY: number) => {
    let y = baseY;
    return data.spots.map((spot, index) => {
      const label = placeText(`callout${index}-label`, spot.label, listX + PIN_R * 2 + 8, y, { maxWidth: listW - PIN_R * 2 - 8, maxLines: 1, fontSize: 12, minFontSize: 9.5, weight: 800, single: true });
      const note = placeText(`callout${index}-note`, spot.note, listX + PIN_R * 2 + 8, y + label.rect.h + 1, { maxWidth: listW - PIN_R * 2 - 8, maxLines: noteLines, fontSize: 10.5, minFontSize: 9 });
      const h = Math.max(PIN_R * 2, label.rect.h + note.rect.h + 1);
      const out = { label, note, y, h };
      y += h + 10;
      return out;
    });
  };
  let noteLines = frame.portrait ? 2 : 3;
  let probe = measure(noteLines, 0);
  const probeHeight = () => (probe.length ? probe[probe.length - 1]!.y + probe[probe.length - 1]!.h : 0);
  while (frame.portrait && probeHeight() > (bottom - top + pass.offset) * 0.36 && noteLines > 1) {
    noteLines -= 1;
    probe = measure(noteLines, 0);
  }
  const listTop = pass.listTop ?? (frame.portrait ? bottom - probeHeight() : top + Math.max(0, (bottom - top - probeHeight()) / 2));
  const callouts = measure(noteLines, listTop);
  callouts.forEach((c, index) => {
    texts.push(c.label, c.note);
    markers.push({ id: `callout-pin${index}`, rect: { x: listX, y: c.y, w: PIN_R * 2, h: PIN_R * 2 } });
  });

  // Kâğıt: lider çizgileri için bir yanda kenar boşluğu bırakılır.
  const leaderGap = 12 + n * 6;
  const area: Rect = frame.portrait
    ? { x: content.x + leaderGap, y: top, w: content.w - leaderGap, h: pass.areaH ?? listTop - 16 - top }
    : { x: content.x, y: top, w: listX - content.x - leaderGap, h: pass.areaH ?? bottom - top };
  const pagePad = 12;
  const pageLabel = data.page
    ? placeText("page-label", `s. ${data.page}`, area.x + area.w - pagePad - 10, area.y + 6, { maxWidth: 60, maxLines: 1, fontSize: 9.5, weight: 700, anchor: "end", single: true })
    : null;
  if (pageLabel) texts.push(pageLabel);
  const captionProbe = placeText("caption", data.figure.caption, area.x + pagePad, 0, { maxWidth: area.w - pagePad * 2, maxLines: 2, fontSize: 10.5, minFontSize: 9 });
  const figTop = area.y + pagePad + (pageLabel ? pageLabel.rect.h + 4 : 0);
  const figMaxH = area.h - pagePad * 2 - captionProbe.rect.h - 8 - (pageLabel ? pageLabel.rect.h + 4 : 0);

  let table: DocumentLayout["table"];
  let image: Rect | undefined;
  let figBottom = figTop;
  const spots: SpotLayout[] = [];

  if (data.figure.kind === "table") {
    const cols = data.figure.columns.length;
    const tableW = area.w - pagePad * 2;
    const colW = Array.from({ length: cols }, () => tableW / cols);
    const rowsData = [data.figure.columns, ...data.figure.rows.map((row) => Array.from({ length: cols }, (_, c) => row[c] ?? ""))];
    const rowLines = (figMaxH / rowsData.length) > 30 ? 2 : 1;
    const cells: TextBox[] = [];
    const rowH: number[] = [];
    let y = figTop;
    rowsData.forEach((row, r) => {
      const boxes = row.map((cell, c) =>
        cell
          ? placeText(`cell-${r}-${c}`, cell, area.x + pagePad + colW.slice(0, c).reduce((a, b) => a + b, 0) + 6, y + 5, {
              maxWidth: colW[c]! - 12,
              maxLines: rowLines,
              fontSize: r === 0 ? 10.5 : 10.5,
              minFontSize: 8.5,
              weight: r === 0 ? 800 : 500,
            })
          : null,
      );
      const h = Math.max(18, ...boxes.map((box) => (box ? box.rect.h : 0))) + 10;
      rowH.push(h);
      boxes.forEach((box) => box && cells.push(box));
      y += h;
    });
    figBottom = y;
    texts.push(...cells);
    const x0 = area.x + pagePad;
    // Izgara çizgileri (yazı engeli)
    let gy = figTop;
    for (let r = 0; r <= rowsData.length; r += 1) {
      segments.push(segment(`row-line${r}`, x0, gy, x0 + tableW, gy));
      gy += rowH[r] ?? 0;
    }
    let gx = x0;
    for (let c = 0; c <= cols; c += 1) {
      segments.push(segment(`col-line${c}`, gx, figTop, gx, figBottom));
      gx += colW[c] ?? 0;
    }
    table = { x: x0, y: figTop, colW, rowH, cells };
    data.spots.forEach((spot, index) => {
      const r = Math.min(rowsData.length - 1, (spot.row ?? index) + 1);
      const c = Math.min(cols - 1, spot.col ?? 0);
      const cellX = x0 + colW.slice(0, c).reduce((a, b) => a + b, 0);
      const cellY = figTop + rowH.slice(0, r).reduce((a, b) => a + b, 0);
      const ring: Rect = { x: cellX + 2, y: cellY + 2, w: colW[c]! - 4, h: rowH[r]! - 4 };
      spots.push({ n: index + 1, ring, leader: [], pin: { x: 0, y: 0 }, callout: { pinX: listX + PIN_R, pinY: callouts[index]!.y + PIN_R, label: callouts[index]!.label, note: callouts[index]!.note } });
    });
  } else {
    const maxW = area.w - pagePad * 2;
    let w = maxW;
    let h = w / data.figure.aspect;
    if (h > figMaxH) {
      h = figMaxH;
      w = h * data.figure.aspect;
    }
    image = { x: area.x + pagePad + (maxW - w) / 2, y: figTop, w, h };
    figBottom = figTop + h;
    data.spots.forEach((spot, index) => {
      const cx = image!.x + (spot.x ?? 0.5) * image!.w;
      const cy = image!.y + (spot.y ?? 0.5) * image!.h;
      const r = Math.max(14, Math.min(image!.w, image!.h) * 0.12);
      spots.push({ n: index + 1, ring: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, leader: [], pin: { x: 0, y: 0 }, callout: { pinX: listX + PIN_R, pinY: callouts[index]!.y + PIN_R, label: callouts[index]!.label, note: callouts[index]!.note } });
    });
  }

  const caption = placeText("caption", data.figure.caption, area.x + pagePad, figBottom + 8, { maxWidth: area.w - pagePad * 2, maxLines: 2, fontSize: 10.5, minFontSize: 9 });
  texts.push(caption);
  const paper: Rect = { x: area.x, y: area.y, w: area.w, h: Math.min(area.h, caption.rect.y + caption.rect.h + pagePad - area.y) };

  // Çağrı okları: halkanın üst kenarından (hücre sınırı) kâğıdın kenarına, kenar boşluğundan açıklamaya.
  spots.forEach((spot, index) => {
    const laneOffset = 8 + index * 6;
    const startY = spot.ring.y - 2;
    if (frame.portrait) {
      const laneX = paper.x - laneOffset;
      const startX = spot.ring.x + 6;
      spot.leader = [
        { x: startX, y: startY },
        { x: laneX, y: startY },
        { x: laneX, y: spot.callout.pinY },
        { x: spot.callout.pinX - PIN_R - 3, y: spot.callout.pinY },
      ];
    } else {
      const laneX = paper.x + paper.w + laneOffset;
      const startX = spot.ring.x + spot.ring.w - 6;
      spot.leader = [
        { x: startX, y: startY },
        { x: laneX, y: startY },
        { x: laneX, y: spot.callout.pinY },
        { x: spot.callout.pinX - PIN_R - 3, y: spot.callout.pinY },
      ];
    }
    // Halka numarası kenar boşluğundaki dönüş noktasında: yazının üstüne binmez.
    spot.pin = spot.leader[1]!;
    for (let k = 1; k < spot.leader.length; k += 1) {
      const a = spot.leader[k - 1]!;
      const b = spot.leader[k]!;
      segments.push(segment(`leader${index}-${k}`, a.x, a.y, b.x, b.y));
    }
    markers.push({ id: `spot-pin${index}`, rect: { x: spot.pin.x - SPOT_PIN_R, y: spot.pin.y - SPOT_PIN_R, w: SPOT_PIN_R * 2, h: SPOT_PIN_R * 2 } });
  });

  return { frame, texts, segments, markers, paper, pageLabel, caption, ...(table ? { table } : {}), ...(image ? { image } : {}), spots };
}

export function DocumentSpotlightScene({ data, ...common }: SceneCommonProps & { data: DocumentSpotlightData }) {
  const layout = layoutDocumentSpotlight(data, common.frame);
  const id = useSceneIds("doc");
  const [badge, title] = layout.texts;
  const { paper } = layout;
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${data.spots.map((spot) => `${spot.label} — ${spot.note}`).join("; ")}`}
      archetype="DOCUMENT_FIGURE_SPOTLIGHT"
      background={DOCUMENT_COLORS.bg}
    >
      <ArrowDefs id={id} colors={{ leader: DOCUMENT_COLORS.leader }} />
      <defs>
        <mask id={id("dim")}>
          <rect x={paper.x} y={paper.y} width={paper.w} height={paper.h} fill="#fff" />
          {layout.spots.map((spot) =>
            data.figure.kind === "image" ? (
              <ellipse key={spot.n} cx={spot.ring.x + spot.ring.w / 2} cy={spot.ring.y + spot.ring.h / 2} rx={spot.ring.w / 2 + 4} ry={spot.ring.h / 2 + 4} fill="#000" />
            ) : (
              <rect key={spot.n} x={spot.ring.x - 3} y={spot.ring.y - 3} width={spot.ring.w + 6} height={spot.ring.h + 6} rx={8} fill="#000" />
            ),
          )}
        </mask>
      </defs>
      <SceneBadge box={badge!} color={DOCUMENT_COLORS.spot} textColor={DOCUMENT_COLORS.spot} />
      <SceneText box={title!} fill={DOCUMENT_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      {/* Kâğıt */}
      <g className="cp-vs-fade" style={delay(0.15)} data-figure={data.figure.kind}>
        <path
          d={`M${paper.x},${paper.y} H${paper.x + paper.w - 14} L${paper.x + paper.w},${paper.y + 14} V${paper.y + paper.h} H${paper.x} Z`}
          fill={DOCUMENT_COLORS.paper}
          stroke={DOCUMENT_COLORS.paperEdge}
          strokeWidth={1}
        />
        <path d={`M${paper.x + paper.w - 14},${paper.y} V${paper.y + 14} H${paper.x + paper.w}`} fill={DOCUMENT_COLORS.paperEdge} />
        {layout.pageLabel ? <SceneText box={layout.pageLabel} fill={DOCUMENT_COLORS.inkMuted} /> : null}
        {layout.table ? (
          <g data-table="source">
            <rect x={layout.table.x} y={layout.table.y} width={layout.table.colW.reduce((a, b) => a + b, 0)} height={layout.table.rowH[0]} fill={DOCUMENT_COLORS.head} />
            {layout.segments
              .filter((seg) => seg.id.startsWith("row-line") || seg.id.startsWith("col-line"))
              .map((seg) => (
                <line key={seg.id} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke={DOCUMENT_COLORS.grid} strokeWidth={1} />
              ))}
            {layout.table.cells.map((cell) => (
              <SceneText key={cell.id} box={cell} fill={DOCUMENT_COLORS.ink} />
            ))}
          </g>
        ) : null}
        {layout.image && data.figure.kind === "image" ? (
          <image href={data.figure.href} x={layout.image.x} y={layout.image.y} width={layout.image.w} height={layout.image.h} preserveAspectRatio="xMidYMid meet" />
        ) : null}
        <SceneText box={layout.caption} fill={DOCUMENT_COLORS.inkMuted} style={{ fontStyle: "italic" }} />
      </g>

      {/* Spotlight: kâğıt kararır, vurgulanan yer açık kalır */}
      <rect x={paper.x} y={paper.y} width={paper.w} height={paper.h} fill="#0b1020" fillOpacity={0.42} mask={`url(#${id("dim")})`} className="cp-vs-fade" style={delay(0.9)} />
      {layout.spots.map((spot, index) => {
        const at = 1.1 + index * 0.45;
        return (
          <g key={spot.n} data-spot={spot.n}>
            {data.figure.kind === "image" ? (
              <ellipse cx={spot.ring.x + spot.ring.w / 2} cy={spot.ring.y + spot.ring.h / 2} rx={spot.ring.w / 2 + 4} ry={spot.ring.h / 2 + 4} fill={DOCUMENT_COLORS.spot} fillOpacity={0.18} stroke={DOCUMENT_COLORS.spot} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(at, 0.6)} />
            ) : (
              <rect x={spot.ring.x - 3} y={spot.ring.y - 3} width={spot.ring.w + 6} height={spot.ring.h + 6} rx={8} fill={DOCUMENT_COLORS.spot} fillOpacity={0.16} stroke={DOCUMENT_COLORS.spot} strokeWidth={2.5} pathLength={1} className="cp-vs-draw" style={delay(at, 0.6)} />
            )}
            <polyline
              points={spot.leader.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none"
              stroke={DOCUMENT_COLORS.leader}
              strokeWidth={1.6}
              strokeLinejoin="round"
              markerEnd={`url(#${id("arrow-leader")})`}
              pathLength={1}
              className="cp-vs-draw"
              style={delay(at + 0.4, 0.7)}
            />
            <g className="cp-vs-fade" style={delay(at + 0.3)}>
              <circle cx={spot.pin.x} cy={spot.pin.y} r={SPOT_PIN_R} fill={DOCUMENT_COLORS.spot} stroke={DOCUMENT_COLORS.bg} strokeWidth={1.5} />
              <text x={spot.pin.x} y={spot.pin.y + 3} fontSize={8.5} fontWeight={800} textAnchor="middle" fill={DOCUMENT_COLORS.bg}>
                {spot.n}
              </text>
            </g>
            <g className="cp-vs-fade" style={delay(at + 0.8)}>
              <circle cx={spot.callout.pinX} cy={spot.callout.pinY} r={PIN_R} fill={DOCUMENT_COLORS.spot} />
              <text x={spot.callout.pinX} y={spot.callout.pinY + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill={DOCUMENT_COLORS.bg}>
                {spot.n}
              </text>
              <SceneText box={spot.callout.label} fill={DOCUMENT_COLORS.text} />
              <SceneText box={spot.callout.note} fill={DOCUMENT_COLORS.muted} />
            </g>
          </g>
        );
      })}
    </SceneSvg>
  );
}
