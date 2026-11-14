#!/usr/bin/env node
/**
 * Rota envanteri (Faz 0, 14 Kasım 2026). `src/app` ağacını tarar; her sayfa ve API ucu için yol, dosya,
 * sunucu/istemci, giriş gereksinimi, plan duyarlılığı, dinamik parametreler ve kullandığı bileşenleri çıkarır.
 *
 * Yalnız okur; hiçbir dosyayı değiştirmez. Çıktı: JSON (stdout ya da --json <dosya>).
 *
 *   node scripts/design/route-inventory.mjs --json docs/design-migration/data/rotalar.json
 *
 * Sezgiler (belgede de yazılı):
 * - giriş: middleware'in PROTECTED_PREFIXES listesi ya da sayfada require* kapısı.
 * - plan (içerik): sayfa dosyası ya da doğrudan içe aktardığı yerel bileşenler plan okuyan bir ad taşıyor.
 * - plan (kabuk): sayfa öğrenci kabuğunu (ParitySorShell / AppShell) çiziyor; kapsül planı gösterir.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");
const SRC = path.join(ROOT, "src");

const PLAN_RE =
  /\b(isPremium|showsUpgradeChrome|subscriptionBadge|planSlug|planIdentity|isFounder|plusOnlyLocked|PLUS_ONLY|freeLessonGate|freeTopicGate|pathSkipKinds|entitlements|getStudentAccountContext|billingExempt|audience\s*===|isAdminUser|\.isAdmin\b|adminPanel|showBuy|FREE_LIMITS|free_lesson_limit|premium_required)\b/;
const SHELL_RE = /<(ParitySorShell|AppShell)\b/;
const SHELL_FILES =
  /(components\/parity\/sor-shell\.tsx|components\/layout\/app-shell\.tsx|lib\/student\/(parity-shell-props|optional-shell|account-context)\.ts|lib\/auth\/session\.ts)$/;
const AUTH_RE = /\b(requireStudentArea|requireUser|requireAdminPage|requireFounderPage|requireAdmin|withUser)\s*\(/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function readProtected() {
  const mw = fs.readFileSync(path.join(SRC, "lib", "supabase", "middleware.ts"), "utf8");
  const block = mw.match(/const PROTECTED_PREFIXES = \[([\s\S]*?)\];/);
  return block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

function urlOf(file) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter(Boolean);
  const parts = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"));
  return "/" + parts.map((s) => s.replace(/^\[\.\.\.(.+)\]$/, "*$1").replace(/^\[(.+)\]$/, ":$1")).join("/");
}

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

function importsOf(src) {
  return [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const protectedPrefixes = readProtected();
const isProtected = (url) => protectedPrefixes.some((p) => url === p || url.startsWith(`${p}/`));

const files = walk(APP).filter((f) => /[\\/](page|route)\.(tsx|ts)$/.test(f));
const rows = files
  .map((file) => {
    const src = fs.readFileSync(file, "utf8");
    // Üst klasörlerdeki layout.tsx: kabuk ve giriş kapısı orada da olabilir.
    const layouts = [];
    for (let d = path.dirname(file); d.startsWith(APP); d = path.dirname(d)) {
      const l = path.join(d, "layout.tsx");
      if (fs.existsSync(l)) layouts.push(fs.readFileSync(l, "utf8"));
      if (d === APP) break;
    }
    const layoutSrc = layouts.join("\n");
    const kind = /page\.tsx?$/.test(file) ? "sayfa" : "api";
    const url = urlOf(file);
    const imports = importsOf(src);
    const components = imports.filter((s) => s.startsWith("@/components/") || (s.startsWith("./") && kind === "sayfa"));
    // Plan okuması: sayfa + doğrudan içe aktarılan yerel dosyalar (bir kat).
    const localFiles = imports.map((s) => resolveImport(s, file)).filter(Boolean);
    const planHits = [];
    if (PLAN_RE.test(src)) planHits.push(path.relative(ROOT, file));
    for (const f of localFiles) {
      // Kabuğun kendisi ve kabuğun veri yükleyicileri plan okur ama sayfanın içeriği değil (kabuk sütunu ayrı).
      if (SHELL_FILES.test(f.replaceAll("\\", "/"))) continue;
      const s = fs.readFileSync(f, "utf8");
      if (PLAN_RE.test(s)) planHits.push(path.relative(ROOT, f));
    }
    return {
      url,
      kind,
      file: path.relative(ROOT, file).replaceAll("\\", "/"),
      client: /^\s*["']use client["']/.test(src),
      redirectOnly: kind === "sayfa" && /\bredirect\(/.test(src) && !/return\s*\(?\s*</.test(src),
      fixture: url.startsWith("/e2e"),
      auth: AUTH_RE.test(src) || AUTH_RE.test(layoutSrc) ? "sayfa kapısı" : isProtected(url) ? "middleware" : "herkese açık",
      shellPlan: SHELL_RE.test(src) || SHELL_RE.test(layoutSrc) || /loadParityShellProps|loadOptionalStudentShell/.test(src),
      optionalShell: /loadOptionalStudentShell/.test(src),
      planContent: [...new Set(planHits)].map((p) => p.replaceAll("\\", "/")),
      params: [...url.matchAll(/[:*]([A-Za-z0-9_]+)/g)].map((m) => m[1]),
      components: [...new Set(components)].map((c) => c.replace("@/components/", "")),
    };
  })
  .sort((a, b) => (a.kind === b.kind ? a.url.localeCompare(b.url) : a.kind === "sayfa" ? -1 : 1));

const out = { generatedAt: new Date().toISOString(), protectedPrefixes, rows };
const i = process.argv.indexOf("--json");
if (i > 0) {
  fs.mkdirSync(path.dirname(process.argv[i + 1]), { recursive: true });
  fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
  const pages = rows.filter((r) => r.kind === "sayfa");
  console.log(`sayfa ${pages.length} (fikstür ${pages.filter((r) => r.fixture).length}), api ${rows.length - pages.length}`);
} else {
  console.log(JSON.stringify(out, null, 2));
}
