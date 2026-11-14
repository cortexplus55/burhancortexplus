#!/usr/bin/env node
/**
 * Plan okuyan yerler (Faz 0, 14 Kasım 2026). Prompt 1 §2.3'teki desenleri `src/` altında tarar (fikstürler ve
 * testler hariç); her satırı türüne ve ilgili plana göre sınıflar. Yalnız okur.
 *
 *   node scripts/design/plan-scan.mjs --out docs/design-migration/data
 *
 * Çıktı: plan-okuyan-yerler.csv (her satır) ve plan-okuyan-yerler.json (özet + satırlar).
 * Sınıflama sezgiseldir; belgede (03) yöntem ve sınırları yazılı.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const PATTERN =
  /plan ===|plan ==|isPlus|isSigma|isFounder|isPremium|subscription|\btier\b|🔒|\bPLUS\b|FREE_LIMITS|\bdaily|\bmonthly|"\/pay|402|\blimit\b|quota|remaining/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "e2e" && dir.endsWith(path.join("src", "app")) ? [] : walk(p);
    return /\.(tsx?|mjs|js|sql)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

function kindOf(rel, line) {
  const t = line.trim();
  if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return "yorum";
  if (/\.limit\(|rateLimit|\blimit:\s*\d|p_limit|LIMIT \d|limit\s*=\s*\d|\bscope:/.test(line)) return "sorgu/hız sınırı (plan değil)";
  if (/dailyGoal|daily_goal|daily-drill|dailyDrill|study_reminder|daily-mails|monthlyRevenue/.test(line)) return "ilgisiz (günlük hedef, e-posta)";
  if (/\b402\b|status:\s*402|free_[a-z_]+_limit|premium_required|spend_cap|refusal/.test(line) || rel.startsWith("src/app/api/"))
    return "API zorlaması";
  if (/"\/pay|redirect\(/.test(line)) return "yönlendirme";
  if (/limit|quota|remaining|FREE_LIMITS|meter|daily|monthly/i.test(line)) return "limit";
  return rel.endsWith(".tsx") ? "görünüm" : "mantık";
}

function planOf(line) {
  const plans = [];
  if (/isAdmin|isFounder|founder|kurucu|billingExempt/i.test(line)) plans.push("Kurucu");
  if (/sigma/i.test(line)) plans.push("Sigma");
  if (/plus-haftalik|haftalik|week|Sınav Haftası/i.test(line)) plans.push("Sınav Haftası");
  if (/isPremium|isPlus|\bPLUS\b|plus|premium|subscription/i.test(line)) plans.push("Plus/ücretli");
  if (/free|ücretsiz|showsUpgradeChrome|guest|misafir/i.test(line)) plans.push("Ücretsiz");
  return plans.length ? plans.join("+") : "belirsiz";
}

const rows = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replaceAll("\\", "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!PATTERN.test(line)) return;
    rows.push({ file: rel, line: i + 1, kind: kindOf(rel, line), plan: planOf(line), text: line.trim().slice(0, 180) });
  });
}

const by = (key) => rows.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] ?? 0) + 1), acc), {});
const files = Object.entries(rows.reduce((acc, r) => ((acc[r.file] = (acc[r.file] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
const summary = { rows: rows.length, files: files.length, byKind: by("kind"), byPlan: by("plan"), topFiles: files.slice(0, 40) };

const i = process.argv.indexOf("--out");
const outDir = i > 0 ? process.argv[i + 1] : null;
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
  fs.writeFileSync(
    path.join(outDir, "plan-okuyan-yerler.csv"),
    ["dosya,satir,tur,plan,metin", ...rows.map((r) => [r.file, r.line, r.kind, r.plan, r.text].map(esc).join(","))].join("\n"),
  );
  fs.writeFileSync(path.join(outDir, "plan-okuyan-yerler.json"), JSON.stringify({ summary, rows }, null, 1));
}
console.log(JSON.stringify(summary, null, 1));
