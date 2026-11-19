import { resolvePedagogicalProfile, type PedagogicalLevel, type VisualDensity } from "@/lib/learning/pedagogical-profile";
import { fitSingleLine, fitText, type FitOptions, type FontWeight } from "@/lib/learning/visual-scenes/text-fit";

/**
 * Sahne yerleşimi (Faz 1-B): her sahne bileşeni önce saf bir yerleşim kurar (metin kutuları + çizgi
 * engelleri), sonra çizer. Testler aynı yerleşimi okuyup taşma ve çakışmayı ölçer.
 *
 * İki mod: `9:16` (mobil dikey reels, viewBox 360×640) ve `16:9` (masaüstü yatay, 640×360).
 * `safeBottomMargin`: videoda alt yazı bandının kapladığı şerit; çizim ve yazı oraya inmez.
 */

export type SceneMode = "9:16" | "16:9";
/** video: alt yazı bandı ve üst çubuk var; lesson: ders ekranındaki kart. */
export type SceneChrome = "video" | "lesson";

export type Rect = { x: number; y: number; w: number; h: number };

/* ───────── Yazı tabanı ve seviye yoğunluğu (20 Kasım 2026) ───────── */

/** Ekranda en küçük yazı (CSS px). */
export const MIN_SCREEN_TEXT_PX = 11;

/**
 * Sahnenin en dar gösterim genişliği (CSS px): 9:16 kart 375 px telefonda iki yanı 16 px boşlukla 343 px, 16:9 kart
 * ders ekranının yatay sahneye geçtiği 640 px kırılımında 608 px. viewBox bu genişliğe küçülür; taban buna göre.
 */
export const REFERENCE_DISPLAY_WIDTH: Record<SceneMode, number> = { "9:16": 343, "16:9": 608 };

/** viewBox biriminde yazı tabanı: en dar gösterimde de ekranda `MIN_SCREEN_TEXT_PX`'e denk gelir (0,1'e yukarı). */
export function sceneFontFloor(mode: SceneMode): number {
  const width = mode === "9:16" ? 360 : 640;
  return Math.ceil(((MIN_SCREEN_TEXT_PX * width) / REFERENCE_DISPLAY_WIDTH[mode]) * 10) / 10;
}

/** İki oranın tabanından büyüğü: her `placeText` çağrısı bunun altına inmez (çerçevesiz sahneler dahil). */
export const SCENE_FONT_FLOOR = Math.max(sceneFontFloor("9:16"), sceneFontFloor("16:9"));

export type SceneTextProfile = {
  level?: PedagogicalLevel;
  density: VisualDensity;
  /** Sahnede en çok bu kadar etiketli öğe; seviye yoksa sınır yok (eski sahneler aynen). */
  maxLabels: number;
  /** Yazı ölçeği: seviye 1'de büyük, 3-4'te biraz küçük (taban yine geçerli). */
  fontScale: number;
  floor: number;
};

/** Seviyeyi tek kaynaktan (`pedagogical-profile.ts`) okumak için temsilî sınıf / sınav metni. */
const LEVEL_PROBE: Record<PedagogicalLevel, [string | null, string | null]> = {
  1: ["8", null],
  2: ["10", null],
  3: ["Üniversite", null],
  4: [null, "KPSS"],
};

export function sceneTextProfile(mode: SceneMode, level?: PedagogicalLevel | null): SceneTextProfile {
  const floor = Math.max(SCENE_FONT_FLOOR, sceneFontFloor(mode));
  if (!level) return { density: "standard", maxLabels: Number.POSITIVE_INFINITY, fontScale: 1, floor };
  const visual = resolvePedagogicalProfile(...LEVEL_PROBE[level]).visual;
  return { level, density: visual.density, maxLabels: visual.maxLabels, fontScale: visual.fontScale, floor };
}

/** Teknik ayrıntı (kot, katman kalınlığı, ölçü çentikleri) yalnız üniversite ve uzmanlık düzeyinde. */
export function isTechnical(frame: Pick<SceneFrame, "text">): boolean {
  return frame.text.density === "technical" || frame.text.density === "dense";
}

export type SceneFrame = {
  mode: SceneMode;
  chrome: SceneChrome;
  width: number;
  height: number;
  safeTop: number;
  safeBottomMargin: number;
  pad: number;
  /** Çizim ve yazının kalabileceği alan. */
  content: Rect;
  portrait: boolean;
  /** Seviyeye göre yazı ölçeği, etiket bütçesi ve yazı tabanı. */
  text: SceneTextProfile;
};

export const SAFE_BOTTOM_MARGIN: Record<SceneChrome, Record<SceneMode, number>> = {
  video: { "9:16": 124, "16:9": 84 },
  lesson: { "9:16": 16, "16:9": 14 },
};

export function sceneFrame(mode: SceneMode, chrome: SceneChrome = "lesson", level?: PedagogicalLevel | null): SceneFrame {
  const portrait = mode === "9:16";
  const width = portrait ? 360 : 640;
  const height = portrait ? 640 : 360;
  const safeTop = chrome === "video" ? (portrait ? 14 : 10) : 12;
  const safeBottomMargin = SAFE_BOTTOM_MARGIN[chrome][mode];
  const pad = portrait ? 16 : 20;
  return {
    mode,
    chrome,
    width,
    height,
    safeTop,
    safeBottomMargin,
    pad,
    portrait,
    content: { x: pad, y: safeTop, w: width - pad * 2, h: height - safeTop - safeBottomMargin },
    text: sceneTextProfile(mode, level),
  };
}

export type TextAnchor = "start" | "middle" | "end";

export type TextBox = {
  id: string;
  lines: string[];
  fontSize: number;
  lineHeightPx: number;
  weight: FontWeight;
  anchor: TextAnchor;
  /** Çapa noktası (anchor'a göre) ve ilk satırın üst kenarı. */
  x: number;
  y: number;
  /** Kaplanan kutu (çakışma ölçümü için). */
  rect: Rect;
  truncated: boolean;
};

export type Segment = { id: string; x1: number; y1: number; x2: number; y2: number };

export type SceneLayout = {
  frame: SceneFrame;
  texts: TextBox[];
  /** Yazının binmemesi gereken çizgiler (ok, bağlantı, eksen, kenar). */
  segments: Segment[];
  /** Opak işaretleyiciler (numaralı pin gibi): yazıyla çakışmaz, çizginin üstünde durabilir. */
  markers: { id: string; rect: Rect }[];
};

export type PlaceOptions = Omit<FitOptions, "maxWidth"> & {
  maxWidth: number;
  anchor?: TextAnchor;
  /** true: tek satır, sığmazsa küçül ve kes. */
  single?: boolean;
  /** Yazı tabanı (viewBox birimi); verilmezse `SCENE_FONT_FLOOR`. */
  floor?: number;
};

/** Metni yerleştirir: x çapa, y üst kenar. Yazı ve en küçük boy tabanın altına inmez. */
export function placeText(id: string, text: string, x: number, y: number, raw: PlaceOptions): TextBox {
  const floor = raw.floor ?? SCENE_FONT_FLOOR;
  const start = Math.max(floor, raw.fontSize);
  const options = { ...raw, fontSize: start, minFontSize: Math.max(floor, Math.min(start, raw.minFontSize ?? 9)) };
  const anchor = options.anchor ?? "start";
  const weight = options.weight ?? 400;
  let lines: string[];
  let fontSize: number;
  let lineHeightPx: number;
  let width: number;
  let truncated = false;
  if (options.single || options.maxLines <= 1) {
    const fitted = fitSingleLine(text, options.maxWidth, options.fontSize, options.minFontSize ?? 9, weight);
    lines = [fitted.text];
    fontSize = fitted.fontSize;
    lineHeightPx = Math.ceil(fontSize * (options.lineHeight ?? 1.22));
    width = fitted.width;
    truncated = fitted.text.endsWith("…") && !text.trim().endsWith("…");
  } else {
    const fitted = fitText(text, { ...options, weight });
    lines = fitted.lines;
    fontSize = fitted.fontSize;
    lineHeightPx = fitted.lineHeightPx;
    width = fitted.width;
    truncated = fitted.truncated;
  }
  const left = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
  return {
    id,
    lines,
    fontSize,
    lineHeightPx,
    weight,
    anchor,
    x,
    y,
    rect: { x: left, y, w: width, h: lines.length * lineHeightPx },
    truncated,
  };
}

export type TextPlacer = (id: string, text: string, x: number, y: number, options: PlaceOptions) => TextBox;

/**
 * Çerçeveye bağlı yerleştirici: seviyenin yazı ölçeği istenen boya uygulanır, taban çerçeveden gelir. En küçük boy
 * ölçeklenmez (büyük yazı sığmazsa yine tabana kadar küçülür); her arketip sahnesi yazılarını bununla koyar.
 */
export function textPlacer(frame: Pick<SceneFrame, "text">): TextPlacer {
  const { fontScale, floor } = frame.text;
  return (id, text, x, y, options) =>
    placeText(id, text, x, y, { ...options, fontSize: Math.round(options.fontSize * fontScale * 10) / 10, floor: Math.max(floor, options.floor ?? 0) });
}

/**
 * Etiket bütçesi: öncelik sırasıyla verilen grupların toplamı `maxLabels`'ı aşarsa sondaki gruptan başlayarak öğe
 * düşer; her grup en az `keep` öğeyle kalır. Dönen dizi her grubun gösterilecek öğe sayısı.
 */
export function labelBudget(maxLabels: number, groups: { count: number; keep?: number }[]): number[] {
  const counts = groups.map((group) => group.count);
  let total = counts.reduce((sum, n) => sum + n, 0);
  for (let index = groups.length - 1; index >= 0 && total > maxLabels; index -= 1) {
    const keep = Math.min(groups[index]!.count, groups[index]!.keep ?? 0);
    const drop = Math.min(counts[index]! - keep, total - maxLabels);
    counts[index] = counts[index]! - drop;
    total -= drop;
  }
  return counts;
}

/** Yazının yüksekliği (yerleştirmeden önce dikey bütçe için). */
export function textHeight(box: Pick<TextBox, "lines" | "lineHeightPx">): number {
  return box.lines.length * box.lineHeightPx;
}

export function segment(id: string, x1: number, y1: number, x2: number, y2: number): Segment {
  return { id, x1, y1, x2, y2 };
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function lineIntersectsLine(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Çizgi parçası kutuyu kesiyor ya da içinde mi. */
export function segmentHitsRect(seg: Segment, rect: Rect): boolean {
  const inside = (x: number, y: number) => x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
  if (inside(seg.x1, seg.y1) || inside(seg.x2, seg.y2)) return true;
  const { x, y, w, h } = rect;
  return (
    lineIntersectsLine(seg.x1, seg.y1, seg.x2, seg.y2, x, y, x + w, y) ||
    lineIntersectsLine(seg.x1, seg.y1, seg.x2, seg.y2, x + w, y, x + w, y + h) ||
    lineIntersectsLine(seg.x1, seg.y1, seg.x2, seg.y2, x, y + h, x + w, y + h) ||
    lineIntersectsLine(seg.x1, seg.y1, seg.x2, seg.y2, x, y, x, y + h)
  );
}

export type LayoutIssue = { kind: "overflow" | "text_overlap" | "line_overlap" | "marker_overlap"; detail: string };

/**
 * Yerleşim denetimi: (1) her yazı içerik alanında (üstte safeTop, altta safeBottomMargin dışında),
 * (2) iki yazı üst üste binmez, (3) yazı çizgi engeline binmez, (4) yazı opak işaretleyiciye binmez.
 */
export function layoutIssues(layout: SceneLayout): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const { frame } = layout;
  const minY = frame.safeTop - 0.5;
  const maxY = frame.height - frame.safeBottomMargin + 0.5;
  for (const text of layout.texts) {
    const r = text.rect;
    if (r.x < -0.5 || r.x + r.w > frame.width + 0.5 || r.y < minY || r.y + r.h > maxY) {
      issues.push({ kind: "overflow", detail: `${text.id} ${JSON.stringify(r)}` });
    }
  }
  for (let i = 0; i < layout.texts.length; i += 1) {
    for (let j = i + 1; j < layout.texts.length; j += 1) {
      if (rectsOverlap(layout.texts[i]!.rect, layout.texts[j]!.rect)) {
        issues.push({ kind: "text_overlap", detail: `${layout.texts[i]!.id} × ${layout.texts[j]!.id}` });
      }
    }
  }
  for (const text of layout.texts) {
    for (const seg of layout.segments) {
      if (segmentHitsRect(seg, text.rect)) issues.push({ kind: "line_overlap", detail: `${text.id} × ${seg.id}` });
    }
    for (const marker of layout.markers) {
      if (rectsOverlap(marker.rect, text.rect)) issues.push({ kind: "marker_overlap", detail: `${text.id} × ${marker.id}` });
    }
  }
  return issues;
}

/** Dikey yığın: kutuları sırayla, aradaki boşlukla dizer; toplam yükseklik döner. */
export function stackHeight(heights: number[], gap: number): number {
  const visible = heights.filter((h) => h > 0);
  return visible.reduce((sum, h) => sum + h, 0) + Math.max(0, visible.length - 1) * gap;
}

/** Alanı oranlara böler (yatay ya da dikey). */
export function splitRect(rect: Rect, ratios: number[], gap: number, direction: "row" | "column"): Rect[] {
  const total = ratios.reduce((sum, r) => sum + r, 0) || 1;
  const span = (direction === "row" ? rect.w : rect.h) - gap * Math.max(0, ratios.length - 1);
  let cursor = direction === "row" ? rect.x : rect.y;
  return ratios.map((ratio) => {
    const size = (span * ratio) / total;
    const out: Rect = direction === "row" ? { x: cursor, y: rect.y, w: size, h: rect.h } : { x: rect.x, y: cursor, w: rect.w, h: size };
    cursor += size + gap;
    return out;
  });
}

export const BADGE_PAD = { x: 9, y: 4 } as const;

/**
 * Rozet: `right` sağ kenar, `top` üst kenar. Dönen kutunun `rect`'i dolguyu da kapsar (rozet zemini bu
 * kutuya çizilir), metin çapası dolgunun içindedir.
 */
export function placeBadge(id: string, text: string, right: number, top: number, maxWidth: number, fontSize = 10, maxLines = 1): TextBox {
  const upper = text.toLocaleUpperCase("tr");
  const options = { maxWidth: maxWidth - BADGE_PAD.x * 2, fontSize, minFontSize: 8, weight: 700 as const, anchor: "end" as const };
  let inner = placeText(id, upper, right - BADGE_PAD.x, top + BADGE_PAD.y, { ...options, maxLines: 1, single: true });
  // Yazı tabanında tek satıra sığmayan rozet (dar dikey kart) kesilmez, iki satıra sarılır.
  if (inner.truncated && maxLines > 1) inner = placeText(id, upper, right - BADGE_PAD.x, top + BADGE_PAD.y, { ...options, maxLines });
  const rect = {
    x: inner.rect.x - BADGE_PAD.x,
    y: top,
    w: inner.rect.w + BADGE_PAD.x * 2,
    h: inner.rect.h + BADGE_PAD.y * 2,
  };
  // Yazı rozetin ortasından çizilir: genişlik tahmini gerçek yazıdan biraz geniş olsa da yazı ortalı kalır.
  return { ...inner, anchor: "middle", x: rect.x + rect.w / 2, rect };
}

/** Kutuyu her yönde büyütür (dolgulu zeminin ölçüsü). */
export function inflate(rect: Rect, dx: number, dy = dx): Rect {
  return { x: rect.x - dx, y: rect.y - dy, w: rect.w + dx * 2, h: rect.h + dy * 2 };
}

/**
 * Sahne başlığı + arketip rozeti. Dikeyde rozet kendi satırında, başlık altında (dar genişlikte başlık
 * sıkışmasın); yatayda rozet sağda, başlık solda. `bottom`: başlık bloğunun alt kenarı.
 */
/** Yatay başlıkta başlık ile rozet arasındaki en az pay (viewBox birimi). */
export const HEADER_BADGE_GAP = 26;

export function layoutHeader(frame: SceneFrame, title: string, badge: string): { texts: TextBox[]; bottom: number } {
  const { content } = frame;
  const place = textPlacer(frame);
  if (frame.portrait) {
    const badgeBox = placeBadge("badge", badge, content.x + content.w, content.y, content.w, 10, 2);
    const titleBox = place("title", title, content.x, badgeBox.rect.y + badgeBox.rect.h + 8, {
      maxWidth: content.w,
      maxLines: 2,
      fontSize: 19,
      minFontSize: 14,
      weight: 800,
    });
    return { texts: [badgeBox, titleBox], bottom: titleBox.rect.y + titleBox.rect.h };
  }
  const badgeBox = placeBadge("badge", badge, content.x + content.w, content.y, Math.min(260, content.w * 0.44));
  if (badgeBox.truncated) {
    // Rozet yan yuvaya sığmıyorsa kesilmez: kendi satırına (sağa yaslı) iner, başlık altında tam genişlik alır.
    const ownRow = placeBadge("badge", badge, content.x + content.w, content.y, content.w, 10, 2);
    const titleBelow = place("title", title, content.x, ownRow.rect.y + ownRow.rect.h + 6, {
      maxWidth: content.w,
      maxLines: 2,
      fontSize: 17,
      minFontSize: 13,
      weight: 800,
    });
    return { texts: [ownRow, titleBelow], bottom: titleBelow.rect.y + titleBelow.rect.h };
  }
  // Başlık ile yanındaki rozet arasındaki pay (20 Kasım 2026): genişlik tahmini Figtree içindir; yazı tipi geç yüklenen ya
  // da yedek yazı tipine düşen tarayıcıda kalın başlık birkaç piksel geniş çizildi ve rozete bindi (CI, 16:9). 14 → 26.
  const titleBox = place("title", title, content.x, content.y, {
    maxWidth: content.w - badgeBox.rect.w - HEADER_BADGE_GAP,
    maxLines: 2,
    fontSize: 17,
    minFontSize: 13,
    weight: 800,
  });
  return {
    texts: [badgeBox, titleBox],
    bottom: Math.max(titleBox.rect.y + titleBox.rect.h, badgeBox.rect.y + badgeBox.rect.h),
  };
}

/** Yazı kutusunu (çapa + kaplanan alan) birlikte kaydırır. */
export function shiftBox(box: TextBox, dx: number, dy: number): TextBox {
  return { ...box, x: box.x + dx, y: box.y + dy, rect: { ...box.rect, x: box.rect.x + dx, y: box.rect.y + dy } };
}

/** Alanı kaydırır. */
export function shiftRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}
