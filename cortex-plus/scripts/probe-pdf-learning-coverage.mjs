/**
 * Offline smoke probe for Stage 2 coverage logic — no OpenAI, no Supabase.
 *
 * From repo root or cortex-plus:
 *   node cortex-plus/scripts/probe-pdf-learning-coverage.mjs
 *   node scripts/probe-pdf-learning-coverage.mjs
 *
 * Optional: pass a PDF path to print extracted page counts via pdfjs
 * (still no AI spend):
 *   node scripts/probe-pdf-learning-coverage.mjs ../../tmp/user-trigonometri.pdf
 */
import { createServer } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function loadModules() {
  // Prefer compiled-free TS via vitest/vite SSR when available.
  try {
    const { createServer } = await import("vite");
    const server = await createServer({
      configFile: join(root, "vitest.config.ts"),
      server: { middlewareMode: true },
    });
    try {
      const pageAnalysis = await server.ssrLoadModule(
        "/src/lib/documents/page-analysis.ts",
      );
      const topicMap = await server.ssrLoadModule(
        "/src/lib/documents/topic-map.ts",
      );
      const coverage = await server.ssrLoadModule(
        "/src/lib/documents/coverage.ts",
      );
      return { pageAnalysis, topicMap, coverage, close: () => server.close() };
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch {
    throw new Error(
      "Vite SSR load failed. Run unit tests instead: npm test -- pdf-learning-v2",
    );
  }
}

function fixturePages() {
  return [
    "KAPAK\nTrigonometri Ders Notları\nYazar: Cortex Plus\nISBN 978-0-000000-00-0\nYayınevi deneme baskısı",
    "İÇİNDEKİLER\n1. Derece ve radyan\n2. Birim çember\n3. İşaretler\n4. Kimlikler\n5. Grafikler\n6. Denklemler",
    "1. Derece ve radyan\n180 derece = π radyan.\nÖrnek: 90° = π/2",
    "2. Birim çember\nsin θ = y, cos θ = x\nsin²+cos²=1",
    "3. İşaretler ve bölgeler\nI +, II +-, III --, IV -+",
    "4. Trigonometrik kimlikler\nsin²θ + cos²θ = 1",
    "5. Trigonometrik grafikler\ny = sin x periyot 2π",
    "6. Trigonometrik denklemler\nsin θ = 1/2 çözümleri",
    "Alıştırma\nSoru 1) 120° hangi bölge?\nSoru 2) cos(120)=?",
    "CEVAP ANAHTARI\n1) II  2) -1/2  3) π/3  4) 60  5) −1/2  6) 180",
  ];
}

async function extractPdfPages(pdfPath) {
  const buffer = readFileSync(pdfPath);
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: join(root, "vitest.config.ts"),
    server: { middlewareMode: true },
  });
  try {
    const { extractText } = await server.ssrLoadModule(
      "/src/lib/documents/extract-text.ts",
    );
    const result = await extractText(buffer, "application/pdf");
    return result;
  } finally {
    await server.close();
  }
}

const mods = await loadModules();
try {
  const pdfArg = process.argv[2];
  let pages = fixturePages();
  let source = "fixture";

  if (pdfArg) {
    const pdfPath = resolve(pdfArg);
    if (!existsSync(pdfPath)) {
      console.error({ error: "pdf_not_found", pdfPath });
      process.exit(1);
    }
    const extracted = await extractPdfPages(pdfPath);
    pages = extracted.pages;
    source = pdfPath;
    console.log({
      stage: "extract",
      ok: extracted.ok,
      pageCount: pages.length,
      nonEmpty: pages.filter((p) => p.trim()).length,
    });
  }

  const analyses = mods.pageAnalysis.analyzePages(pages);
  const built = mods.topicMap.buildTopicMap(analyses);
  const report = mods.coverage.buildCoverageReport(
    analyses,
    built.topics,
    built.mergedTitles,
  );

  console.log({
    stage: "coverage",
    source,
    totalPages: report.totalPages,
    contentPages: report.contentPages,
    coveredPages: report.coveredPages,
    status: report.status,
    topics: built.topics.map((t) => ({
      title: t.title,
      pages: t.pageNumbers,
    })),
    skipped: report.skippedPages,
    unreadable: report.unreadablePages,
    uncovered: report.uncoveredContentPages,
    summary: report.summary,
  });

  if (report.status !== "complete" && !pdfArg) {
    process.exitCode = 2;
  }
} finally {
  await mods.close();
}
