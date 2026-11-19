"use client";

import { placeBadge, placeText, shiftBox, type Rect, type SceneFrame, type SceneLayout, type TextBox } from "@/lib/learning/visual-scenes/layout";
import type { ReelTrap } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, type SceneCommonProps } from "./scene-kit";

/**
 * Sahne 4 — "Sakın Buna Düşme!" Sınav Tuzağı: öğrencilerin en sık yaptığı hata kırmızı çarpıyla (✗),
 * doğrusu zümrüt yeşili onayla (✓) yan yana (dikeyde alt alta); altta ayırt ettiren ipucu şeridi.
 */

export const TRAP_COLORS = { bg: "#1a0b10", wrong: "#ef4444", right: "#10b981", text: "#fff5f5", muted: "#fecdd3", tell: "#fbbf24", panelWrong: "#2a0e14", panelRight: "#06231a" } as const;

export type TrapPanel = { rect: Rect; kicker: TextBox; body: TextBox; icon: { cx: number; cy: number; r: number } };
export type TrapLayout = SceneLayout & { warning: TextBox; title: TextBox; wrong: TrapPanel; right: TrapPanel; tell: { rect: Rect; kicker: TextBox; text: TextBox } | null };

function panel(id: "wrong" | "right", text: string, rect: Rect, portrait: boolean): TrapPanel {
  const iconR = portrait ? 22 : 20;
  const textX = rect.x + 14 + iconR * 2 + 12;
  const maxWidth = rect.x + rect.w - 12 - textX;
  const kicker0 = placeText(`${id}-kicker`, id === "wrong" ? "SIK YAPILAN HATA" : "DOĞRUSU", textX, rect.y + 14, { maxWidth, maxLines: 1, fontSize: portrait ? 11.5 : 10.5, weight: 800, single: true });
  const bodyTop = kicker0.rect.y + kicker0.rect.h + 4;
  const lineH = portrait ? 23 : 18;
  const body0 = placeText(`${id}-body`, text, textX, bodyTop, {
    maxWidth,
    maxLines: Math.max(2, Math.floor((rect.y + rect.h - 12 - bodyTop) / lineH)),
    fontSize: portrait ? 18 : 14.5,
    minFontSize: 10.5,
    weight: 700,
  });
  // İçerik panelin dikey ortasına alınır (boş panel kalmasın).
  const blockH = body0.rect.y + body0.rect.h - kicker0.rect.y;
  const shift = Math.max(0, Math.round((rect.h - 28 - Math.max(blockH, iconR * 2)) / 2));
  const kicker = shiftBox(kicker0, 0, shift);
  const body = shiftBox(body0, 0, shift);
  const icon = { cx: rect.x + 14 + iconR, cy: rect.y + 14 + shift + Math.max(iconR, Math.min(blockH / 2, iconR * 1.4)), r: iconR };
  return { rect, kicker, body, icon };
}

export function layoutExamTrap(data: ReelTrap, frame: SceneFrame): TrapLayout {
  const { content } = frame;
  const warning = placeBadge("warning", "Sakın buna düşme!", content.x + content.w, content.y, content.w * 0.7, 11);
  const title = placeText("title", data.title, content.x, warning.rect.y + warning.rect.h + 8, { maxWidth: content.w, maxLines: 2, fontSize: 19, minFontSize: 14, weight: 800 });
  const top = title.rect.y + title.rect.h + 12;
  const bottom = content.y + content.h;
  let tell: TrapLayout["tell"] = null;
  let tellH = 0;
  if (data.tell) {
    const kicker = placeText("tell-kicker", "AYIRT ETTİREN İPUCU", content.x + 34, 0, { maxWidth: content.w - 46, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
    const probe = placeText("tell-text", data.tell, content.x + 34, 0, { maxWidth: content.w - 46, maxLines: 2, fontSize: 11.5, minFontSize: 9.5, weight: 600 });
    tellH = kicker.rect.h + probe.rect.h + 18;
    const y = bottom - tellH;
    const k = placeText("tell-kicker", "AYIRT ETTİREN İPUCU", content.x + 34, y + 8, { maxWidth: content.w - 46, maxLines: 1, fontSize: 9.5, weight: 800, single: true });
    const t = placeText("tell-text", data.tell, content.x + 34, k.rect.y + k.rect.h + 2, { maxWidth: content.w - 46, maxLines: 2, fontSize: 11.5, minFontSize: 9.5, weight: 600 });
    tell = { rect: { x: content.x, y, w: content.w, h: tellH }, kicker: k, text: t };
  }
  const panelsBottom = bottom - (tell ? tellH + 12 : 0);
  let wrongRect: Rect;
  let rightRect: Rect;
  if (frame.portrait) {
    const h = (panelsBottom - top - 12) / 2;
    wrongRect = { x: content.x, y: top, w: content.w, h };
    rightRect = { x: content.x, y: top + h + 12, w: content.w, h };
  } else {
    const w = (content.w - 14) / 2;
    wrongRect = { x: content.x, y: top, w, h: panelsBottom - top };
    rightRect = { x: content.x + w + 14, y: top, w, h: panelsBottom - top };
  }
  const wrong = panel("wrong", data.wrong, wrongRect, frame.portrait);
  const right = panel("right", data.right, rightRect, frame.portrait);
  const markers = [wrong, right].map((p, i) => ({ id: `icon${i}`, rect: { x: p.icon.cx - p.icon.r, y: p.icon.cy - p.icon.r, w: p.icon.r * 2, h: p.icon.r * 2 } }));
  if (tell) markers.push({ id: "bulb", rect: { x: content.x + 8, y: tell.rect.y + 8, w: 18, h: 22 } });
  return {
    frame,
    texts: [warning, title, wrong.kicker, wrong.body, right.kicker, right.body, ...(tell ? [tell.kicker, tell.text] : [])],
    segments: [],
    markers,
    warning,
    title,
    wrong,
    right,
    tell,
  };
}

export function ExamTrapScene({ data, ...common }: SceneCommonProps & { data: ReelTrap }) {
  const layout = layoutExamTrap(data, common.frame);
  const { wrong, right, tell } = layout;
  return (
    <SceneSvg {...common} label={`Sınav tuzağı — ${data.title}. Yanlış: ${data.wrong}. Doğru: ${data.right}.`} archetype="REEL_EXAM_TRAP" background={TRAP_COLORS.bg}>
      <g className="cp-vs-fade" style={delay(0.05)}>
        <SceneBadge box={layout.warning} color={TRAP_COLORS.wrong} textColor="#fecaca" />
      </g>
      <SceneText box={layout.title} fill={TRAP_COLORS.text} className="cp-vs-fade" style={delay(0.15)} />
      {/* Yanlış: kırmızı çarpı */}
      <g data-panel="wrong">
        <rect x={wrong.rect.x} y={wrong.rect.y} width={wrong.rect.w} height={wrong.rect.h} rx={14} fill={TRAP_COLORS.panelWrong} stroke={TRAP_COLORS.wrong} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(0.3, 0.6)} />
        <circle cx={wrong.icon.cx} cy={wrong.icon.cy} r={wrong.icon.r} fill={TRAP_COLORS.wrong} className="cp-vs-fade" style={delay(0.5)} />
        <path
          d={`M${wrong.icon.cx - wrong.icon.r * 0.42},${wrong.icon.cy - wrong.icon.r * 0.42} L${wrong.icon.cx + wrong.icon.r * 0.42},${wrong.icon.cy + wrong.icon.r * 0.42} M${wrong.icon.cx + wrong.icon.r * 0.42},${wrong.icon.cy - wrong.icon.r * 0.42} L${wrong.icon.cx - wrong.icon.r * 0.42},${wrong.icon.cy + wrong.icon.r * 0.42}`}
          stroke="#fff"
          strokeWidth={4}
          strokeLinecap="round"
          pathLength={1}
          className="cp-vs-draw"
          style={delay(0.65, 0.4)}
        />
        <SceneText box={wrong.kicker} fill={TRAP_COLORS.wrong} className="cp-vs-fade" style={delay(0.6)} />
        <SceneText box={wrong.body} fill={TRAP_COLORS.muted} className="cp-vs-fade" style={delay(0.7)} rich />
      </g>
      {/* Doğru: zümrüt onay */}
      <g data-panel="right">
        <rect x={right.rect.x} y={right.rect.y} width={right.rect.w} height={right.rect.h} rx={14} fill={TRAP_COLORS.panelRight} stroke={TRAP_COLORS.right} strokeWidth={2} pathLength={1} className="cp-vs-draw" style={delay(1.1, 0.6)} />
        <circle cx={right.icon.cx} cy={right.icon.cy} r={right.icon.r} fill={TRAP_COLORS.right} className="cp-vs-fade" style={delay(1.3)} />
        <path
          d={`M${right.icon.cx - right.icon.r * 0.45},${right.icon.cy + right.icon.r * 0.02} L${right.icon.cx - right.icon.r * 0.1},${right.icon.cy + right.icon.r * 0.38} L${right.icon.cx + right.icon.r * 0.48},${right.icon.cy - right.icon.r * 0.36}`}
          stroke="#fff"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="cp-vs-draw"
          style={delay(1.45, 0.4)}
        />
        <SceneText box={right.kicker} fill={TRAP_COLORS.right} className="cp-vs-fade" style={delay(1.4)} />
        <SceneText box={right.body} fill={TRAP_COLORS.text} className="cp-vs-fade" style={delay(1.5)} rich />
      </g>
      {tell ? (
        <g className="cp-vs-fade" style={delay(2)} data-panel="tell">
          <rect x={tell.rect.x} y={tell.rect.y} width={tell.rect.w} height={tell.rect.h} rx={12} fill={TRAP_COLORS.tell} fillOpacity={0.12} stroke={TRAP_COLORS.tell} strokeWidth={1.2} />
          {/* Ampul */}
          <circle cx={tell.rect.x + 17} cy={tell.rect.y + 16} r={6.5} fill="none" stroke={TRAP_COLORS.tell} strokeWidth={2} />
          <path d={`M${tell.rect.x + 14},${tell.rect.y + 24} h6 M${tell.rect.x + 15},${tell.rect.y + 27} h4`} stroke={TRAP_COLORS.tell} strokeWidth={1.8} strokeLinecap="round" />
          <SceneText box={tell.kicker} fill={TRAP_COLORS.tell} />
          <SceneText box={tell.text} fill={TRAP_COLORS.text} rich />
        </g>
      ) : null}
    </SceneSvg>
  );
}
