"use client";

import { ARCHETYPE_LABEL, DOMAIN_LABEL, type AcademicDomain } from "@/lib/learning/visual-scenes/archetype";
import {
  inflate,
  layoutHeader,
  placeText,
  segment,
  type Rect,
  type SceneFrame,
  type SceneLayout,
  type TextBox,
} from "@/lib/learning/visual-scenes/layout";
import { PATHWAY_ROLE_LABEL, type MedicalPathwayData } from "@/lib/learning/visual-scenes/schema";
import { ArrowDefs, SceneBadge, SceneSvg, SceneText, delay, useSceneIds, type SceneCommonProps } from "./scene-kit";

/**
 * MEDICAL_BIOLOGY_PATHWAY (TUS, Tıp, Diş, Eczacılık, Biyoloji): hücre / doku / organ katman zemini üstünde
 * renk kodlu mekanizma zinciri (Tetikleyici → Reseptör → İkincil Haberci → Enzim/Hedef → Klinik Bulgu).
 * Aktivasyon oku zümrüt yeşili ve parlar; inhibisyon / blokaj noktasında kırmızı [X] bariyer ikonu;
 * köşede "TUS / Klinik Spotu" rozeti.
 */

export const MEDICAL_COLORS = {
  bg: "#071c26",
  layer: "#0f3a4a",
  membrane: "#1f6f86",
  activate: "#10b981",
  inhibit: "#ef4444",
  spot: "#fbbf24",
  text: "#ecfeff",
  muted: "#99c6d1",
  role: {
    trigger: "#f472b6",
    receptor: "#60a5fa",
    messenger: "#a78bfa",
    target: "#34d399",
    finding: "#fbbf24",
  },
} as const;

const NODE_R = 15;

export type MedicalStepLayout = {
  cx: number;
  cy: number;
  role: TextBox;
  label: TextBox;
  detail: TextBox | null;
};

export type MedicalPathwayLayout = SceneLayout & {
  steps: MedicalStepLayout[];
  arrows: { x1: number; y1: number; x2: number; y2: number; effect: "activate" | "inhibit"; mid: { x: number; y: number } }[];
  spot: { rect: Rect; kicker: TextBox; text: TextBox };
  chainArea: Rect;
};

function stepTexts(
  index: number,
  step: MedicalPathwayData["steps"][number],
  x: number,
  y: number,
  maxWidth: number,
  anchor: "start" | "middle",
  budget: number,
  portrait: boolean,
): { role: TextBox; label: TextBox; detail: TextBox | null; height: number } {
  // Önce hiçbir yazının kesilmediği (ve açıklamanın düşmediği) en sıkı biçim aranır; bütçe yetmezse eski sıkıştırma sırası.
  const variants: [number, number][] = [
    [2, 2],
    [2, 3],
    [3, 3],
    [2, 4],
    [3, 4],
    [2, 1],
    [1, 1],
    [2, 0],
    [1, 0],
  ];
  const build = (labelLines: number, detailLines: number) => {
    const role = placeText(`step${index}-role`, PATHWAY_ROLE_LABEL[step.role].toLocaleUpperCase("tr"), x, y, {
      maxWidth,
      maxLines: 2,
      fontSize: 9.5,
      minFontSize: 8,
      weight: 700,
      anchor,
    });
    const label = placeText(`step${index}-label`, step.label, x, role.rect.y + role.rect.h + 2, {
      maxWidth,
      maxLines: labelLines,
      fontSize: portrait ? 14 : 12.5,
      minFontSize: 10,
      weight: 700,
      anchor,
    });
    const detail =
      step.detail && detailLines > 0
        ? placeText(`step${index}-detail`, step.detail, x, label.rect.y + label.rect.h + 2, {
            maxWidth,
            maxLines: detailLines,
            fontSize: portrait ? 11 : 10,
            minFontSize: 9,
            anchor,
          })
        : null;
    const bottom = (detail ?? label).rect.y + (detail ?? label).rect.h;
    return { role, label, detail, height: bottom - y };
  };
  const whole = (built: ReturnType<typeof build>) =>
    !built.role.truncated && !built.label.truncated && (!step.detail || (built.detail !== null && !built.detail.truncated));
  for (const [labelLines, detailLines] of variants) {
    const built = build(labelLines, detailLines);
    if (built.height <= budget && whole(built)) return built;
  }
  let last: ReturnType<typeof build> | null = null;
  for (const [labelLines, detailLines] of variants) {
    last = build(labelLines, detailLines);
    if (last.height <= budget) return last;
  }
  return last!;
}

export function layoutMedicalPathway(data: MedicalPathwayData, frame: SceneFrame, domain?: AcademicDomain): MedicalPathwayLayout {
  const { content } = frame;
  const badge = `${domain ? DOMAIN_LABEL[domain] : "Tıp · Biyoloji"} · ${ARCHETYPE_LABEL.MEDICAL_BIOLOGY_PATHWAY}`;
  const header = layoutHeader(frame, data.title, badge);
  const texts: TextBox[] = [...header.texts];
  const segments: SceneLayout["segments"] = [];
  const markers: SceneLayout["markers"] = [];
  const top = header.bottom + (frame.portrait ? 14 : 12);
  const bottom = content.y + content.h;

  // Klinik spotu: dikeyde altta, yatayda sağ üstte (başlığın altında).
  const spotWidth = frame.portrait ? content.w : Math.round(content.w * 0.3);
  const spotX = frame.portrait ? content.x : content.x + content.w - spotWidth;
  const spotPad = 10;
  const kicker = placeText("spot-kicker", "TUS / KLİNİK SPOTU", spotX + spotPad + 18, 0, {
    maxWidth: spotWidth - spotPad * 2 - 18,
    maxLines: 1,
    fontSize: 10,
    weight: 800,
    single: true,
  });
  const spotTextProbe = placeText("spot-text", data.spotlight.text, spotX + spotPad, 0, {
    maxWidth: spotWidth - spotPad * 2,
    maxLines: frame.portrait ? 3 : 6,
    fontSize: frame.portrait ? 12.5 : 12,
    minFontSize: 10,
    weight: 600,
  });
  const spotHeight = spotPad + kicker.rect.h + 6 + spotTextProbe.rect.h + spotPad;
  const spotY = frame.portrait ? bottom - spotHeight : top;
  const kickerBox: TextBox = { ...kicker, y: spotY + spotPad, rect: { ...kicker.rect, y: spotY + spotPad } };
  const spotText = placeText("spot-text", data.spotlight.text, spotX + spotPad, spotY + spotPad + kicker.rect.h + 6, {
    maxWidth: spotWidth - spotPad * 2,
    maxLines: frame.portrait ? 3 : 6,
    fontSize: frame.portrait ? 12.5 : 12,
    minFontSize: 10,
    weight: 600,
  });
  const spotRect: Rect = { x: spotX, y: spotY, w: spotWidth, h: spotHeight };
  texts.push(kickerBox, spotText);

  const chainArea: Rect = frame.portrait
    ? { x: content.x, y: top, w: content.w, h: spotY - 14 - top }
    : { x: content.x, y: top, w: content.w - spotWidth - 18, h: bottom - top };

  const n = data.steps.length;
  const steps: MedicalStepLayout[] = [];
  if (frame.portrait) {
    const rowH = chainArea.h / n;
    const cx = chainArea.x + NODE_R + 4;
    const textX = cx + NODE_R + 12;
    const textW = chainArea.x + chainArea.w - textX;
    data.steps.forEach((step, index) => {
      const rowTop = chainArea.y + rowH * index;
      const block = stepTexts(index, step, textX, rowTop, textW, "start", rowH - 8, true);
      const shift = Math.max(0, (rowH - 8 - block.height) / 2);
      const move = (box: TextBox | null) => (box ? { ...box, y: box.y + shift, rect: { ...box.rect, y: box.rect.y + shift } } : null);
      const role = move(block.role)!;
      const label = move(block.label)!;
      const detail = move(block.detail);
      const cy = Math.min(rowTop + rowH - NODE_R - 4, Math.max(rowTop + NODE_R + 2, label.rect.y + label.lineHeightPx / 2));
      steps.push({ cx, cy, role, label, detail });
      texts.push(role, label, ...(detail ? [detail] : []));
    });
  } else {
    const spacing = chainArea.w / n;
    const baseCy = chainArea.y + NODE_R + 6;
    const blocks = data.steps.map((step, index) => {
      const cx = chainArea.x + spacing * index + spacing / 2;
      return { cx, block: stepTexts(index, step, cx, baseCy + NODE_R + 10, spacing - 10, "middle", chainArea.y + chainArea.h - (baseCy + NODE_R + 10), false) };
    });
    // Zincir boş alanın dikey ortasına alınır (yatayda alt yarı boş kalmasın); spot kutusu zincirle hizalanır.
    const chainBottom = Math.max(...blocks.map(({ block }) => (block.detail ?? block.label).rect.y + (block.detail ?? block.label).rect.h));
    const free = Math.max(0, chainArea.y + chainArea.h - chainBottom);
    const shift = Math.round(free * 0.42);
    const move = (box: TextBox | null) => (box ? { ...box, y: box.y + shift, rect: { ...box.rect, y: box.rect.y + shift } } : null);
    for (const { cx, block } of blocks) {
      const role = move(block.role)!;
      const label = move(block.label)!;
      const detail = move(block.detail);
      steps.push({ cx, cy: baseCy + shift, role, label, detail });
      texts.push(role, label, ...(detail ? [detail] : []));
    }
    const chainMid = (baseCy - NODE_R + chainBottom) / 2 + shift;
    const spotShift = Math.max(0, Math.min(bottom - spotRect.h - spotRect.y, Math.round(chainMid - spotRect.h / 2 - spotRect.y)));
    if (spotShift > 0) {
      spotRect.y += spotShift;
      for (const box of [kickerBox, spotText]) {
        box.y += spotShift;
        box.rect = { ...box.rect, y: box.rect.y + spotShift };
      }
    }
  }

  const arrows: MedicalPathwayLayout["arrows"] = [];
  for (let index = 1; index < steps.length; index += 1) {
    const from = steps[index - 1]!;
    const to = steps[index]!;
    const effect = data.steps[index]!.effect;
    const arrow = frame.portrait
      ? { x1: from.cx, y1: from.cy + NODE_R + 3, x2: to.cx, y2: to.cy - NODE_R - 4 }
      : { x1: from.cx + NODE_R + 3, y1: from.cy, x2: to.cx - NODE_R - 4, y2: to.cy };
    const mid = { x: (arrow.x1 + arrow.x2) / 2, y: (arrow.y1 + arrow.y2) / 2 };
    arrows.push({ ...arrow, effect, mid });
    segments.push(segment(`arrow${index}`, arrow.x1, arrow.y1, arrow.x2, arrow.y2));
    if (effect === "inhibit") markers.push({ id: `barrier${index}`, rect: { x: mid.x - 9, y: mid.y - 9, w: 18, h: 18 } });
  }
  steps.forEach((step, index) => markers.push({ id: `node${index}`, rect: inflate({ x: step.cx, y: step.cy, w: 0, h: 0 }, NODE_R) }));

  return { frame, texts, segments, markers, steps, arrows, spot: { rect: spotRect, kicker: kickerBox, text: spotText }, chainArea };
}

function LayerBackdrop({ layer, frame }: { layer: MedicalPathwayData["layer"]; frame: SceneFrame }) {
  const { width, height } = frame;
  if (layer === "tissue") {
    const size = frame.portrait ? 26 : 24;
    const cells: string[] = [];
    for (let row = 0; row * size * 0.86 < height + size; row += 1) {
      for (let col = 0; col * size * 1.5 < width + size; col += 1) {
        const cx = col * size * 1.5 + (row % 2 ? size * 0.75 : 0);
        const cy = row * size * 0.86;
        const r = size * 0.5;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i;
          return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        cells.push(pts);
      }
    }
    return (
      <g opacity={0.35} className="cp-vs-fade" style={delay(0)}>
        {cells.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke={MEDICAL_COLORS.layer} strokeWidth={1} />
        ))}
      </g>
    );
  }
  if (layer === "organ") {
    const cx = width * (frame.portrait ? 0.72 : 0.78);
    const cy = height * 0.5;
    const s = frame.portrait ? 1.1 : 0.95;
    return (
      <g opacity={0.32} className="cp-vs-fade" style={delay(0)} transform={`translate(${cx} ${cy}) scale(${s})`}>
        <path
          d="M-70,-90 C-20,-120 60,-110 80,-50 C100,10 70,90 10,110 C-50,130 -110,80 -110,10 C-110,-40 -100,-75 -70,-90 Z"
          fill={MEDICAL_COLORS.layer}
          stroke={MEDICAL_COLORS.membrane}
          strokeWidth={2}
        />
        <path d="M-40,-40 C0,-60 40,-30 30,10 M-50,20 C-10,40 30,50 50,30" fill="none" stroke={MEDICAL_COLORS.membrane} strokeWidth={1.5} />
      </g>
    );
  }
  // Hücre: zar yayları ve organeller.
  return (
    <g opacity={0.4} className="cp-vs-fade" style={delay(0)}>
      <ellipse cx={width * 0.85} cy={height * 0.55} rx={width * 0.55} ry={height * 0.62} fill="none" stroke={MEDICAL_COLORS.membrane} strokeWidth={3} />
      <ellipse cx={width * 0.85} cy={height * 0.55} rx={width * 0.5} ry={height * 0.57} fill="none" stroke={MEDICAL_COLORS.membrane} strokeWidth={1} strokeDasharray="2 5" />
      <ellipse cx={width * 0.82} cy={height * 0.62} rx={width * 0.12} ry={height * 0.07} fill={MEDICAL_COLORS.layer} />
      <circle cx={width * 0.7} cy={height * 0.3} r={6} fill={MEDICAL_COLORS.layer} />
      <circle cx={width * 0.92} cy={height * 0.38} r={4} fill={MEDICAL_COLORS.layer} />
    </g>
  );
}

export function MedicalPathwayScene({
  data,
  domain,
  ...common
}: SceneCommonProps & { data: MedicalPathwayData; domain?: AcademicDomain }) {
  const layout = layoutMedicalPathway(data, common.frame, domain);
  const id = useSceneIds("med");
  const [badge, title, ...rest] = layout.texts;
  void rest;
  const stepDelay = (index: number) => 0.35 + index * 0.55;
  return (
    <SceneSvg
      {...common}
      label={`${data.title}: ${data.steps.map((step) => step.label).join(" → ")}`}
      archetype="MEDICAL_BIOLOGY_PATHWAY"
      background={MEDICAL_COLORS.bg}
    >
      <ArrowDefs id={id} colors={{ activate: MEDICAL_COLORS.activate, inhibit: MEDICAL_COLORS.inhibit }} />
      <LayerBackdrop layer={data.layer} frame={common.frame} />
      <SceneBadge box={badge!} color={MEDICAL_COLORS.spot} textColor={MEDICAL_COLORS.spot} />
      <SceneText box={title!} fill={MEDICAL_COLORS.text} className="cp-vs-fade" style={delay(0.1)} />

      {layout.arrows.map((arrow, index) => {
        const color = arrow.effect === "activate" ? MEDICAL_COLORS.activate : MEDICAL_COLORS.inhibit;
        const at = stepDelay(index) + 0.3;
        const dx = arrow.x2 - arrow.x1;
        const dy = arrow.y2 - arrow.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        return (
          <g key={index} data-effect={arrow.effect}>
            <line
              x1={arrow.x1}
              y1={arrow.y1}
              x2={arrow.x2}
              y2={arrow.y2}
              pathLength={1}
              stroke={color}
              strokeWidth={arrow.effect === "activate" ? 3 : 2.5}
              strokeLinecap="round"
              markerEnd={arrow.effect === "activate" ? `url(#${id("arrow-activate")})` : undefined}
              filter={arrow.effect === "activate" ? `url(#${id("glow")})` : undefined}
              className="cp-vs-draw"
              style={delay(at, 0.6)}
            />
            {arrow.effect === "inhibit" ? (
              <g className="cp-vs-fade" style={delay(at + 0.45)} data-barrier="x">
                {/* İnhibisyon ucu: T çubuğu */}
                <line
                  x1={arrow.x2 + nx * 8}
                  y1={arrow.y2 + ny * 8}
                  x2={arrow.x2 - nx * 8}
                  y2={arrow.y2 - ny * 8}
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                {/* [X] bariyer ikonu */}
                <rect x={arrow.mid.x - 9} y={arrow.mid.y - 9} width={18} height={18} rx={4} fill={MEDICAL_COLORS.bg} stroke={color} strokeWidth={2} />
                <path
                  d={`M${arrow.mid.x - 4.5},${arrow.mid.y - 4.5} L${arrow.mid.x + 4.5},${arrow.mid.y + 4.5} M${arrow.mid.x + 4.5},${arrow.mid.y - 4.5} L${arrow.mid.x - 4.5},${arrow.mid.y + 4.5}`}
                  stroke={color}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              </g>
            ) : null}
          </g>
        );
      })}

      {layout.steps.map((step, index) => {
        const role = data.steps[index]!.role;
        const color = MEDICAL_COLORS.role[role];
        const at = stepDelay(index);
        return (
          <g key={index} data-role={role}>
            <circle
              cx={step.cx}
              cy={step.cy}
              r={NODE_R}
              fill={MEDICAL_COLORS.bg}
              stroke={color}
              strokeWidth={2.5}
              pathLength={1}
              className="cp-vs-draw"
              style={delay(at, 0.5)}
            />
            <circle cx={step.cx} cy={step.cy} r={NODE_R - 6} fill={color} opacity={0.85} className="cp-vs-fade" style={delay(at + 0.2)} />
            <SceneText box={step.role} fill={color} className="cp-vs-fade" style={delay(at + 0.1)} />
            <SceneText box={step.label} fill={MEDICAL_COLORS.text} className="cp-vs-fade" style={delay(at + 0.15)} rich />
            {step.detail ? <SceneText box={step.detail} fill={MEDICAL_COLORS.muted} className="cp-vs-fade" style={delay(at + 0.25)} rich /> : null}
          </g>
        );
      })}

      <g className="cp-vs-fade" style={delay(stepDelay(layout.steps.length) + 0.1)} data-spot="clinical">
        <rect
          x={layout.spot.rect.x}
          y={layout.spot.rect.y}
          width={layout.spot.rect.w}
          height={layout.spot.rect.h}
          rx={12}
          fill={MEDICAL_COLORS.spot}
          fillOpacity={0.12}
          stroke={MEDICAL_COLORS.spot}
          strokeWidth={1.5}
        />
        {/* Spot ikonu: hedef halkası */}
        <circle cx={layout.spot.rect.x + 17} cy={layout.spot.kicker.rect.y + layout.spot.kicker.rect.h / 2} r={6} fill="none" stroke={MEDICAL_COLORS.spot} strokeWidth={2} />
        <circle cx={layout.spot.rect.x + 17} cy={layout.spot.kicker.rect.y + layout.spot.kicker.rect.h / 2} r={2} fill={MEDICAL_COLORS.spot} />
        <SceneText box={layout.spot.kicker} fill={MEDICAL_COLORS.spot} />
        <SceneText box={layout.spot.text} fill={MEDICAL_COLORS.text} rich />
      </g>
    </SceneSvg>
  );
}
