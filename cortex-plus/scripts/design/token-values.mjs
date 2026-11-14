#!/usr/bin/env node
/**
 * Depodaki gerçek token değerleri (Faz 0): `src/styles/tokens.css` içindeki `:root` (açık tema) ve `.dark` (koyu tema)
 * bloklarından `--cx-*` değerlerini okur. Yalnız okur; 07-token-degerleri.md'nin tablosunu üretir.
 *
 *   node scripts/design/token-values.mjs > docs/design-migration/data/token-degerleri.json
 */
import fs from "node:fs";

const css = fs.readFileSync("src/styles/tokens.css", "utf8").replace(/\r\n/g, "\n");
function block(selector) {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("\n}", start));
}
function values(text) {
  const out = {};
  for (const m of text.matchAll(/^\s*(--cx-[a-z0-9-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}
const light = values(block(":root"));
const dark = values(block(".dark"));
console.log(JSON.stringify({ light, dark }, null, 1));
