import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Yol etkinliği hattının kaynakları (30 Ekim 2026, etkinlik başına modüllere bölme).
 *
 * Rota (`route.ts`) ve oturum ekranı (`exam-node-session.tsx`) eskiden tek dosyaydı; kaynak metnini okuyan bekçi
 * testler o dosyayı okuyordu. Bölmeden sonra aynı kurallar dosyanın kendisi + modül klasöründe durur. Bekçiler
 * `readSource` ile okur: bu iki dosyadan biri istenirse dosya ve modül klasöründeki her dosya (sıralı) birlikte
 * döner; başka her dosya `readFileSync(dosya, "utf8")` ile aynıdır. Kural değişmez, yalnız yeri.
 */
export const NODE_ROUTE_FILE = "src/app/api/learning/exam-prep/node/route.ts";
export const NODE_ROUTE_DIR = "src/lib/learning/node";
export const NODE_SESSION_FILE = "src/components/parity/exam-node-session.tsx";
export const NODE_SESSION_DIR = "src/components/parity/exam-node";

const GROUPS: Record<string, string> = {
  [NODE_ROUTE_FILE]: NODE_ROUTE_DIR,
  [NODE_SESSION_FILE]: NODE_SESSION_DIR,
};

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function groupKey(file: string, root: string): string | null {
  const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  return relative in GROUPS ? relative : null;
}

/** Bir grubun dosyaları: ana dosya önce, sonra modül klasörü (çalışma dizinine göreli, sıralı). */
export function sourceGroupFiles(file: string, root = process.cwd()): string[] {
  const key = groupKey(file, root);
  if (!key) return [file];
  const dir = path.join(root, GROUPS[key]!);
  return [key, ...listFiles(dir).map((full) => path.relative(root, full).split(path.sep).join("/"))];
}

/** Rota modülleri: `route.ts` + `src/lib/learning/node/**`. */
export function nodeRouteFiles(root = process.cwd()): string[] {
  return sourceGroupFiles(NODE_ROUTE_FILE, root);
}

/** `readFileSync(file, "utf8")` gibi; yol etkinliği dosyalarında bütün grup birlikte okunur. */
export function readSource(file: string, _encoding: BufferEncoding = "utf8"): string {
  const root = process.cwd();
  const key = groupKey(file, root);
  if (!key) return readFileSync(file, _encoding);
  return sourceGroupFiles(key, root)
    .map((item) => readFileSync(path.join(root, item), _encoding))
    .join("\n");
}
