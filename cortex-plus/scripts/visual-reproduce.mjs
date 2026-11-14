#!/usr/bin/env node
/**
 * Görsel tabanın yeniden üretimi (00-taban.md, "Yeniden üretim"): verilen commit'i temiz bir worktree'ye çıkarır, üretim
 * derlemesi alır, `test:visual:update` çalıştırır ve üretilen görüntülerin sha256'larını o commit'teki manifestle
 * karşılaştırır. Bitince worktree'yi kaldırır. Yalnız Node (Windows'ta bash'e özgü komut yok).
 *
 *   node scripts/visual-reproduce.mjs --commit <sha>
 *
 * Ön koşul: bu klasörde `.env.local` ve `tests/.auth/` (npm run e2e:seed). 3006'da çalışan sunucu kapalı olmalı:
 * Playwright onu yeniden kullanır ve üretim temiz worktree'den olmaz.
 * Bağımlılık: worktree'nin kilit dosyası buradakiyle aynıysa node_modules'e "junction" bağlanır (yoksa npm ci).
 * Temizlikte bağlantı ÖNCE rmdir ile kaldırılır: `git worktree remove` bağlantının içini (ana node_modules'ü) silerdi.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const ROOT = process.cwd();
const REPO = path.resolve(ROOT, "..");
const argv = process.argv.slice(2);
const COMMIT = argv[argv.indexOf("--commit") + 1];
if (!argv.includes("--commit") || !COMMIT) {
  console.error("Kullanım: node scripts/visual-reproduce.mjs --commit <sha>");
  process.exit(2);
}
const WIN = process.platform === "win32";
const WT = path.join(os.tmpdir(), "cortex-visual", COMMIT.slice(0, 12));
const APP = path.join(WT, "cortex-plus");
const LINK = path.join(APP, "node_modules");

async function portBusy() {
  try {
    await fetch("http://127.0.0.1:3006/giris", { redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: WIN, ...options });
  return r.status ?? 1;
}

function cleanup() {
  try {
    if (fs.lstatSync(LINK).isSymbolicLink()) fs.rmdirSync(LINK);
  } catch {}
  let linked = false;
  try {
    linked = fs.lstatSync(LINK).isSymbolicLink();
  } catch {}
  if (linked) {
    console.error(`${LINK} bağlantısı kaldırılamadı; worktree bırakıldı (elle: rmdir, sonra git worktree remove).`);
    return;
  }
  fs.rmSync(path.join(APP, ".env.local"), { force: true });
  fs.rmSync(path.join(APP, "tests/.auth"), { recursive: true, force: true });
  spawnSync("git", ["worktree", "remove", "--force", WT], { cwd: REPO, stdio: "inherit" });
}

if (await portBusy()) {
  console.error("3006'da çalışan bir sunucu var; kapatın (temiz üretim için Playwright kendi derlemesini başlatmalı).");
  process.exit(2);
}

let exitCode = 1;
try {
  if (fs.existsSync(WT)) cleanup();
  if (run("git", ["worktree", "add", "--detach", WT, COMMIT], { cwd: REPO, shell: false }) !== 0) throw new Error("worktree açılamadı");
  const sameLock = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8") === fs.readFileSync(path.join(APP, rel), "utf8");
  if (sameLock("package-lock.json") && sameLock("package.json")) fs.symlinkSync(path.join(ROOT, "node_modules"), LINK, "junction");
  else if (run("npm", ["ci"], { cwd: APP }) !== 0) throw new Error("npm ci başarısız");
  fs.copyFileSync(path.join(ROOT, ".env.local"), path.join(APP, ".env.local"));
  // fs.cpSync burada kullanılmaz: Node 24 bu makinede (Türkçe karakterli yol) onunla sessizce 127 koduyla kapanıyor.
  const copyDir = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) copyDir(path.join(from, entry.name), path.join(to, entry.name));
      else fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  };
  copyDir(path.join(ROOT, "tests/.auth"), path.join(APP, "tests/.auth"));

  const committed = JSON.parse(fs.readFileSync(path.join(APP, "tests/visual/baseline-manifest.json"), "utf8"));
  // 1) Algısal karşılaştırma: bu makinedeki tabanı worktree'ye koy, temiz derlemeyle `test:visual` (eşik 0,002).
  copyDir(path.join(ROOT, "tests/visual/__screenshots__"), path.join(APP, "tests/visual/__screenshots__"));
  const perceptual = run("npm", ["run", "test:visual"], { cwd: APP }) === 0;
  // 2) Bayt karşılaştırması: tabanı temiz worktree'de yeniden üret, sha256'ları commit'teki manifestle karşılaştır.
  if (run("npm", ["run", "test:visual:update"], { cwd: APP }) !== 0) throw new Error("test:visual:update başarısız");

  const dir = path.join(APP, "tests/visual/__screenshots__");
  const mismatched = [];
  for (const image of committed.images) {
    const file = path.join(dir, image.file);
    if (!fs.existsSync(file)) mismatched.push(`eksik: ${image.file}`);
    else if (crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== image.sha256) mismatched.push(image.file);
  }
  const produced = JSON.parse(fs.readFileSync(path.join(APP, "tests/visual/baseline-manifest.json"), "utf8"));
  const result = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: APP }).toString().trim(),
    manifestSha: committed.BASELINE_SHA,
    perceptualPass: perceptual,
    produced: produced.count,
    expected: committed.count,
    matched: committed.count - mismatched.length,
    mismatched,
  };
  const out = path.join(ROOT, "docs/design-migration/data/gorsel-yeniden-uretim.json");
  fs.writeFileSync(out, `${JSON.stringify({ ranAt: new Date().toISOString(), ...result }, null, 1)}\n`);
  console.log(`\nAlgısal karşılaştırma (eşik 0,002): ${perceptual ? "geçti" : "DÜŞTÜ"}.`);
  console.log(`${result.matched}/${result.expected} görüntü manifestle birebir aynı${mismatched.length ? `; farklı: ${mismatched.slice(0, 10).join(", ")}` : ""}.`);
  console.log(`Sonuç: ${path.relative(ROOT, out)}`);
  exitCode = mismatched.length ? 1 : 0;
} catch (error) {
  console.error(`Durdu: ${error.message}`);
} finally {
  cleanup();
}
process.exit(exitCode);
