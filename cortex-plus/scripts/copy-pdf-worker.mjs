/*
  pdf.js tarayıcı worker'ını public/ altına kopyalar.

  Neden: `DocumentPdfPreview` PDF'i istemcide çiziyor ve pdf.js v6 worker
  dosyasının adresini ister. Worker'ı `new URL(..., import.meta.url)` ile
  webpack'e vermek Next'te "ESM packages need to be imported" hatasıyla
  düşüyor; CDN ise CSP `worker-src 'self'` ile yasak. Kalan yol: dosyayı
  kurulumda public/'e koymak. Kurulu pdfjs-dist sürümüyle her zaman aynı
  kalsın diye elle kopyalanıp commit edilmez — `postinstall` üretir,
  `.gitignore` dışarıda tutar.
*/
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const dest = resolve(here, "../public/pdf.worker.min.mjs");

try {
  statSync(src);
} catch {
  console.error(`copy-pdf-worker: kaynak yok: ${src}`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`copy-pdf-worker: ${dest}`);
