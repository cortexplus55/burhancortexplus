/**
 * Stage 10 quality-matrix probe — offline, no OpenAI / Supabase spend.
 *
 *   node cortex-plus/scripts/probe-pdf-learning-stage10.mjs
 *   node scripts/probe-pdf-learning-stage10.mjs
 *
 * Optional PDF path (text-layer extract only; OCR not claimed):
 *   node scripts/probe-pdf-learning-stage10.mjs ../../tmp/user-trigonometri.pdf
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const results = [];

function record(cell, status, detail = "") {
  results.push({ cell, status, detail });
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "○" : "✗";
  console.log(`${mark} [${status}] ${cell}${detail ? ` — ${detail}` : ""}`);
}

async function loadModules() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: join(root, "vitest.config.ts"),
    server: { middlewareMode: true },
  });
  try {
    const pageAnalysis = await server.ssrLoadModule("/src/lib/documents/page-analysis.ts");
    const topicMap = await server.ssrLoadModule("/src/lib/documents/topic-map.ts");
    const coverage = await server.ssrLoadModule("/src/lib/documents/coverage.ts");
    const validation = await server.ssrLoadModule(
      "/src/lib/learning/validation-pipeline.ts",
    );
    const tracking = await server.ssrLoadModule("/src/lib/learning/learning-tracking.ts");
    const lifecycle = await server.ssrLoadModule("/src/lib/learning/attempt-lifecycle.ts");
    return {
      pageAnalysis,
      topicMap,
      coverage,
      validation,
      tracking,
      lifecycle,
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

function subjectPages() {
  return {
    Math: ["Birim çember\nsin 90° = 1\ncos 0° = 1"],
    Physics: ["Newton kuvvet\nF = m a\nKinetik enerji örneği"],
    Chemistry: ["Mol ve Avogadro\nAsit-baz tepkimesi ve molekül."],
    Biology: ["Fotosentez\nKlorofil ve mitokondri ATP."],
    History: ["Osmanlı Devleti\nCumhuriyet inkılapları."],
    Geography: ["İklim ve harita\nYer şekilleri: plato, delta."],
    Turkish: ["Özne ve yüklem\nAnlatım bozukluğu, yazım kuralı."],
  };
}

async function main() {
  const mods = await loadModules();
  try {
    const { analyzePages } = mods.pageAnalysis;
    const { buildTopicMap } = mods.topicMap;
    const { buildCoverageReport } = mods.coverage;
    const {
      checkSimpleMathClaims,
      checkImpossiblePercentClaims,
      runIndependentValidation,
    } = mods.validation;
    const { buildLearningIndicators, extractAnswerEvidence, foldTopicMastery } =
      mods.tracking;
    const { isStaleWrite, mergeAnswersForScoring, isCreatingStale } = mods.lifecycle;

    // Document varieties
    {
      const analyses = analyzePages([
        "1. Derece ve radyan\n180 derece = π radyan.\nÖrnek: 90° = π/2 radyan.",
        "2. Birim çember\nsin θ = y, cos θ = x\nsin²θ + cos²θ = 1 kimliği.",
      ]);
      const map = buildTopicMap(analyses);
      const cov = buildCoverageReport(analyses, map.topics, map.mergedTitles);
      record(
        "doc/text-pdf",
        cov.status === "complete" && cov.uncoveredContentPages.length === 0
          ? "PASS"
          : "FAIL",
        `status=${cov.status} content=${cov.contentPages}`,
      );
    }
    {
      const [blank, thin] = analyzePages(["", "ab"]);
      record(
        "doc/scanned-ocr-gap",
        blank.pageKind === "blank" &&
          thin.pageKind === "unreadable" &&
          thin.extractionMethod === "none"
          ? "PASS"
          : "FAIL",
        "OCR not implemented — honest unreadable",
      );
    }
    {
      const [heavy] = analyzePages([
        "sin²θ+cos²θ=1\n√2/2\nπ/3\n∑x\n∫dx\ny=A sin(Bx)\nθ=90°",
      ]);
      record(
        "doc/formula-graph",
        heavy.formulas.length >= 4 &&
          heavy.uncertainRegions.some((r) => /görsel/i.test(r))
          ? "PASS"
          : "FAIL",
      );
    }
    {
      const [table] = analyzePages([
        "| açı | sin |\n| 30 | 1/2 |\n| 45 | √2/2 |",
      ]);
      record("doc/tables", table.tablesDetected >= 1 ? "PASS" : "FAIL");
    }
    {
      const pages = Array.from({ length: 40 }, (_, i) =>
        i === 0
          ? "KAPAK\nFizik\nISBN 1"
          : i === 39
            ? "CEVAP ANAHTARI\n1) 1"
            : `Newton kuvvet ve ivme örnek ${i}`,
      );
      const analyses = analyzePages(pages);
      const map = buildTopicMap(analyses);
      record(
        "doc/long-40",
        map.topics.some((t) => t.title === "Kuvvet ve hareket") ? "PASS" : "FAIL",
        `topics=${map.topics.length}`,
      );
    }
    record(
      "doc/multi-doc-product",
      "SKIP",
      "exam_preps.document_id is singular; unit concat only",
    );

    // Subjects
    for (const [name, pages] of Object.entries(subjectPages())) {
      const analyses = analyzePages(pages);
      const map = buildTopicMap(analyses);
      record(
        `subject/${name}`,
        map.topics.length > 0 ? "PASS" : "FAIL",
        map.topics.map((t) => t.title).join(", "),
      );
    }
    {
      const hits = [
        checkSimpleMathClaims("2+2=5").length > 0,
        checkImpossiblePercentClaims("yüzde 150").length > 0,
        runIndependentValidation({
          draft: "1 mol = 1 g",
          parsed: {
            questions: [
              { text: "Soru bir yeterince uzun", options: ["a", "b"] },
              { text: "Soru iki yeterince uzun", options: ["a", "b"] },
              { text: "Soru üç yeterince uzun", options: ["a", "b"] },
            ],
          },
          minItems: 3,
          pedagogyIssues: [],
        }).issues.some((i) => i.code === "unit_mismatch"),
      ];
      record(
        "subject/domain-validators",
        hits.every(Boolean) ? "PASS" : "FAIL",
        `math/percent/unit=${hits.join("/")}`,
      );
    }

    // Student / tracking
    {
      const evidence = extractAnswerEvidence({
        kind: "quiz",
        topicLabel: "Trigonometri",
        isFirstAttempt: true,
        answers: { "0": "wrong", "1": "ok" },
        hintsUsed: { "0": true },
        payload: {
          type: "quiz",
          questions: [
            {
              text: "q1",
              options: ["ok", "wrong"],
              correct: ["ok"],
              multi: false,
              learningObjective: "obj1 yeterince uzun",
            },
            {
              text: "q2",
              options: ["ok", "wrong"],
              correct: ["ok"],
              multi: false,
              learningObjective: "obj2 yeterince uzun",
            },
          ],
        },
      });
      const topics = foldTopicMastery(evidence);
      const ind = buildLearningIndicators({
        nodes: [
          { kind: "quiz", status: "done" },
          { kind: "quiz", status: "done" },
        ],
        topics,
        plannedTopicKeys: ["trigonometri"],
        openMisconceptions: 1,
      });
      record(
        "student/anti-100-readiness",
        ind.programProgress.pct === 100 &&
          !ind.examReadiness.claimFullyReady &&
          ind.examReadiness.pct < 100
          ? "PASS"
          : "FAIL",
        `prog=${ind.programProgress.pct} ready=${ind.examReadiness.pct}`,
      );
      record(
        "student/hint-not-independent",
        evidence[0].hintAssisted && !evidence[0].independentSuccess ? "PASS" : "FAIL",
      );
    }

    // Technical
    {
      const merged = mergeAnswersForScoring({ "0": "A" }, { "1": "B" });
      record(
        "tech/refresh-merge",
        merged["0"] === "A" && merged["1"] === "B" ? "PASS" : "FAIL",
      );
      record(
        "tech/two-tab-stale-version",
        isStaleWrite({
          attemptGenerationId: "g",
          requestGenerationId: "g",
          attemptVersion: 5,
          expectedVersion: 4,
        })
          ? "PASS"
          : "FAIL",
      );
      record(
        "tech/generation-timeout",
        isCreatingStale(new Date(Date.now() - 180_000).toISOString())
          ? "PASS"
          : "FAIL",
      );
    }

    // Optional live PDF text-layer probe
    const pdfArg = process.argv[2];
    if (pdfArg) {
      const pdfPath = resolve(pdfArg);
      if (!existsSync(pdfPath)) {
        record("doc/live-pdf", "SKIP", `missing ${pdfPath}`);
      } else {
        const { createServer } = await import("vite");
        const server = await createServer({
          configFile: join(root, "vitest.config.ts"),
          server: { middlewareMode: true },
        });
        try {
          const { extractText } = await server.ssrLoadModule(
            "/src/lib/documents/extract-text.ts",
          );
          const extracted = await extractText(
            readFileSync(pdfPath),
            "application/pdf",
          );
          // extractText returns { pages: string[]; ok: boolean }
          const pageTexts = Array.isArray(extracted?.pages)
            ? extracted.pages.map((p) => (typeof p === "string" ? p : p?.text ?? ""))
            : [];
          const analyses = analyzePages(pageTexts);
          const map = buildTopicMap(analyses);
          const cov = buildCoverageReport(analyses, map.topics, map.mergedTitles);
          record(
            "doc/live-pdf",
            pageTexts.some((p) => p.trim().length > 40) && map.topics.length > 0
              ? "PASS"
              : "FAIL",
            `pages=${pageTexts.length} topics=${map.topics.length} coverage=${cov.status} nonEmpty=${pageTexts.filter((p) => p.trim()).length}`,
          );
        } finally {
          await server.close();
        }
      }
    } else {
      record("doc/live-pdf", "SKIP", "pass a PDF path to exercise text-layer extract");
    }

    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const skip = results.filter((r) => r.status === "SKIP").length;
    console.log(`\nStage 10 probe: ${pass} pass, ${fail} fail, ${skip} skip`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await mods.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
