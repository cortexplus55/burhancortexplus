/** İnteraktif laboratuvarların saf matematiği — UI'dan ayrı, test edilir. */

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function wrapDegrees(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return n === 0 && deg < 0 ? 0 : n;
}

export function quadrantOf(deg: number): 1 | 2 | 3 | 4 {
  const d = wrapDegrees(deg);
  if (d < 90) return 1;
  if (d < 180) return 2;
  if (d < 270) return 3;
  return 4;
}

export function quadrantSigns(q: 1 | 2 | 3 | 4): { sin: "+" | "-"; cos: "+" | "-"; tan: "+" | "-" } {
  if (q === 1) return { sin: "+", cos: "+", tan: "+" };
  if (q === 2) return { sin: "+", cos: "-", tan: "-" };
  if (q === 3) return { sin: "-", cos: "-", tan: "+" };
  return { sin: "-", cos: "+", tan: "-" };
}

export function trigAt(deg: number): { sin: number; cos: number; tan: number | null; rad: number; quadrant: 1 | 2 | 3 | 4 } {
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tan = Math.abs(cos) < 1e-10 ? null : sin / cos;
  return { sin, cos, tan, rad, quadrant: quadrantOf(deg) };
}

export function parabolaAt(a: number, b: number, c: number): {
  disc: number;
  vertex: { x: number; y: number } | null;
  roots: number[];
  rootState: "iki" | "cift" | "yok" | "dogrusal";
} {
  if (a === 0) {
    if (b === 0) return { disc: NaN, vertex: null, roots: [], rootState: "dogrusal" };
    return { disc: NaN, vertex: null, roots: [-c / b], rootState: "dogrusal" };
  }
  const disc = b * b - 4 * a * c;
  const vx = -b / (2 * a);
  const vy = a * vx * vx + b * vx + c;
  if (disc > 0) {
    const s = Math.sqrt(disc);
    return { disc, vertex: { x: vx, y: vy }, roots: [(-b + s) / (2 * a), (-b - s) / (2 * a)], rootState: "iki" };
  }
  if (disc === 0) return { disc, vertex: { x: vx, y: vy }, roots: [vx], rootState: "cift" };
  return { disc, vertex: { x: vx, y: vy }, roots: [], rootState: "yok" };
}

export const CELL_ORGANELLES = [
  { id: "nucleus", name: "Çekirdek", slot: "center", tip: "DNA burada. Sınavda: hücreyi yönetir, genetik bilgiyi saklar." },
  { id: "mito", name: "Mitokondri", slot: "right", tip: "ATP üretir. Sınavda: hücrenin enerji santrali." },
  { id: "ribo", name: "Ribozom", slot: "left", tip: "Protein sentezi. Sınavda: kaba ER üzerinde veya serbest." },
  { id: "golgi", name: "Golgi", slot: "top", tip: "Paketleme ve salgı. Sınavda: keseciklerle taşır." },
  { id: "er", name: "Endoplazmik retikulum", slot: "bottom", tip: "Sentez ve taşıma ağı. Kaba ER'de ribozom vardır." },
] as const;

export type OrganelleId = (typeof CELL_ORGANELLES)[number]["id"];
export type SlotId = (typeof CELL_ORGANELLES)[number]["slot"];

export function organelleForSlot(slot: SlotId): (typeof CELL_ORGANELLES)[number] {
  return CELL_ORGANELLES.find((item) => item.slot === slot)!;
}

export function scoreCellPlacement(placed: Partial<Record<SlotId, OrganelleId>>): {
  correct: number;
  total: number;
  mistakes: { slot: SlotId; expected: string; got: string }[];
} {
  const mistakes: { slot: SlotId; expected: string; got: string }[] = [];
  let correct = 0;
  for (const organelle of CELL_ORGANELLES) {
    const got = placed[organelle.slot];
    if (!got) continue;
    if (got === organelle.id) correct += 1;
    else {
      const name = CELL_ORGANELLES.find((item) => item.id === got)?.name ?? got;
      mistakes.push({ slot: organelle.slot, expected: organelle.name, got: name });
    }
  }
  return { correct, total: CELL_ORGANELLES.length, mistakes };
}
