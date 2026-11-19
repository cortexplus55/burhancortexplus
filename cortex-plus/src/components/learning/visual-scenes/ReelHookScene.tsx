"use client";

import { DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import { placeBadge, placeText, type Rect, type SceneFrame, type SceneLayout, type TextBox } from "@/lib/learning/visual-scenes/layout";
import type { ReelHook } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * Sahne 1 — Çarpıcı Kanca: konunun sınavda en çok çıkan kilit sorusu bir konuşma balonunda, üstte
 * çizilerek gelen parlayan soru işareti ve merak uyandıran görsel başlık.
 */

export const HOOK_COLORS = { bg: "#120f2a", glow: "#f472b6", accent: "#fbbf24", text: "#fdf4ff", muted: "#d8b4fe", bubble: "#1e1a44", stroke: "#7c3aed" } as const;

export type HookLayout = SceneLayout & { badge: TextBox; glyph: { cx: number; cy: number; size: number }; title: TextBox; bubble: Rect; question: TextBox; domain: TextBox | null };

export function layoutReelHook(data: ReelHook, frame: SceneFrame, domain?: AcademicDomain): HookLayout {
  const { content } = frame;
  const badge = placeBadge("badge", data.badge ?? "Sınavda en çok çıkan", content.x + content.w, content.y, content.w * 0.7, 10.5);
  const domainBox = domain ? placeText("domain", DOMAIN_LABEL[domain].toLocaleUpperCase("tr"), content.x, content.y + 4, { maxWidth: content.w - badge.rect.w - 12, maxLines: 1, fontSize: 10, weight: 800, single: true }) : null;
  const top = badge.rect.y + badge.rect.h + 10;
  const bottom = content.y + content.h;
  if (frame.portrait) {
    const glyphSize = Math.min(110, (bottom - top) * 0.26);
    const glyph = { cx: content.x + content.w / 2, cy: top + glyphSize / 2 + 4, size: glyphSize };
    const title = placeText("visual-title", data.visualTitle, content.x + content.w / 2, glyph.cy + glyphSize / 2 + 14, { maxWidth: content.w, maxLines: 2, fontSize: 26, minFontSize: 18, weight: 800, anchor: "middle" });
    const qTop = title.rect.y + title.rect.h + 22;
    const question = placeText("question", data.question, content.x + 16, qTop + 14, { maxWidth: content.w - 32, maxLines: Math.max(2, Math.floor((bottom - qTop - 28) / 20)), fontSize: 16, minFontSize: 12, weight: 700 });
    const bubble: Rect = { x: content.x, y: qTop, w: content.w, h: question.rect.h + 28 };
    return { frame, texts: [badge, ...(domainBox ? [domainBox] : []), title, question], segments: [], markers: [], badge, glyph, title, bubble, question, domain: domainBox };
  }
  const glyphSize = Math.min(140, (bottom - top) * 0.8);
  const glyph = { cx: content.x + glyphSize / 2 + 10, cy: top + (bottom - top) / 2, size: glyphSize };
  const textX = content.x + glyphSize + 36;
  const textW = content.x + content.w - textX;
  const title = placeText("visual-title", data.visualTitle, textX, top + 4, { maxWidth: textW, maxLines: 2, fontSize: 24, minFontSize: 16, weight: 800 });
  const qTop = title.rect.y + title.rect.h + 16;
  const question = placeText("question", data.question, textX + 14, qTop + 12, { maxWidth: textW - 28, maxLines: Math.max(2, Math.floor((bottom - qTop - 24) / 19)), fontSize: 15, minFontSize: 11.5, weight: 700 });
  const bubble: Rect = { x: textX, y: qTop, w: textW, h: question.rect.h + 24 };
  return { frame, texts: [badge, ...(domainBox ? [domainBox] : []), title, question], segments: [], markers: [], badge, glyph, title, bubble, question, domain: domainBox };
}

export function ReelHookScene({ data, domain, ...common }: SceneCommonProps & { data: ReelHook; domain?: AcademicDomain }) {
  const layout = layoutReelHook(data, common.frame, domain);
  const id = useSceneIds("hook");
  const { cx, cy, size } = layout.glyph;
  const s = size / 100;
  const rays = Array.from({ length: 12 }, (_, i) => (Math.PI * 2 * i) / 12);
  const tailX = common.frame.portrait ? layout.bubble.x + layout.bubble.w / 2 : layout.bubble.x;
  return (
    <SceneSvg {...common} label={`${data.visualTitle}: ${data.question}`} archetype="REEL_HOOK" background={HOOK_COLORS.bg}>
      <defs>
        <radialGradient id={id("halo")}>
          <stop offset="0%" stopColor={HOOK_COLORS.glow} stopOpacity={0.45} />
          <stop offset="100%" stopColor={HOOK_COLORS.glow} stopOpacity={0} />
        </radialGradient>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <SceneBadge box={layout.badge} color={HOOK_COLORS.accent} textColor={HOOK_COLORS.accent} />
      {layout.domain ? <SceneText box={layout.domain} fill={HOOK_COLORS.muted} className="cp-vs-fade" style={delay(0.05)} letterSpacing={0.8} /> : null}
      <circle cx={cx} cy={cy} r={size * 0.75} fill={`url(#${id("halo")})`} className="cp-vs-fade" style={delay(0.1)} />
      {rays.map((a, i) => (
        <line
          key={i}
          x1={cx + Math.cos(a) * size * 0.55}
          y1={cy + Math.sin(a) * size * 0.55}
          x2={cx + Math.cos(a) * size * (i % 2 ? 0.66 : 0.72)}
          y2={cy + Math.sin(a) * size * (i % 2 ? 0.66 : 0.72)}
          stroke={i % 3 ? HOOK_COLORS.muted : HOOK_COLORS.accent}
          strokeWidth={2}
          strokeLinecap="round"
          pathLength={1}
          className="cp-vs-draw"
          style={delay(0.6 + i * 0.03, 0.3)}
        />
      ))}
      {/* Çizilerek gelen soru işareti */}
      <path
        d={`M${cx - 18 * s},${cy - 18 * s} C${cx - 18 * s},${cy - 42 * s} ${cx + 22 * s},${cy - 44 * s} ${cx + 22 * s},${cy - 18 * s} C${cx + 22 * s},${cy - 2 * s} ${cx},${cy} ${cx},${cy + 14 * s}`}
        fill="none"
        stroke={HOOK_COLORS.glow}
        strokeWidth={9 * s}
        strokeLinecap="round"
        filter={`url(#${id("glow")})`}
        pathLength={1}
        className="cp-vs-draw"
        style={delay(0.2, 0.8)}
      />
      <circle cx={cx} cy={cy + 32 * s} r={6 * s} fill={HOOK_COLORS.glow} className="cp-vs-fade" style={delay(0.95)} />
      <SceneText box={layout.title} fill={HOOK_COLORS.text} className="cp-vs-fade" style={delay(0.9)} />
      <g className="cp-vs-fade" style={delay(1.2)}>
        <rect x={layout.bubble.x} y={layout.bubble.y} width={layout.bubble.w} height={layout.bubble.h} rx={16} fill={HOOK_COLORS.bubble} stroke={HOOK_COLORS.stroke} strokeWidth={1.5} />
        <path
          d={
            common.frame.portrait
              ? `M${tailX - 10},${layout.bubble.y + 0.5} L${tailX},${layout.bubble.y - 10} L${tailX + 10},${layout.bubble.y + 0.5} Z`
              : `M${tailX + 0.5},${layout.bubble.y + 14} L${tailX - 10},${layout.bubble.y + 22} L${tailX + 0.5},${layout.bubble.y + 30} Z`
          }
          fill={HOOK_COLORS.bubble}
          stroke={HOOK_COLORS.stroke}
          strokeWidth={1.5}
        />
        <SceneText box={layout.question} fill={HOOK_COLORS.text} rich />
      </g>
    </SceneSvg>
  );
}
