/**
 * Cortex Plus işaretinin geometrisi — tek kaynak (19 Ekim 2026, ürün sahibinin seçimi: "B, sinir
 * ağı"). C, birbirine bağlı düğümlerden oluşur: korteks, yani beynin düşünen katmanı; ağın ucunda
 * artı. Uygulama bileşenleri, sekme simgesi ve paylaşım görseli aynı noktaları buradan okur.
 *
 * İki çizim var:
 * - Küçük (48'lik ızgara): altı düğümlük kırık çizgi + artı. 14–32 pikselde (menü, sekme) okunur.
 * - Ağ (120'lik ızgara): iki halka düğüm, basamak ve çapraz bağlar + artı. 40 piksel ve üstü;
 *   hareketli hali buradan çizilir.
 *
 * Sayılar iki ondalığa yuvarlanır: sunucu ve tarayıcı aynı metni üretsin (hidrasyon).
 */

const DEG = Math.PI / 180;
const round = (value: number) => Math.round(value * 100) / 100;
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  round(cx + r * Math.cos(deg * DEG)),
  round(cy + r * Math.sin(deg * DEG)),
];

/** Altın: açık uç beyaz zeminde de okunsun diye soluk sarı yerine tok sarıdan başlar. */
export const CORTEX_GOLD = { light: "#FFD45C", mid: "#FDB300", deep: "#E37A0B" } as const;

/** C'nin açıklığı sağda: üst uç 316°, alt uç 44°, aradaki yay soldan dolanır. */
const arc = (count: number) => Array.from({ length: count }, (_, i) => 316 - i * (272 / (count - 1)));

export const SMALL_MARK = {
  viewBox: "0 0 48 48",
  nodes: arc(6).map((deg) => polar(21, 24, 15, deg)),
  nodeR: 3.6,
  chainWidth: 3,
  plus: { x: 39.5, y: 24, arm: 6, width: 4.4 },
} as const;

const OUTER = arc(8).map((deg) => polar(54, 60, 45, deg));
const INNER = arc(8).map((deg) => polar(54, 60, 28, deg));

type Link = { from: [number, number]; to: [number, number]; order: number };

const LINKS: Link[] = OUTER.flatMap((point, i) => {
  const links: Link[] = [{ from: point, to: INNER[i], order: i }];
  if (i < OUTER.length - 1) {
    links.push({ from: point, to: OUTER[i + 1], order: i + 0.5 });
    links.push({ from: INNER[i], to: INNER[i + 1], order: i + 0.5 });
    links.push({ from: INNER[i], to: OUTER[i + 1], order: i + 0.5 });
  }
  return links;
});

export const NETWORK_MARK = {
  viewBox: "0 0 120 120",
  outer: OUTER,
  inner: INNER,
  links: LINKS,
  outerR: 4.8,
  innerR: 3.3,
  plus: { x: 101, y: 60, arm: 12, width: 7.5 },
} as const;
