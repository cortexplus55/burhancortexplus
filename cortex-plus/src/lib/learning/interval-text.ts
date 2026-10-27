/**
 * Tablo hücresi bölününce aralık `[−3: | 5]` diye ekrana düşüyordu.
 * Köşeli ayraç içindeki `|` hücre sınırı değildir; kopuk çift tek aralığa döner.
 */

/** `[−3: | 5]` ve `[−3:|5]` → `[−3, 5]`. */
export function repairBrokenInterval(text: string): string {
  return text.replace(/\[\s*([^\[\]|]{1,40}):\s*\|\s*([^\[\]|]{1,40})\s*\]/g, "[$1, $2]");
}

/** `[−3:` ile `5]` yan yana iki hücreyse tek hücre olur. */
export function rejoinIntervalCells(cells: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < cells.length; index += 1) {
    const left = cells[index]?.trim() ?? "";
    const right = cells[index + 1]?.trim() ?? "";
    if (/^\[[^\[\]|]*:$/.test(left) && /^[^\[\]|]*\]$/.test(right)) {
      out.push(repairBrokenInterval(`${left.slice(0, -1)}, ${right}`));
      index += 1;
      continue;
    }
    out.push(repairBrokenInterval(cells[index] ?? ""));
  }
  return out;
}

/** Markdown satırını böler. Ayraç köşeli veya yuvarlak parantezin içindeyse kesmez. */
export function splitTableCells(line: string): string[] {
  const inner = line.startsWith("|") && line.endsWith("|") ? line.slice(1, -1) : line;
  const cells: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "[" || ch === "(") depth += 1;
    else if ((ch === "]" || ch === ")") && depth > 0) depth -= 1;
    if (ch === "|" && depth === 0) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells.map((cell) => repairBrokenInterval(cell));
}
