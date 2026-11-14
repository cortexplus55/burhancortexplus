#!/usr/bin/env node
/**
 * Bileşen kullanım matrisi (Faz 0). `src/` içindeki içe aktarma grafiğini kurar; her sayfanın (page.tsx) dolaylı olarak
 * ulaştığı dosyaları bulur ve hedef bileşen dosyalarının hangi rotalarda kullanıldığını çıkarır. Ayrıca ortak düğme
 * bileşeni yerine kendi `<button>` / `<a className=...>` stilini yazan dosyaları sayar ("ham kullanım"). Yalnız okur.
 *
 *   node scripts/design/component-usage.mjs --json docs/design-migration/data/bilesen-kullanimi.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app");

// Prompt 1 / ORTAK KURALLAR 4.3 listesi → depodaki karşılık (dosya). Karşılığı olmayanlarda yalnız sınıf adı.
export const TARGETS = {
  Button: ["src/components/ui/button.tsx", "src/components/ui/button-variants.ts"],
  IconButton: ["src/components/ui/icon-button.tsx"],
  Badge: ["src/components/ui/badge.tsx"],
  Segmented: ["src/components/ui/segmented-control.tsx", "src/components/chat/tutor-mode-switcher.tsx", "src/components/landing/audience-tabs.tsx"],
  Card: ["src/components/ui/card.tsx", "src/components/ui/stat-card.tsx"],
  ListRow: [],
  Dialog: ["src/components/parity/profile-dialog.tsx", "src/components/parity/stars-dialog.tsx", "src/components/parity/journey-dialog.tsx", "src/components/parity/parity-dialog-host.tsx"],
  Sheet: ["src/components/parity/profile-identity.tsx", "src/components/paywall/upgrade-sheet.tsx"],
  Popover: ["src/components/chat/source-mode-pill.tsx"],
  Toast: ["src/components/ui/sonner.tsx"],
  Skeleton: ["src/components/ui/skeleton.tsx"],
  Progress: ["src/components/ui/progress-bar.tsx", "src/components/ui/progress-ring.tsx"],
  AnswerOption: ["src/components/ui/option-card.tsx"],
  Composer: ["src/components/chat/chat-panel.tsx", "src/components/parity/home-cockpit.tsx"],
  Callout: [],
  TopBar: ["src/components/parity/sor-shell.tsx"],
  ProfileCapsule: ["src/components/parity/profile-identity.tsx"],
  PhoneTabBar: ["src/components/parity/sor-shell.tsx"],
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}
const norm = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const files = walk(SRC);
const graph = new Map();
const source = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  source.set(norm(f), s);
  const deps = [...s.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => resolve(m[1], f)).filter(Boolean).map(norm);
  graph.set(norm(f), [...new Set(deps)]);
}

function urlOf(file) {
  const rel = path.relative(APP, path.dirname(path.join(ROOT, file))).split(path.sep).filter(Boolean);
  return "/" + rel.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).map((s) => s.replace(/^\[(.+)\]$/, ":$1")).join("/");
}

const pages = files.map(norm).filter((f) => /^src\/app\/.*page\.tsx$/.test(f) && !f.startsWith("src/app/e2e/"));
// Sayfanın yerleşimleri de ağaca girer (kabuk çoğu zaman sayfada ama bazen layout'ta).
function layoutsOf(page) {
  const out = [];
  for (let d = path.dirname(page); d.startsWith("src/app"); d = path.posix.dirname(d)) {
    const l = `${d}/layout.tsx`;
    if (graph.has(l)) out.push(l);
    if (d === "src/app") break;
  }
  return out;
}
const reach = new Map();
for (const p of pages) {
  const seen = new Set();
  const stack = [p, ...layoutsOf(p)];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) ?? []) stack.push(d);
  }
  reach.set(p, seen);
}

const usage = {};
for (const [name, targets] of Object.entries(TARGETS)) {
  const routes = pages.filter((p) => targets.some((t) => reach.get(p).has(t))).map(urlOf).sort();
  const importers = [...graph.entries()].filter(([f, deps]) => targets.some((t) => deps.includes(t)) && !targets.includes(f)).map(([f]) => f);
  usage[name] = { files: targets, routes, importers };
}

// Ham kullanım: kendi <button>/<a className> stilini yazan bileşen ve sayfalar (ortak Button/IconButton'ı içe aktarmadan).
const raw = [];
for (const [f, s] of source) {
  if (!/\.tsx$/.test(f) || f.startsWith("src/app/e2e/") || f.startsWith("src/components/ui/")) continue;
  const buttons = (s.match(/<button\b/g) ?? []).length;
  const anchors = (s.match(/<(a|Link)\b[^>]*className=/g) ?? []).length;
  if (!buttons && !anchors) continue;
  const usesShared = /components\/ui\/(button|icon-button)["']/.test(s);
  raw.push({ file: f, buttons, styledLinks: anchors, usesShared });
}
raw.sort((a, b) => b.buttons + b.styledLinks - (a.buttons + a.styledLinks));

const out = { usage, raw, pageCount: pages.length };
const i = process.argv.indexOf("--json");
if (i > 0) {
  fs.mkdirSync(path.dirname(process.argv[i + 1]), { recursive: true });
  fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
}
for (const [n, u] of Object.entries(usage)) console.log(`${n.padEnd(15)} rota=${String(u.routes.length).padStart(3)} içe aktaran=${u.importers.length}`);
console.log(`ham kullanım dosyası: ${raw.length}, ortak düğmeyi hiç kullanmayan: ${raw.filter((r) => !r.usesShared).length}, toplam <button>: ${raw.reduce((a, r) => a + r.buttons, 0)}`);
