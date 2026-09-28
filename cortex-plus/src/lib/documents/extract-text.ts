import { pdfjsDocumentOptions } from "@/lib/documents/pdfjs-options";

/** pdfjs-dist 6 uses Promise.withResolvers (Node 22+); polyfill for Node 20 CI/runtimes. */
function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === "function") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).withResolvers = function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/** Read actual PDF page streams, including compressed text and embedded fonts. */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  startPage = 1,
  maxPages = Number.MAX_SAFE_INTEGER,
): Promise<{ pages: string[]; ok: boolean; total: number }> {
  if (mimeType === "text/plain") {
    const text = buffer.toString("utf8").replace(/\u0000/g, "");
    return { pages: startPage <= 1 ? [text] : [], ok: Boolean(text.trim()), total: 1 };
  }
  if (mimeType !== "application/pdf") return { pages: [], ok: false, total: 0 };

  ensurePromiseWithResolvers();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument(pdfjsDocumentOptions(new Uint8Array(buffer)));
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    const first = Math.max(1, Math.trunc(startPage));
    const last = Math.min(pdf.numPages, first + Math.max(0, Math.trunc(maxPages)) - 1);
    for (let number = first; number <= last; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) =>
        "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
      ).join("").replace(/\u0000/g, "").trim());
      page.cleanup();
    }
    return { pages, ok: pages.some((page) => Boolean(page.trim())), total: pdf.numPages };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password|PasswordException|encrypted/i.test(msg)) {
      throw new Error("encrypted_pdf");
    }
    throw err;
  } finally {
    await task.destroy();
  }
}

/**
 * Cheap preflight: page count + which pages lack a text layer.
 * No rendering, no model calls.
 *
 * `scannedPages` is an upper bound — truly blank pages are included here but
 * ingestion classifies them as blank and does not charge photo quota.
 */
export async function preflightPdfPages(buffer: Buffer): Promise<{
  pageCount: number;
  textPages: number;
  scannedPages: number;
}> {
  ensurePromiseWithResolvers();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument(pdfjsDocumentOptions(new Uint8Array(buffer)));
  try {
    const pdf = await task.promise;
    let textPages = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join("")
        .trim();
      if (text) textPages += 1;
      page.cleanup();
    }
    return {
      pageCount: pdf.numPages,
      textPages,
      scannedPages: Math.max(0, pdf.numPages - textPages),
    };
  } finally {
    await task.destroy();
  }
}
