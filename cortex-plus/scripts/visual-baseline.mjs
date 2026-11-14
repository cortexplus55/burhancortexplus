#!/usr/bin/env node
/**
 * Görsel taban kapısı ve manifesti (Faz 0, 2.6). Taban görüntüleri git'te değil (ürün sahibinin kararı, 14 Kasım 2026):
 * Windows'ta üretildi, Linux CI karşılaştıramaz, her güncelleme depoyu kalıcı büyütürdü, yeniden üretilebilir. Git'te
 * yalnız kaydı durur: tests/visual/baseline-manifest.json.
 *
 *   npm run test:visual            # önce görüntüleri manifestle karşılaştırır, tutarsa Playwright'ı çalıştırır
 *   npm run test:visual:update     # tabanı yeniden üretir ve manifesti yeniden yazar (yalnız bilinçli)
 *   node scripts/visual-baseline.mjs verify     # yalnız karşılaştırma
 *   node scripts/visual-baseline.mjs manifest   # yalnız manifest
 *
 * CI'da (CI=true) hiçbir şey çalıştırmaz, "atlandı" der ve 0 ile çıkar. Ek argümanlar Playwright'a geçer.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests/visual/__screenshots__");
const MANIFEST = path.join(ROOT, "tests/visual/baseline-manifest.json");
const CONFIG = "tests/visual/visual.config.ts";
const WIDTH = { masaustu: 1280, tablet: 768, telefon: 375 };
const USERS = ["e2e-free-exhausted", "e2e-free-fresh", "e2e-plus", "e2e-sigma", "kurucu"];
const [mode = "run", ...rest] = process.argv.slice(2);

const REGENERATE = [
  "Tabanı yeniden üretmek için (docs/design-migration/00-taban.md, \"Yeniden üretim\"):",
  "  npm run e2e:seed",
  "  npm run test:visual:update",
  "Manifestteki görüntülerle birebir aynısı için tarifteki temiz worktree adımlarını izleyin.",
].join("\n");

if (process.env.CI) {
  console.log("test:visual atlandı: görsel taban yalnızca Windows'ta, yerelde tutuluyor (00-taban.md). CI'da karşılaştırma yapılmaz.");
  process.exit(0);
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function listImages() {
  if (!fs.existsSync(DIR)) return [];
  const out = [];
  for (const project of fs.readdirSync(DIR).sort()) {
    const folder = path.join(DIR, project);
    if (!fs.statSync(folder).isDirectory()) continue;
    for (const file of fs.readdirSync(folder).filter((f) => f.endsWith(".png")).sort()) {
      const user = USERS.filter((u) => file.startsWith(`${u}-`)).sort((a, b) => b.length - a.length)[0] ?? null;
      out.push({
        file: `${project}/${file}`,
        project,
        width: WIDTH[project] ?? null,
        user: user === "kurucu" ? "kurucu (fikstür)" : user,
        route: user ? file.slice(user.length + 1, -4) : file.slice(0, -4),
        bytes: fs.statSync(path.join(folder, file)).size,
        sha256: sha256(path.join(folder, file)),
      });
    }
  }
  return out;
}

async function writeManifest() {
  const images = listImages();
  if (!images.length) throw new Error("Görüntü yok; önce npm run test:visual:update.");
  const browser = await chromium.launch();
  const chromiumVersion = browser.version();
  await browser.close();
  const config = fs.readFileSync(path.join(ROOT, CONFIG), "utf8");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "src", "tests/visual", "scripts", "package.json", "package-lock.json"], { cwd: ROOT })
    .toString()
    .split("\n")
    .filter((line) => line.trim() && !line.includes("__screenshots__") && !line.includes("baseline-manifest.json"));
  const totalBytes = images.reduce((sum, image) => sum + image.bytes, 0);
  const manifest = {
    _not: "Görsel taban görüntüleri git'te değil; bu dosya onların kaydıdır. Yeniden üretim: docs/design-migration/00-taban.md.",
    BASELINE_SHA: head,
    workingTreeClean: dirty.length === 0,
    generatedAt: new Date().toISOString(),
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version,
    playwright: JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/@playwright/test/package.json"), "utf8")).version,
    chromium: chromiumVersion,
    server: "next build + next start (E2E_FIXTURE=1; OPENAI_API_KEY, SMTP, RESEND boş)",
    widths: { masaustu: "1280x800", tablet: "768x1024", telefon: "375x812 (isMobile, hasTouch)" },
    deviceScaleFactor: 1,
    threshold: { maxDiffPixelRatio: Number(/maxDiffPixelRatio:\s*([\d.]+)/.exec(config)?.[1] ?? NaN) },
    fixedTime: "2026-11-14T12:00:00+03:00",
    count: images.length,
    totalBytes,
    totalMB: Number((totalBytes / 1048576).toFixed(2)),
    images,
  };
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Manifest yazıldı: ${images.length} görüntü, ${manifest.totalMB} MB, BASELINE_SHA ${head.slice(0, 8)}${dirty.length ? " (çalışma ağacı temiz değil)" : ""}.`);
}

/** Görüntüler manifestle aynı mı: sayı, ad ve sha256. Fark listesi döner. */
function compare() {
  if (!fs.existsSync(MANIFEST)) return { ok: false, problems: ["tests/visual/baseline-manifest.json yok."] };
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (!fs.existsSync(DIR)) return { ok: false, problems: ["Görüntü klasörü (tests/visual/__screenshots__) yok: taban bu makinede üretilmemiş."] };
  const local = new Map(listImages().map((image) => [image.file, image]));
  const problems = [];
  for (const image of manifest.images) {
    const mine = local.get(image.file);
    if (!mine) problems.push(`eksik: ${image.file}`);
    else if (mine.sha256 !== image.sha256) problems.push(`farklı: ${image.file}`);
    local.delete(image.file);
  }
  for (const file of local.keys()) problems.push(`manifestte yok: ${file}`);
  return { ok: problems.length === 0, problems, manifest };
}

function playwright(extra) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, ["playwright", "test", "-c", CONFIG, ...extra], { stdio: "inherit", shell: process.platform === "win32" });
  return result.status ?? 1;
}

if (mode === "manifest") {
  await writeManifest();
} else if (mode === "verify" || mode === "run") {
  const { ok, problems, manifest } = compare();
  if (!ok) {
    console.error("Görsel taban bu makinede manifestle uyuşmuyor:");
    for (const line of problems.slice(0, 15)) console.error(`  - ${line}`);
    if (problems.length > 15) console.error(`  … ve ${problems.length - 15} fark daha`);
    if (manifest) console.error(`Manifest: ${manifest.count} görüntü, ${manifest.totalMB} MB, ${manifest.os}, Chromium ${manifest.chromium}, BASELINE_SHA ${manifest.BASELINE_SHA.slice(0, 8)}.`);
    console.error(REGENERATE);
    process.exit(1);
  }
  console.log(`Görsel taban manifestle aynı (${manifest.count} görüntü, ${manifest.totalMB} MB).`);
  if (mode === "run") process.exit(playwright(rest));
} else if (mode === "update") {
  // "all": yalın --update-snapshots Playwright'ta "changed" kipidir ve eşik içindeki görüntüyü yeniden yazmaz; taban
  // eski üretimden kalırdı (14 Kasım 2026'da bu yüzden manifest ile yeni üretim ayrıştı).
  const status = playwright(["--update-snapshots=all", ...rest]);
  if (status !== 0) {
    console.error("Playwright başarısız; manifest yazılmadı.");
    process.exit(status);
  }
  await writeManifest();
} else {
  console.error("Kullanım: node scripts/visual-baseline.mjs [run|update|verify|manifest]");
  process.exit(2);
}
