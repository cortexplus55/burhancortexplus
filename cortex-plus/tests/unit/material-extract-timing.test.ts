import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractOfficeText } from "@/lib/documents/extract-office-text";
import { extractText } from "@/lib/documents/extract-text";

const UPLOAD_DIR = "/home/ubuntu/.cursor/projects/workspace/uploads";

const OFFICE: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * Yerel çıkarım süresi. Görüntü OCR'u model çağrısıdır; bu testte çalışmaz.
 * Dosyalar CI'da yoksa test geçer ve süre yazmaz.
 */
describe("uploaded material extract timing", () => {
  it("measures text extraction for each attached file that has a text layer", async () => {
    if (!existsSync(UPLOAD_DIR)) {
      expect(true).toBe(true);
      return;
    }
    const files = readdirSync(UPLOAD_DIR).filter((name) => !name.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    const timings: { file: string; ms: number; chars: number; note: string }[] = [];
    for (const file of files) {
      const full = path.join(UPLOAD_DIR, file);
      const ext = path.extname(file).toLowerCase();
      const started = Date.now();
      if (ext === ".pdf") {
        const read = await extractText(readFileSync(full), "application/pdf");
        timings.push({
          file,
          ms: Date.now() - started,
          chars: read.pages.join("").length,
          note: read.ok ? "pdf-text" : "pdf-empty",
        });
      } else if (OFFICE[ext]) {
        const read = extractOfficeText(readFileSync(full), OFFICE[ext]);
        timings.push({
          file,
          ms: Date.now() - started,
          chars: read.pages.join("").length,
          note: read.ok ? ext.slice(1) : read.reason ?? "office-failed",
        });
      } else {
        timings.push({
          file,
          ms: Date.now() - started,
          chars: 0,
          note: "image-ocr-not-run",
        });
      }
    }
    console.info(`[material-timing] ${JSON.stringify(timings)}`);
    const textFiles = timings.filter((row) => row.note !== "image-ocr-not-run");
    expect(textFiles.every((row) => row.chars > 100)).toBe(true);
  });
});
