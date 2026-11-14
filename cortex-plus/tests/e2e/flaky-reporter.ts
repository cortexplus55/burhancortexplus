import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Kararsız test listesi (15 Kasım 2026). CI'da her test bir kez yeniden denenir (`retries: 1`); ilk denemede düşüp
 * ikincide geçen test "flaky" sayılır ve iş yeşil kalsa da bu listeye yazılır: `test-results/flaky.md` ve GitHub iş
 * özeti. Liste boşsa da dosya yazılır ("yok"). Yeniden denemede de düşen test zaten işi kırmızı yapar.
 */
export default class FlakyReporter implements Reporter {
  private readonly flaky = new Map<string, { title: string; file: string; error: string }>();

  onTestEnd(test: TestCase, result: TestResult): void {
    if (test.outcome() !== "flaky" || this.flaky.has(test.id)) return;
    const first = test.results.find((item) => item.status !== "passed" && item.status !== "skipped") ?? result;
    const message = (first.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0]?.slice(0, 200) ?? "";
    this.flaky.set(test.id, {
      // Başlık zinciri dosya adından sonrası (proje ve dosya adı yol sütununda zaten var).
      title: test.titlePath().slice(test.titlePath().indexOf(path.basename(test.location.file)) + 1).join(" › ") || test.title,
      file: `${path.relative(process.cwd(), test.location.file).replace(/\\/g, "/")}:${test.location.line}`,
      error: message,
    });
  }

  onEnd(result: FullResult): void {
    const rows = [...this.flaky.values()];
    const lines = [
      "## Kararsız testler (ilk denemede düşüp yeniden denemede geçen)",
      "",
      rows.length
        ? `${rows.length} test. Sonuç: ${result.status}.`
        : `Yok. Sonuç: ${result.status}.`,
      "",
      ...rows.map((row) => `- \`${row.file}\` ${row.title}${row.error ? ` — ${row.error}` : ""}`),
      "",
    ].join("\n");
    try {
      mkdirSync("test-results", { recursive: true });
      writeFileSync(path.join("test-results", "flaky.md"), lines);
    } catch {
      /* rapor yazılamazsa test sonucu değişmez */
    }
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      try {
        appendFileSync(summary, `${lines}\n`);
      } catch {
        /* iş özeti yoksa sessiz */
      }
    }
  }

  printsToStdio(): boolean {
    return false;
  }
}
