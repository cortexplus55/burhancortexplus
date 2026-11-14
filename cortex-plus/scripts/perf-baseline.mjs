#!/usr/bin/env node
/**
 * Performans tabanı (Faz 0, 2.9): verilen commit'leri geçici worktree'lere çıkarır, üretim derlemesi alır, yerelde başlatır
 * ve `perf-measure.mjs`'i her birine karşı çalıştırır. Bittiğinde worktree'leri ve sunucuları kaldırır. Yalnız Node
 * (Windows'ta bash'e özgü komut yok).
 *
 *   node scripts/perf-baseline.mjs --commits 1288c254,b25a9229,492e206e --labels taban-1288c25,taban-b25a922,faz0-492e206
 *   node scripts/perf-baseline.mjs ... --repeat faz0-492e206   # gürültü için bu etiketi ikinci kez ölç (…-tekrar)
 *
 * - Bağımlılıklar: üç commit'in package.json ve kilit dosyası aynı (14 Kasım 2026'da denetlendi); worktree'de ayrı kurulum
 *   yerine ana node_modules'e "junction" bağlanır. Temizlikte bağlantı ÖNCE rmdir ile kaldırılır: `git worktree remove`
 *   bağlantının içini (ana node_modules'ü) silerdi.
 * - Ortam: yalnız yerel `.env.local` (geçici olarak worktree'ye kopyalanır, temizlikte silinir; değerler yazdırılmaz).
 *   Derlemede `SENTRY_AUTH_TOKEN` boş (kaynak haritası yüklenmez); sunucuda model anahtarı, SMTP ve Resend boş.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";

const ROOT = process.cwd(); // cortex-plus
const REPO = path.resolve(ROOT, "..");
const opt = (name) => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const COMMITS = (opt("commits") ?? "").split(",").filter(Boolean);
const LABELS = (opt("labels") ?? "").split(",").filter(Boolean);
const REPEAT = (opt("repeat") ?? "").split(",").filter(Boolean);
const RUNS = opt("runs") ?? "5";
if (!COMMITS.length || COMMITS.length !== LABELS.length) {
  console.error("Kullanım: --commits a,b,c --labels x,y,z [--repeat y] [--runs 5]");
  process.exit(2);
}
const WIN = process.platform === "win32";
const NPX = WIN ? "npx.cmd" : "npx";
const TMP = path.join(os.tmpdir(), "cortex-perf");

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: WIN, ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} → ${result.status}`);
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

function killTree(child) {
  if (!child?.pid) return;
  if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function cleanup(wt) {
  const app = path.join(wt, "cortex-plus");
  const link = path.join(app, "node_modules");
  try {
    if (fs.lstatSync(link).isSymbolicLink() || WIN) fs.rmdirSync(link); // yalnız bağlantı; hedefe dokunmaz
  } catch {}
  let stillLinked = false;
  try {
    stillLinked = fs.lstatSync(link).isSymbolicLink();
  } catch {}
  if (stillLinked) {
    console.error(`${link} bağlantısı kaldırılamadı; ana node_modules silinmesin diye worktree bırakıldı. Elle: rmdir, sonra git worktree remove.`);
    return;
  }
  fs.rmSync(path.join(app, ".env.local"), { force: true });
  spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: REPO, stdio: "inherit" });
}

const SERVER_ENV = { OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", RESEND_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };

fs.mkdirSync(TMP, { recursive: true });
for (let i = 0; i < COMMITS.length; i += 1) {
  const sha = COMMITS[i];
  const label = LABELS[i];
  const port = String(3101 + i);
  const wt = path.join(TMP, sha);
  const app = path.join(wt, "cortex-plus");
  let server;
  console.log(`\n== ${label} (${sha}) → http://127.0.0.1:${port}`);
  try {
    if (fs.existsSync(wt)) cleanup(wt);
    run("git", ["worktree", "add", "--detach", wt, sha], { cwd: REPO });
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(app, "node_modules"), "junction");
    fs.copyFileSync(path.join(ROOT, ".env.local"), path.join(app, ".env.local"));
    run(process.execPath, [path.join("scripts", "copy-pdf-worker.mjs")], { cwd: app, shell: false });
    run(NPX, ["next", "build"], {
      cwd: app,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=6144", SENTRY_AUTH_TOKEN: "", NEXT_TELEMETRY_DISABLED: "1" },
    });
    server = spawn(NPX, ["next", "start", "-p", port], { cwd: app, env: { ...process.env, ...SERVER_ENV }, stdio: "ignore", shell: WIN });
    if (!(await waitFor(`http://127.0.0.1:${port}/giris`, 180_000))) throw new Error("sunucu açılmadı");
    const labels = [label, ...(REPEAT.includes(label) ? [`${label}-tekrar`] : [])];
    for (const l of labels) {
      execFileSync(process.execPath, [path.join("scripts", "perf-measure.mjs"), "--base", `http://127.0.0.1:${port}`, "--label", l, "--runs", RUNS], {
        cwd: ROOT,
        stdio: "inherit",
      });
    }
  } catch (error) {
    console.error(`${label}: ${error.message}`);
  } finally {
    killTree(server);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    cleanup(wt);
  }
}
console.log("\nWorktree'ler ve sunucular kaldırıldı.");
