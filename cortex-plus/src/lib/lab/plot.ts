import type { Expr } from "@/lib/lab/expr";

/**
 * Fonksiyon grafiği için ölçek ve örnekleme.
 *
 * Tek başına önemli olan kısım süreksizlik: tan(x) ya da 1/x örneklenip
 * düz bir yol olarak çizilirse, kopma noktasında ekranı boydan boya kesen
 * dikey bir çizgi çıkıyor ve öğrenci bunu grafiğin parçası sanıyor. Burada
 * tanımsız değerlerde ve ani sıçramalarda yol kırılıyor.
 */

export type Scale = {
  px: (x: number) => number;
  py: (y: number) => number;
  W: number;
  H: number;
  PAD: number;
};

const round = (v: number) => Math.round(v * 100) / 100;

export function makeScale(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  W = 560,
  H = 280,
  PAD = 32,
): Scale {
  const sx = (W - PAD * 2) / Math.max(xMax - xMin, 1e-9);
  const sy = (H - PAD * 2) / Math.max(yMax - yMin, 1e-9);
  return {
    px: (x) => round(PAD + (x - xMin) * sx),
    py: (y) => round(H - PAD - (y - yMin) * sy),
    W,
    H,
    PAD,
  };
}

/**
 * Eğriyi SVG yoluna çevirir. Dönen dizinin her elemanı kesintisiz bir
 * parça — süreksizlikte yeni parça başlıyor.
 */
export function curvePaths(
  f: Expr,
  scale: Scale,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  samples = 400,
): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  let prevY: number | null = null;

  // Ekran yüksekliğinin bu kadarını tek adımda aşan sıçrama süreksizlik
  // sayılıyor. Eşik yerine oran kullanılıyor ki ölçekten bağımsız olsun.
  const jumpLimit = (yMax - yMin) * 0.35;

  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const y = f(x);

    const bad =
      !Number.isFinite(y) ||
      y > yMax + (yMax - yMin) * 2 ||
      y < yMin - (yMax - yMin) * 2;

    if (bad) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
      prevY = null;
      continue;
    }

    if (prevY !== null && Math.abs(y - prevY) > jumpLimit) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
    }

    current.push(`${current.length ? "L" : "M"}${scale.px(x)},${scale.py(y)}`);
    prevY = y;
  }

  if (current.length > 1) paths.push(current.join(" "));
  return paths;
}

/**
 * Görünür y aralığını veriden seçer.
 *
 * Sabit aralık kötü: x² ile sin(x) aynı pencerede çizilemiyor. Uç değerleri
 * atmak için yüzdelik kullanılıyor — tek bir asimptot bütün grafiği
 * ezmesin.
 */
export function autoRange(
  f: Expr,
  xMin: number,
  xMax: number,
  samples = 300,
): { yMin: number; yMax: number } {
  const ys: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const y = f(xMin + ((xMax - xMin) * i) / samples);
    if (Number.isFinite(y)) ys.push(y);
  }
  if (!ys.length) return { yMin: -1, yMax: 1 };

  ys.sort((a, b) => a - b);
  const lo = ys[Math.floor(ys.length * 0.02)];
  const hi = ys[Math.floor(ys.length * 0.98)];

  let yMin = Math.min(lo, 0);
  let yMax = Math.max(hi, 0);
  if (yMax - yMin < 1e-6) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.1;
  return { yMin: yMin - pad, yMax: yMax + pad };
}
