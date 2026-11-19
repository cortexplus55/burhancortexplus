"use client";

import { layoutHeader, placeText, segment, type Rect, type SceneFrame, type SceneLayout, type TextBox } from "@/lib/learning/visual-scenes/layout";
import type { ReelComparison } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, type SceneCommonProps } from "./scene-kit";

/**
 * Sahne 3 — Karşılaştırma Tablosu / Formül Mantığı: iki kavramı ya da değişken etkisini renk kodlu
 * görsel matrisle kıyaslar. Sol sütun mavi, sağ sütun kehribar; satırda öne çıkan taraf onay rozeti alır.
 */

export const COMPARE_COLORS = { bg: "#0b1324", panel: "#121c33", stroke: "#26365a", text: "#f1f5f9", muted: "#a7b4cc", left: "#38bdf8", right: "#f59e0b", vs: "#e879f9", win: "#22c55e" } as const;

export type ComparisonLayout = SceneLayout & {
  heads: { left: TextBox; right: TextBox; leftRect: Rect; rightRect: Rect; vs: { cx: number; cy: number } };
  rows: { y: number; h: number; label: TextBox; left: TextBox; right: TextBox; leftRect: Rect; rightRect: Rect; winner: "left" | "right" | "none" }[];
  table: Rect;
};

export function layoutComparison(data: ReelComparison, frame: SceneFrame): ComparisonLayout {
  const { content } = frame;
  const header = layoutHeader(frame, data.title, data.mode === "variable" ? "Formül mantığı" : "Karşılaştırma tablosu");
  const texts: TextBox[] = [...header.texts];
  const segments: SceneLayout["segments"] = [];
  const top = header.bottom + 14;
  const bottom = content.y + content.h;
  const labelW = Math.round(content.w * (frame.portrait ? 0.27 : 0.24));
  const gap = 8;
  const cellW = (content.w - labelW - gap * 2) / 2;
  const leftX = content.x + labelW + gap;
  const rightX = leftX + cellW + gap;
  const room = bottom - top;
  // Ölçek arama: dikey 9:16'da yazı büyür (k ≤ 1.5); sığan en büyük ölçek ve satır sayısı seçilir,
  // kalan boşluk tablonun üstüne/altına paylaştırılır (yarısı boş ekran kalmaz).
  const build = (k: number, lines: number, offset: number) => {
    const y0 = top + offset;
    const headOpts = { maxWidth: cellW - 30, maxLines: 2, fontSize: 13 * Math.min(k, 1.3), minFontSize: 9.5, weight: 800 as const, anchor: "middle" as const };
    const probeL = placeText("head-left", data.left, 0, 0, headOpts);
    const probeR = placeText("head-right", data.right, 0, 0, headOpts);
    const headH = Math.max(34, Math.max(probeL.rect.h, probeR.rect.h) + 14);
    const left = placeText("head-left", data.left, leftX + cellW / 2, y0 + (headH - probeL.rect.h) / 2, headOpts);
    const right = placeText("head-right", data.right, rightX + cellW / 2, y0 + (headH - probeR.rect.h) / 2, headOpts);
    const pad = Math.round(8 * k);
    let y = y0 + headH + 10;
    const rows = data.rows.map((row, index) => {
      const labelBox = placeText(`row${index}-label`, row.label, content.x + 4, y + pad, { maxWidth: labelW - 8, maxLines: lines, fontSize: 11.5 * k, minFontSize: 9, weight: 800 });
      const leftBox = placeText(`row${index}-left`, row.left, leftX + 8, y + pad, { maxWidth: cellW - 30, maxLines: lines, fontSize: 11.5 * k, minFontSize: 9 });
      const rightBox = placeText(`row${index}-right`, row.right, rightX + 8, y + pad, { maxWidth: cellW - 30, maxLines: lines, fontSize: 11.5 * k, minFontSize: 9 });
      const h = Math.max(labelBox.rect.h, leftBox.rect.h, rightBox.rect.h) + pad * 2;
      const out = { y, h, label: labelBox, left: leftBox, right: rightBox, leftRect: { x: leftX, y, w: cellW, h }, rightRect: { x: rightX, y, w: cellW, h }, winner: row.winner };
      y += h + 6;
      return out;
    });
    const height = headH + 10 + rows.reduce((sum, row) => sum + row.h + 6, -6);
    return { headH, left, right, rows, height, y0 };
  };
  const scales = frame.portrait ? [1.5, 1.4, 1.3, 1.2, 1.1, 1] : [1.15, 1.1, 1.05, 1];
  let pick = { k: 1, lines: 1 };
  search: for (const k of scales) {
    for (const lines of [3, 2, 1]) {
      if (build(k, lines, 0).height <= room) {
        pick = { k, lines };
        break search;
      }
    }
  }
  const probe = build(pick.k, pick.lines, 0);
  const offset = Math.max(0, Math.round((room - probe.height) * 0.4));
  const { headH, left, right, rows, y0 } = build(pick.k, pick.lines, offset);
  texts.push(left, right);
  const leftRect: Rect = { x: leftX, y: y0, w: cellW, h: headH };
  const rightRect: Rect = { ...leftRect, x: rightX };
  const height = () => rows.reduce((sum, row) => sum + row.h + 6, -6);
  rows.forEach((row, index) => {
    texts.push(row.label, row.left, row.right);
    if (index > 0) segments.push(segment(`row-line${index}`, content.x, row.y - 3, content.x + content.w, row.y - 3));
  });
  const markers: SceneLayout["markers"] = rows.flatMap((row, index) => {
    if (row.winner === "none") return [];
    const rect = row.winner === "left" ? row.leftRect : row.rightRect;
    return [{ id: `win${index}`, rect: { x: rect.x + rect.w - 21, y: rect.y + 5, w: 16, h: 16 } }];
  });
  return {
    frame,
    texts,
    segments,
    markers,
    heads: { left, right, leftRect, rightRect, vs: { cx: leftX + cellW + gap / 2, cy: leftRect.y + headH / 2 } },
    rows,
    table: { x: content.x, y: leftRect.y, w: content.w, h: height() + headH + 10 },
  };
}

function Check({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill={color} />
      <path d={`M${x - 3.6},${y} l2.6,2.8 l4.6,-5.2`} stroke="#04120a" strokeWidth={2} fill="none" strokeLinecap="round" />
    </g>
  );
}

export function ComparisonMatrixScene({ data, ...common }: SceneCommonProps & { data: ReelComparison }) {
  const layout = layoutComparison(data, common.frame);
  const [badge, title] = layout.texts;
  const { heads } = layout;
  return (
    <SceneSvg {...common} label={`${data.title}: ${data.left} ve ${data.right}`} archetype="REEL_COMPARISON" background={COMPARE_COLORS.bg}>
      <SceneBadge box={badge!} color={COMPARE_COLORS.vs} textColor={COMPARE_COLORS.vs} />
      <SceneText box={title!} fill={COMPARE_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />
      <g className="cp-vs-fade" style={delay(0.25)}>
        <rect x={heads.leftRect.x} y={heads.leftRect.y} width={heads.leftRect.w} height={heads.leftRect.h} rx={Math.min(17, heads.leftRect.h / 2)} fill={COMPARE_COLORS.left} fillOpacity={0.2} stroke={COMPARE_COLORS.left} strokeWidth={1.5} />
        <rect x={heads.rightRect.x} y={heads.rightRect.y} width={heads.rightRect.w} height={heads.rightRect.h} rx={Math.min(17, heads.rightRect.h / 2)} fill={COMPARE_COLORS.right} fillOpacity={0.2} stroke={COMPARE_COLORS.right} strokeWidth={1.5} />
        <SceneText box={heads.left} fill={COMPARE_COLORS.left} />
        <SceneText box={heads.right} fill={COMPARE_COLORS.right} />
      </g>
      <g className="cp-vs-fade" style={delay(0.4)}>
        <circle cx={heads.vs.cx} cy={heads.vs.cy} r={13} fill={COMPARE_COLORS.bg} stroke={COMPARE_COLORS.vs} strokeWidth={2} />
        <text x={heads.vs.cx} y={heads.vs.cy + 3.8} fontSize={10} fontWeight={800} textAnchor="middle" fill={COMPARE_COLORS.vs}>
          VS
        </text>
      </g>
      {layout.rows.map((row, index) => {
        const at = 0.6 + index * 0.45;
        return (
          <g key={index} data-winner={row.winner}>
            {index > 0 ? (
              <line x1={layout.table.x} y1={row.y - 3} x2={layout.table.x + layout.table.w} y2={row.y - 3} stroke={COMPARE_COLORS.stroke} strokeWidth={1} pathLength={1} className="cp-vs-draw" style={delay(at - 0.1, 0.4)} />
            ) : null}
            <g className="cp-vs-fade" style={delay(at)}>
              <SceneText box={row.label} fill={COMPARE_COLORS.muted} />
              {(["left", "right"] as const).map((side) => {
                const rect = side === "left" ? row.leftRect : row.rightRect;
                const color = side === "left" ? COMPARE_COLORS.left : COMPARE_COLORS.right;
                const win = row.winner === side;
                return (
                  <g key={side}>
                    <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10} fill={color} fillOpacity={win ? 0.28 : 0.1} stroke={color} strokeOpacity={win ? 1 : 0.4} strokeWidth={win ? 2 : 1} />
                    {win ? <Check x={rect.x + rect.w - 13} y={rect.y + 13} color={COMPARE_COLORS.win} /> : null}
                  </g>
                );
              })}
              <SceneText box={row.left} fill={COMPARE_COLORS.text} rich />
              <SceneText box={row.right} fill={COMPARE_COLORS.text} rich />
            </g>
          </g>
        );
      })}
    </SceneSvg>
  );
}
