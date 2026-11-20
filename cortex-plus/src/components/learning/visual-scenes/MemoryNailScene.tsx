"use client";

import { floorPlacer, placeBadge, type Rect, type SceneFrame, type SceneLayout, type TextBox } from "@/lib/learning/visual-scenes/layout";
import type { ReelMemory } from "@/lib/learning/visual-scenes/schema";
import { SceneBadge, SceneSvg, SceneText, delay, type SceneCommonProps } from "./scene-kit";

/**
 * Sahne 5 — Hafıza Çivisi / Sınav Sabahı Özeti: çakılan çivi ikonu, akılda kalıcı görsel kodlama
 * (renkli harf karoları + anlamları) ve tek cümlelik özet kartı.
 */

export const MEMORY_COLORS = { bg: "#071a1a", text: "#f0fdfa", muted: "#99d5cc", nail: "#5eead4", head: "#fbbf24", card: "#0d2a2a", stroke: "#14b8a6", tiles: ["#f472b6", "#60a5fa", "#fbbf24", "#34d399", "#c084fc"] } as const;

export type MemoryLayout = SceneLayout & {
  kicker: TextBox;
  nail: { x: number; y: number; size: number };
  mnemonic: TextBox;
  tiles: { rect: Rect; letter: TextBox; meaning: TextBox }[];
  summary: { rect: Rect; kicker: TextBox; text: TextBox };
};

export function layoutMemoryNail(data: ReelMemory, frame: SceneFrame): MemoryLayout {
  const { content } = frame;
  const place = floorPlacer(frame);
  const kicker = placeBadge("kicker", "Hafıza çivisi", content.x + content.w, content.y, content.w * 0.6, 10.5, 1, frame.text);
  const top = kicker.rect.y + kicker.rect.h + 10;
  const bottom = content.y + content.h;
  const leftW = frame.portrait ? content.w : content.w * 0.56;
  // k: dikey ekranda boş alan kalmasın diye ölçek; offset: içerik dikeyde ortalanır.
  const build = (k: number, offset: number) => {
    const y0 = top + offset;
    const nailSize = Math.round((frame.portrait ? 54 : 50) * k);
    const nail = { x: content.x, y: y0, size: nailSize };
    const mnemonic = place("mnemonic", data.mnemonic, content.x + nailSize + 12, y0 + 2 + Math.max(0, (nailSize - 30 * k) / 2), { maxWidth: leftW - nailSize - 12, maxLines: 2, fontSize: 24 * k, minFontSize: 16, weight: 800 });
    let y = Math.max(y0 + nailSize, mnemonic.rect.y + mnemonic.rect.h) + 16;
    const n = data.keys.length;
    const tiles: MemoryLayout["tiles"] = [];
    if (n) {
      const gap = 8;
      const tileW = Math.min(64 * k, (leftW - gap * (n - 1)) / n);
      const rowW = tileW * n + gap * (n - 1);
      const startX = content.x + (leftW - rowW) / 2;
      data.keys.forEach((key, index) => {
        const rect: Rect = { x: startX + index * (tileW + gap), y, w: tileW, h: tileW * 0.82 };
        const letterSize = Math.min(22 * k, rect.h * 0.55);
        const letter = place(`tile${index}-letter`, key.letter, rect.x + rect.w / 2, rect.y + rect.h / 2 - (letterSize * 1.22) / 2, { maxWidth: rect.w - 8, maxLines: 1, fontSize: letterSize, minFontSize: 12, weight: 800, anchor: "middle", single: true });
        const meaning = place(`tile${index}-meaning`, key.meaning, rect.x + rect.w / 2, rect.y + rect.h + 5, { maxWidth: tileW + gap - 2, maxLines: 3, fontSize: 9.5 * Math.min(k, 1.25), minFontSize: 8, anchor: "middle" });
        tiles.push({ rect, letter, meaning });
      });
      y = Math.max(...tiles.map((tile) => tile.meaning.rect.y + tile.meaning.rect.h)) + 18;
    }
    const summaryRect: Rect = frame.portrait
      ? { x: content.x, y, w: content.w, h: 0 }
      : { x: content.x + leftW + 18, y: y0, w: content.w - leftW - 18, h: 0 };
    const sKicker = place("summary-kicker", "SINAV SABAHI ÖZETİ", summaryRect.x + 14, summaryRect.y + 14, { maxWidth: summaryRect.w - 28, maxLines: 1, fontSize: 10 * Math.min(k, 1.2), weight: 800, single: true });
    const maxH = bottom - (sKicker.rect.y + sKicker.rect.h + 6) - 14;
    const fontSize = 16 * Math.min(k, 1.2);
    const sText = place("summary-text", data.summary, summaryRect.x + 14, sKicker.rect.y + sKicker.rect.h + 6, {
      maxWidth: summaryRect.w - 28,
      maxLines: Math.max(2, Math.floor(maxH / (fontSize * 1.3))),
      fontSize,
      minFontSize: 12,
      weight: 700,
    });
    summaryRect.h = sText.rect.y + sText.rect.h + 14 - summaryRect.y;
    const leftBottom = tiles.length ? Math.max(...tiles.map((tile) => tile.meaning.rect.y + tile.meaning.rect.h)) : y0 + nailSize;
    const contentBottom = frame.portrait ? summaryRect.y + summaryRect.h : Math.max(leftBottom, summaryRect.y + summaryRect.h);
    return { nail, mnemonic, tiles, summaryRect, sKicker, sText, height: contentBottom - y0 };
  };
  const room = bottom - top;
  const scales = frame.portrait ? [1.45, 1.35, 1.25, 1.15, 1.05, 1] : [1.1, 1.05, 1];
  let k = 1;
  for (const candidate of scales) {
    if (build(candidate, 0).height <= room) {
      k = candidate;
      break;
    }
  }
  const probe = build(k, 0);
  const offset = Math.max(0, Math.round((room - probe.height) * 0.42));
  const { nail, mnemonic, tiles, summaryRect, sKicker, sText } = build(k, offset);
  if (!frame.portrait) {
    // Yatayda özet kartı sol blokla aynı boyda (en az) olsun.
    const leftBottom = tiles.length ? Math.max(...tiles.map((tile) => tile.meaning.rect.y + tile.meaning.rect.h)) : nail.y + nail.size;
    summaryRect.h = Math.min(bottom - summaryRect.y, Math.max(summaryRect.h, leftBottom - summaryRect.y));
  }
  return {
    frame,
    texts: [kicker, mnemonic, ...tiles.flatMap((tile) => [tile.letter, tile.meaning]), sKicker, sText],
    segments: [],
    markers: [{ id: "nail", rect: { x: nail.x, y: nail.y, w: nail.size, h: nail.size } }],
    kicker,
    nail,
    mnemonic,
    tiles,
    summary: { rect: summaryRect, kicker: sKicker, text: sText },
  };
}

export function MemoryNailScene({ data, ...common }: SceneCommonProps & { data: ReelMemory }) {
  const layout = layoutMemoryNail(data, common.frame);
  const { nail } = layout;
  const s = nail.size / 54;
  return (
    <SceneSvg {...common} label={`Hafıza çivisi: ${data.mnemonic}. ${data.summary}`} archetype="REEL_MEMORY_NAIL" background={MEMORY_COLORS.bg}>
      <SceneBadge box={layout.kicker} color={MEMORY_COLORS.nail} textColor={MEMORY_COLORS.nail} />
      {/* Çivi ve çekiç darbesi */}
      <g transform={`translate(${nail.x} ${nail.y}) scale(${s})`}>
        <rect x={14} y={6} width={26} height={7} rx={2} fill={MEMORY_COLORS.head} className="cp-vs-fade" style={delay(0.15)} />
        <path d="M27,13 L27,44 L24,50 L30,50 L27,44" fill="none" stroke={MEMORY_COLORS.nail} strokeWidth={4} strokeLinejoin="round" pathLength={1} className="cp-vs-draw" style={delay(0.2, 0.5)} />
        <path d="M6,2 l6,6 M48,2 l-6,6 M2,16 h7 M45,16 h7" stroke={MEMORY_COLORS.head} strokeWidth={2.2} strokeLinecap="round" pathLength={1} className="cp-vs-draw" style={delay(0.5, 0.3)} />
        <line x1={8} y1={52} x2={46} y2={52} stroke={MEMORY_COLORS.muted} strokeWidth={2} strokeLinecap="round" className="cp-vs-fade" style={delay(0.3)} />
      </g>
      <SceneText box={layout.mnemonic} fill={MEMORY_COLORS.head} className="cp-vs-fade" style={delay(0.35)} />
      {layout.tiles.map((tile, index) => {
        const color = MEMORY_COLORS.tiles[index % MEMORY_COLORS.tiles.length]!;
        return (
          <g key={index} className="cp-vs-fade" style={delay(0.7 + index * 0.22)}>
            <rect x={tile.rect.x} y={tile.rect.y} width={tile.rect.w} height={tile.rect.h} rx={10} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />
            <SceneText box={tile.letter} fill={color} />
            <SceneText box={tile.meaning} fill={MEMORY_COLORS.muted} />
          </g>
        );
      })}
      <g className="cp-vs-fade" style={delay(0.9 + layout.tiles.length * 0.22)} data-panel="summary">
        <rect x={layout.summary.rect.x} y={layout.summary.rect.y} width={layout.summary.rect.w} height={layout.summary.rect.h} rx={14} fill={MEMORY_COLORS.card} stroke={MEMORY_COLORS.stroke} strokeWidth={1.5} />
        <rect x={layout.summary.rect.x} y={layout.summary.rect.y + 12} width={4} height={layout.summary.rect.h - 24} rx={2} fill={MEMORY_COLORS.head} />
        <SceneText box={layout.summary.kicker} fill={MEMORY_COLORS.nail} />
        <SceneText box={layout.summary.text} fill={MEMORY_COLORS.text} rich />
      </g>
    </SceneSvg>
  );
}
